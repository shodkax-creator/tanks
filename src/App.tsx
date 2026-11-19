import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppScreen,
  Direction,
  FIXED_DT,
  GameMode,
  GameState,
  PlayerTank,
  RoomStatePayload,
  RoomSummary,
  WORLD_SIZE,
} from './game/types.ts';
import { TOTAL_STAGES, getStageDef } from './game/levels.ts';
import { createGameState, stepGameState } from './game/simulation.ts';
import { TankRenderer } from './game/renderer.ts';
import { soundEngine } from './game/sound.ts';
import { MultiplayerClient } from './game/netClient.ts';
import { TitleScreen } from './components/TitleScreen.tsx';
import { StageSelectModal } from './components/StageSelectModal.tsx';
import { MultiplayerLobby } from './components/MultiplayerLobby.tsx';
import { DesktopSideHud, HudSnapshot, MobileTopHud } from './components/GameHud.tsx';
import { TouchControls } from './components/TouchControls.tsx';
import { EndGameModal, PauseModal } from './components/GameModals.tsx';

function makeHudSnapshot(state: GameState): HudSnapshot {
  const p1 = state.players[0];
  const p2 = state.players[1];
  return {
    stage: state.stage,
    stageName: getStageDef(state.stage).name,
    enemiesRemaining: state.enemiesRemaining,
    activeEnemies: state.enemies.length,
    p1Lives: p1?.lives ?? 0,
    p1Tier: p1?.tier ?? 0,
    p1Score: p1?.score ?? 0,
    p1Boat: p1?.hasBoat ?? false,
    p2Present: Boolean(p2),
    p2Lives: p2?.lives ?? 0,
    p2Tier: p2?.tier ?? 0,
    p2Score: p2?.score ?? 0,
    p2Boat: p2?.hasBoat ?? false,
    fortressTimer: state.fortressTimer,
    freezeTimer: state.freezeTimer,
  };
}

function readHighScore(): number {
  try {
    return Number(localStorage.getItem('tanks1990_hi') || 20000) || 20000;
  } catch {
    return 20000;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem('tanks1990_hi', String(score));
  } catch {
    // Ignore storage error
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageSlotRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<TankRenderer>(new TankRenderer());
  const netRef = useRef<MultiplayerClient | null>(null);

  // Core simulation refs (decoupled from 60Hz React state updates)
  const simStateRef = useRef<GameState>(createGameState({ stage: 1, playerCount: 1 }));
  const screenRef = useRef<AppScreen>('title');
  const modeRef = useRef<GameMode>('single');
  const localSeqRef = useRef<number>(0);
  const lastHudKeyRef = useRef<string>('');
  const [canvasBoxSize, setCanvasBoxSize] = useState<number>(416);

  // Unified Keyboard + Touch input state
  const heldKeysRef = useRef<Set<string>>(new Set());
  const p1DirStackRef = useRef<Direction[]>([]);
  const p2DirStackRef = useRef<Direction[]>([]);
  const touchDirRef = useRef<Direction | null>(null);
  const touchFireRef = useRef<boolean>(false);

  // UI React state (discrete transitions only)
  const [screen, setScreen] = useState<AppScreen>('title');
  const [mode, setMode] = useState<GameMode>('single');
  const [selectedStage, setSelectedStage] = useState<number>(1);
  const [stageSelectOpen, setStageSelectOpen] = useState<boolean>(false);
  const [mpLobbyOpen, setMpLobbyOpen] = useState<boolean>(false);
  const [initialRoomCode, setInitialRoomCode] = useState<string>('');
  const [highScore, setHighScore] = useState<number>(readHighScore);
  const [muted, setMuted] = useState<boolean>(false);
  const [hud, setHud] = useState<HudSnapshot>(() => makeHudSnapshot(simStateRef.current));
  const [endSnapshot, setEndSnapshot] = useState<{
    outcome: 'stage_clear' | 'game_over';
    stage: number;
    eagleAlive: boolean;
    players: PlayerTank[];
  } | null>(null);

  // Exact 1:1 square canvas container sizing via ResizeObserver
  useEffect(() => {
    const el = stageSlotRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const sq = Math.max(220, Math.floor(Math.min(rect.width, rect.height)));
      setCanvasBoxSize((prev) => (prev === sq ? prev : sq));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen]);

  // Unlock Web Audio strictly on first real user gesture (eliminates autoplay warnings)
  useEffect(() => {
    const unlock = () => {
      soundEngine.unlockFromGesture();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Multiplayer Lobby React state
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [rttMs, setRttMs] = useState<number>(0);
  const [roomsList, setRoomsList] = useState<RoomSummary[]>([]);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);

  // Sync document.body.dataset.state cleanly
  useEffect(() => {
    screenRef.current = screen;
    const mapped =
      screen === 'stage_clear'
        ? 'gameover'
        : screen;
    document.body.dataset.state = mapped;
  }, [screen]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const clearInputs = useCallback(() => {
    heldKeysRef.current.clear();
    p1DirStackRef.current = [];
    p2DirStackRef.current = [];
    touchDirRef.current = null;
    touchFireRef.current = false;
  }, []);

  const updateHighScoreIfNeeded = useCallback((state: GameState) => {
    const total = state.players.reduce((s, p) => s + p.score, 0);
    setHighScore((prev) => {
      if (total > prev) {
        saveHighScore(total);
        return total;
      }
      return prev;
    });
  }, []);

  // Initialize Multiplayer WebSocket Client once
  useEffect(() => {
    const client = new MultiplayerClient({
      onConnectionChange: (conn) => setWsConnected(conn),
      onRoomsList: (list) => setRoomsList(list),
      onRoomJoined: (playerId, _slot, room) => {
        setMyPlayerId(playerId);
        setRoomState(room);
        setMpError(null);
      },
      onRoomUpdated: (room) => {
        setRoomState(room);
      },
      onRoomError: (msg) => {
        setMpError(msg);
      },
      onGameStarted: (state) => {
        simStateRef.current = state;
        rendererRef.current.resetEffects();
        clearInputs();
        setMode('online');
        modeRef.current = 'online';
        setMpLobbyOpen(false);
        setStageSelectOpen(false);
        setEndSnapshot(null);
        setHud(makeHudSnapshot(state));
        setScreen('playing');
        screenRef.current = 'playing';
        soundEngine.unlock();
        soundEngine.playStageStart();
      },
      onPingUpdate: (ms) => setRttMs(ms),
      onEvents: (events) => {
        rendererRef.current.consumeEvents(events);
        soundEngine.playEvents(events);
      },
    });
    netRef.current = client;

    return () => {
      client.disconnect();
    };
  }, [clearInputs]);

  const startLocalGame = useCallback(
    (stageNum: number, nextMode: 'single' | 'local2p', carryOverPlayers?: PlayerTank[]) => {
      const clamped = ((stageNum - 1) % TOTAL_STAGES + TOTAL_STAGES) % TOTAL_STAGES + 1;
      const newState = createGameState({
        stage: clamped,
        playerCount: nextMode === 'local2p' ? 2 : 1,
        playerNames: ['Игрок 1', 'Игрок 2'],
        carryOverPlayers,
      });
      simStateRef.current = newState;
      rendererRef.current.resetEffects();
      clearInputs();
      localSeqRef.current = 0;

      setSelectedStage(clamped);
      setMode(nextMode);
      modeRef.current = nextMode;
      setStageSelectOpen(false);
      setMpLobbyOpen(false);
      setEndSnapshot(null);
      setHud(makeHudSnapshot(newState));
      setScreen('playing');
      screenRef.current = 'playing';
      document.body.dataset.state = 'playing';

      soundEngine.unlock();
      soundEngine.playStageStart();
    },
    [clearInputs]
  );

  // Check URL query params (?autostart=1 and ?room=XXXX) on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const stageParam = Number(params.get('stage') || '1') || 1;
      startLocalGame(stageParam, 'single');
      return;
    }
    const roomParam = params.get('room');
    if (roomParam) {
      setInitialRoomCode(roomParam.toUpperCase());
      setMpLobbyOpen(true);
      netRef.current?.connect();
    }
  }, [startLocalGame]);

  const handleOpenMultiplayer = useCallback(() => {
    soundEngine.unlock();
    setMpError(null);
    setMpLobbyOpen(true);
    netRef.current?.connect();
    netRef.current?.requestRooms();
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleTogglePause = useCallback(() => {
    if (screenRef.current === 'playing') {
      clearInputs();
      setScreen('paused');
    } else if (screenRef.current === 'paused') {
      clearInputs();
      setScreen('playing');
    }
  }, [clearInputs]);

  const handleRestartStage = useCallback(() => {
    if (modeRef.current === 'online') {
      netRef.current?.restartGame();
      return;
    }
    startLocalGame(simStateRef.current.stage, modeRef.current === 'local2p' ? 'local2p' : 'single');
  }, [startLocalGame]);

  const handleNextStage = useCallback(() => {
    if (modeRef.current === 'online') {
      netRef.current?.nextStage();
      return;
    }
    const nextSt = simStateRef.current.stage >= TOTAL_STAGES ? 1 : simStateRef.current.stage + 1;
    startLocalGame(
      nextSt,
      modeRef.current === 'local2p' ? 'local2p' : 'single',
      simStateRef.current.players
    );
  }, [startLocalGame]);

  const handleExitToTitle = useCallback(() => {
    if (modeRef.current === 'online') {
      netRef.current?.leaveRoom();
      setRoomState(null);
      setMyPlayerId(null);
    }
    clearInputs();
    setEndSnapshot(null);
    setStageSelectOpen(false);
    setMpLobbyOpen(false);
    setMode('single');
    modeRef.current = 'single';
    simStateRef.current = createGameState({ stage: selectedStage, playerCount: 1 });
    rendererRef.current.resetEffects();
    setScreen('title');
  }, [clearInputs, selectedStage]);

  // Unified Keyboard Input Listeners on window
  useEffect(() => {
    const keyToP1Dir = (code: string, isLocal2P: boolean): Direction | null => {
      if (code === 'KeyW') return Direction.UP;
      if (code === 'KeyS') return Direction.DOWN;
      if (code === 'KeyA') return Direction.LEFT;
      if (code === 'KeyD') return Direction.RIGHT;
      if (!isLocal2P) {
        if (code === 'ArrowUp') return Direction.UP;
        if (code === 'ArrowDown') return Direction.DOWN;
        if (code === 'ArrowLeft') return Direction.LEFT;
        if (code === 'ArrowRight') return Direction.RIGHT;
      }
      return null;
    };

    const keyToP2Dir = (code: string): Direction | null => {
      if (code === 'ArrowUp') return Direction.UP;
      if (code === 'ArrowDown') return Direction.DOWN;
      if (code === 'ArrowLeft') return Direction.LEFT;
      if (code === 'ArrowRight') return Direction.RIGHT;
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
      if (isTextInput) return;

      // Global shortcuts
      if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (screenRef.current === 'title' && !stageSelectOpen && !mpLobbyOpen) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startLocalGame(selectedStage, 'single');
          return;
        }
      }

      if (screenRef.current === 'playing' || screenRef.current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          handleTogglePause();
          return;
        }
        if (e.code === 'KeyR' && screenRef.current === 'playing') {
          e.preventDefault();
          handleRestartStage();
          return;
        }
      }

      if (screenRef.current !== 'playing') return;

      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space'
      ) {
        e.preventDefault();
      }

      heldKeysRef.current.add(e.code);
      const isLocal2P = modeRef.current === 'local2p';

      const d1 = keyToP1Dir(e.code, isLocal2P);
      if (d1 !== null) {
        p1DirStackRef.current = [d1, ...p1DirStackRef.current.filter((d) => d !== d1)];
      }
      if (isLocal2P) {
        const d2 = keyToP2Dir(e.code);
        if (d2 !== null) {
          p2DirStackRef.current = [d2, ...p2DirStackRef.current.filter((d) => d !== d2)];
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
      const isLocal2P = modeRef.current === 'local2p';
      const d1 = keyToP1Dir(e.code, isLocal2P);
      if (d1 !== null) {
        p1DirStackRef.current = p1DirStackRef.current.filter((d) => d !== d1);
      }
      const d2 = keyToP2Dir(e.code);
      if (d2 !== null) {
        p2DirStackRef.current = p2DirStackRef.current.filter((d) => d !== d2);
      }
    };

    const onBlur = () => {
      clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
    };
  }, [
    clearInputs,
    handleRestartStage,
    handleToggleMute,
    handleTogglePause,
    mpLobbyOpen,
    selectedStage,
    stageSelectOpen,
    startLocalGame,
  ]);

  // Isolated 60Hz Fixed-Timestep Simulation + Render Loop (mounted once!)
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;

    // Attract-mode autonomous showcase on title screen
    let attractTimer = 0;
    let attractDir: Direction = Direction.UP;

    const frame = (now: number) => {
      rafId = window.requestAnimationFrame(frame);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const renderer = rendererRef.current;
      renderer.updateEffects(dt);

      const curScreen = screenRef.current;
      const curMode = modeRef.current;

      // Skip sim advancement during hitstop (visuals/shake still update smoothly!)
      const simDt = renderer.hitstopTimer > 0 ? 0 : dt;
      accumulator += simDt;

      let activeState: GameState | null = simStateRef.current;
      let visualOffsets: Record<string, { x: number; y: number }> | undefined;

      if (curScreen === 'title') {
        // Calm live attract-mode background simulation (player invulnerable, ambient tank patrol)
        while (accumulator >= FIXED_DT) {
          accumulator -= FIXED_DT;
          attractTimer += FIXED_DT;
          const st = simStateRef.current;
          if (st.players[0]) {
            st.players[0].shieldTimer = 2.0;
          }
          if (attractTimer > 1.4) {
            attractTimer = 0;
            attractDir = ((attractDir + 1) % 4) as Direction;
          }
          const evs = stepGameState(
            st,
            { p1: { seq: st.tick + 1, dir: attractDir, fire: st.tick % 45 === 0 } },
            FIXED_DT
          );
          renderer.consumeEvents(evs);
          if (st.status !== 'playing') {
            simStateRef.current = createGameState({ stage: st.stage, playerCount: 1 });
          }
        }
        activeState = simStateRef.current;
      } else if (curScreen === 'playing' || curScreen === 'paused') {
        const readP1Input = (): { dir: Direction | null; fire: boolean } => {
          const dir = touchDirRef.current ?? p1DirStackRef.current[0] ?? null;
          const keys = heldKeysRef.current;
          const fire =
            touchFireRef.current ||
            keys.has('Space') ||
            keys.has('KeyJ') ||
            (curMode !== 'local2p' && keys.has('Enter'));
          return { dir, fire };
        };

        if (curMode === 'online') {
          const net = netRef.current;
          while (accumulator >= FIXED_DT) {
            accumulator -= FIXED_DT;
            if (net) {
              const p1In = curScreen === 'playing' ? readP1Input() : { dir: null, fire: false };
              const localEvs = net.stepLocalInput(p1In.dir, p1In.fire);
              if (localEvs.length > 0) {
                renderer.consumeEvents(localEvs);
                soundEngine.playEvents(localEvs);
              }
            }
          }
          if (net) {
            const res = net.getRenderState(dt);
            if (res.state) {
              activeState = res.state;
              simStateRef.current = res.state;
            }
            visualOffsets = res.visualOffsets;
          }
        } else if (curScreen === 'playing') {
          // Local Single-Player or Local 2-Player 60Hz deterministic engine
          while (accumulator >= FIXED_DT) {
            accumulator -= FIXED_DT;
            localSeqRef.current += 1;
            const p1In = readP1Input();
            const inputs: Record<string, { seq: number; dir: Direction | null; fire: boolean }> = {
              p1: { seq: localSeqRef.current, dir: p1In.dir, fire: p1In.fire },
            };
            if (curMode === 'local2p') {
              const keys = heldKeysRef.current;
              inputs.p2 = {
                seq: localSeqRef.current,
                dir: p2DirStackRef.current[0] ?? null,
                fire: keys.has('Enter') || keys.has('Numpad0') || keys.has('ShiftRight'),
              };
            }
            const evs = stepGameState(simStateRef.current, inputs, FIXED_DT);
            if (evs.length > 0) {
              renderer.consumeEvents(evs);
              soundEngine.playEvents(evs);
            }
          }
          activeState = simStateRef.current;
        } else {
          accumulator = 0;
        }

        // Check stage_clear / game_over transition after brief final beat
        if (
          activeState &&
          curScreen === 'playing' &&
          activeState.status !== 'playing' &&
          activeState.statusDelay <= 0
        ) {
          const outcome = activeState.status;
          updateHighScoreIfNeeded(activeState);
          setEndSnapshot({
            outcome,
            stage: activeState.stage,
            eagleAlive: activeState.eagleAlive,
            players: activeState.players.map((p) => ({ ...p, kills: { ...p.kills } })),
          });
          setHud(makeHudSnapshot(activeState));
          setScreen(outcome === 'stage_clear' ? 'stage_clear' : 'gameover');
        }

        // Discrete HUD sync — only triggers React render when visible integers actually change!
        if (activeState) {
          const snap = makeHudSnapshot(activeState);
          const key = `${snap.stage}|${snap.enemiesRemaining}|${snap.activeEnemies}|${snap.p1Lives}|${snap.p1Tier}|${snap.p1Score}|${snap.p2Lives}|${snap.p2Tier}|${snap.p2Score}|${Math.ceil(snap.fortressTimer)}|${Math.ceil(snap.freezeTimer)}`;
          if (key !== lastHudKeyRef.current) {
            lastHudKeyRef.current = key;
            setHud(snap);
          }
        }
      } else {
        accumulator = 0;
      }

      // Render crisp 416x416 battlefield onto Canvas2D
      const canvas = canvasRef.current;
      if (canvas && activeState) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderer.render(ctx, activeState, visualOffsets);
        }
      }
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [updateHighScoreIfNeeded]);

  const isGameplayVisible = screen !== 'title';

  return (
    <div className="w-full h-[100dvh] bg-[#0e1014] text-zinc-100 flex flex-col overflow-hidden relative">
      {/* Mobile Top HUD (compact <= 52px, visible during play on < lg) */}
      {isGameplayVisible && (
        <MobileTopHud
          hud={hud}
          mode={mode}
          rttMs={rttMs}
          roomCode={roomState?.code ?? null}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handleTogglePause}
          onRestart={handleRestartStage}
        />
      )}

      {/* Main Game Viewport Container */}
      <main className="flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4 lg:p-6 relative">
        <div
          className={`flex items-center justify-center gap-4 h-full max-h-full w-full ${
            isGameplayVisible ? 'max-w-[1060px]' : 'max-w-[820px]'
          }`}
        >
          {/* Isolated Canvas Wrapper (exact pixel-perfect 1:1 square via ResizeObserver) */}
          <div
            ref={stageSlotRef}
            className="flex-1 min-w-0 min-h-0 h-full w-full flex items-center justify-center"
          >
            <div
              className={`relative border-2 ${
                isGameplayVisible
                  ? 'border-zinc-600 bg-[#090b0f]'
                  : 'border-zinc-800/70 opacity-35'
              }`}
              style={{
                width: `${canvasBoxSize}px`,
                height: `${canvasBoxSize}px`,
              }}
            >
              <canvas
                ref={canvasRef}
                data-testid="game-canvas"
                width={WORLD_SIZE}
                height={WORLD_SIZE}
                className="w-full h-full block pixel-crisp"
              />
            </div>
          </div>

          {/* Desktop Classic Right-Hand Battle City Side Dock */}
          {isGameplayVisible && (
            <div style={{ height: `${canvasBoxSize}px` }} className="hidden lg:flex">
              <DesktopSideHud
                hud={hud}
                mode={mode}
                rttMs={rttMs}
                roomCode={roomState?.code ?? null}
                muted={muted}
                onToggleMute={handleToggleMute}
                onPause={handleTogglePause}
                onRestart={handleRestartStage}
              />
            </div>
          )}
        </div>
      </main>

      {/* Mobile / Tablet Ergonomic Bottom Gamepad Deck (never overlaps the battlefield!) */}
      {isGameplayVisible && (
        <TouchControls
          onDirectionChange={(d) => {
            touchDirRef.current = d;
          }}
          onFireChange={(f) => {
            touchFireRef.current = f;
          }}
        />
      )}

      {/* Title Screen Overlay */}
      {screen === 'title' && (
        <TitleScreen
          selectedStage={selectedStage}
          stageName={getStageDef(selectedStage).name}
          highScore={highScore}
          muted={muted}
          onStartSingle={() => startLocalGame(selectedStage, 'single')}
          onStartLocal2P={() => startLocalGame(selectedStage, 'local2p')}
          onOpenMultiplayer={handleOpenMultiplayer}
          onOpenStageSelect={() => setStageSelectOpen(true)}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* 35-Stage Selector Modal */}
      {stageSelectOpen && (
        <StageSelectModal
          selectedStage={selectedStage}
          onSelectStage={(st) => {
            setSelectedStage(st);
            if (screen === 'title') {
              simStateRef.current = createGameState({ stage: st, playerCount: 1 });
            }
          }}
          onLaunchStage={(st) => startLocalGame(st, 'single')}
          onClose={() => setStageSelectOpen(false)}
        />
      )}

      {/* Real WebSocket Multiplayer Lobby Modal */}
      {mpLobbyOpen && (
        <MultiplayerLobby
          connected={wsConnected}
          rttMs={rttMs}
          room={roomState}
          playerId={myPlayerId}
          roomsList={roomsList}
          errorMessage={mpError}
          defaultStage={selectedStage}
          initialJoinCode={initialRoomCode}
          onCreateRoom={(name, st, ff) => netRef.current?.createRoom(name, st, ff)}
          onJoinRoom={(code, name) => netRef.current?.joinRoom(code, name)}
          onLeaveRoom={() => {
            netRef.current?.leaveRoom();
            setRoomState(null);
            setMyPlayerId(null);
          }}
          onRefreshRooms={() => netRef.current?.requestRooms()}
          onUpdateRoom={(st, ff) => netRef.current?.updateRoom(st, ff)}
          onStartGame={() => netRef.current?.startGame()}
          onClose={() => setMpLobbyOpen(false)}
        />
      )}

      {/* Pause Modal */}
      {screen === 'paused' && (
        <PauseModal
          stage={hud.stage}
          mode={mode}
          onResume={handleTogglePause}
          onRestart={handleRestartStage}
          onExitToTitle={handleExitToTitle}
        />
      )}

      {/* Stage Clear / Game Over Modal */}
      {(screen === 'stage_clear' || screen === 'gameover') && endSnapshot && (
        <EndGameModal
          outcome={endSnapshot.outcome}
          stage={endSnapshot.stage}
          eagleAlive={endSnapshot.eagleAlive}
          players={endSnapshot.players}
          highScore={highScore}
          onNextStage={handleNextStage}
          onRetry={handleRestartStage}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </div>
  );
}

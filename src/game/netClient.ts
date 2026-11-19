import {
  ClientWsMessage,
  Direction,
  FIXED_DT,
  GameState,
  PlayerInput,
  RoomStatePayload,
  RoomSummary,
  ServerWsMessage,
  SimEvent,
} from './types.ts';
import {
  cloneGameState,
  reconcileClientState,
  stepPlayerInput,
} from './simulation.ts';

interface EntitySample {
  t: number;
  x: number;
  y: number;
}

export interface NetClientCallbacks {
  onConnectionChange: (connected: boolean) => void;
  onRoomsList: (rooms: RoomSummary[]) => void;
  onRoomJoined: (playerId: string, slot: 1 | 2, room: RoomStatePayload) => void;
  onRoomUpdated: (room: RoomStatePayload) => void;
  onRoomError: (message: string) => void;
  onGameStarted: (state: GameState) => void;
  onPingUpdate: (rttMs: number) => void;
  onEvents: (events: SimEvent[]) => void;
}

/**
 * Low-latency WebSocket Multiplayer Client with:
 * 1. Client-Side Prediction (CSP): Local tank movement & shots simulate immediately at 0ms.
 * 2. Input History + Server Reconciliation: Replays unacked inputs on top of server snapshots.
 * 3. Smooth Visual Error Damping: Exponentially blends any tiny collision correction over ~75ms.
 * 4. Remote Entity Interpolation: Smoothly interpolates remote players & enemy tanks between
 *    server snapshots so remote movement stays silky even on 80-200ms ping!
 */
export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: NetClientCallbacks;
  private pingTimer: number | null = null;

  public connected = false;
  public playerId: string | null = null;
  public slot: 1 | 2 | null = null;
  public room: RoomStatePayload | null = null;
  public rttMs = 0;

  private seq = 0;
  private pendingInputs: PlayerInput[] = [];
  private predictedState: GameState | null = null;

  // Exponentially damped visual correction offsets for local player
  private localErrorX = 0;
  private localErrorY = 0;

  // Smooth interpolation buffers for remote entities (remote player & enemies)
  private remoteSamples = new Map<string, EntitySample[]>();
  private readonly INTERP_DELAY_MS = 55;

  constructor(callbacks: NetClientCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.callbacks.onConnectionChange(true);
      this.send({ type: 'list_rooms' });
      this.send({ type: 'ping', t: performance.now() });
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping', t: performance.now() });
        }
      }, 2000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerWsMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore malformed packets
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.callbacks.onConnectionChange(false);
      if (this.pingTimer !== null) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    };

    ws.onerror = () => {
      // onclose handles state transition cleanly
    };
  }

  public disconnect(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.playerId = null;
    this.slot = null;
    this.room = null;
    this.predictedState = null;
    this.pendingInputs = [];
    this.remoteSamples.clear();
  }

  public send(msg: ClientWsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public requestRooms(): void {
    this.send({ type: 'list_rooms' });
  }

  public createRoom(name: string, stage: number, friendlyFire: boolean): void {
    this.send({ type: 'create_room', name, stage, friendlyFire });
  }

  public joinRoom(code: string, name: string): void {
    this.send({ type: 'join_room', code: code.trim().toUpperCase(), name });
  }

  public leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.room = null;
    this.playerId = null;
    this.slot = null;
    this.predictedState = null;
    this.pendingInputs = [];
    this.remoteSamples.clear();
  }

  public updateRoom(stage?: number, friendlyFire?: boolean): void {
    this.send({ type: 'update_room', stage, friendlyFire });
  }

  public startGame(): void {
    this.send({ type: 'start_game' });
  }

  public nextStage(): void {
    this.send({ type: 'next_stage' });
  }

  public restartGame(): void {
    this.send({ type: 'restart_game' });
  }

  /**
   * Called at fixed 60 Hz during active online gameplay:
   * Immediately predicts local player movement & firing at 0ms latency
   * and transmits the sequenced input to the authoritative server.
   */
  public stepLocalInput(dir: Direction | null, fire: boolean): SimEvent[] {
    if (!this.predictedState || !this.playerId) return [];

    this.seq += 1;
    const input: PlayerInput = { seq: this.seq, dir, fire };
    this.pendingInputs.push(input);
    // Keep buffer bounded in case of extreme stall
    if (this.pendingInputs.length > 90) {
      this.pendingInputs.shift();
    }

    const localEvents: SimEvent[] = [];
    const bullet = stepPlayerInput(
      this.predictedState,
      this.playerId,
      input,
      FIXED_DT,
      true
    );
    if (bullet) {
      localEvents.push({ type: 'shoot', x: bullet.x, y: bullet.y });
    }

    // Advance predicted bullets locally between snapshots for crisp shot visuals
    for (const b of this.predictedState.bullets) {
      if (b.predicted) {
        if (b.dir === Direction.UP) b.y -= b.speed * FIXED_DT;
        else if (b.dir === Direction.DOWN) b.y += b.speed * FIXED_DT;
        else if (b.dir === Direction.LEFT) b.x -= b.speed * FIXED_DT;
        else if (b.dir === Direction.RIGHT) b.x += b.speed * FIXED_DT;
      }
    }

    this.send({ type: 'input', seq: input.seq, dir: input.dir, fire: input.fire });
    return localEvents;
  }

  /**
   * Damps visual reconciliation error and computes smooth interpolated offsets
   * for remote players and enemy tanks.
   */
  public getRenderState(dt: number): {
    state: GameState | null;
    visualOffsets: Record<string, { x: number; y: number }>;
  } {
    const decay = Math.exp(-dt * 18); // ~75ms smooth settling
    this.localErrorX *= decay;
    this.localErrorY *= decay;
    if (Math.abs(this.localErrorX) < 0.05) this.localErrorX = 0;
    if (Math.abs(this.localErrorY) < 0.05) this.localErrorY = 0;

    const visualOffsets: Record<string, { x: number; y: number }> = {};
    if (this.playerId) {
      visualOffsets[this.playerId] = { x: this.localErrorX, y: this.localErrorY };
    }

    if (!this.predictedState) {
      return { state: null, visualOffsets };
    }

    // Interpolate remote player & enemies smoothly
    const renderTime = performance.now() - this.INTERP_DELAY_MS;
    const computeOffset = (key: string, authX: number, authY: number) => {
      const samples = this.remoteSamples.get(key);
      if (!samples || samples.length < 2) return;

      // Find surrounding pair of samples around renderTime
      let older = samples[0];
      let newer = samples[samples.length - 1];
      for (let i = 0; i < samples.length - 1; i++) {
        if (samples[i].t <= renderTime && samples[i + 1].t >= renderTime) {
          older = samples[i];
          newer = samples[i + 1];
          break;
        }
      }
      const span = Math.max(1, newer.t - older.t);
      const alpha = Math.max(0, Math.min(1, (renderTime - older.t) / span));
      const ix = older.x + (newer.x - older.x) * alpha;
      const iy = older.y + (newer.y - older.y) * alpha;

      // Only interpolate reasonable distances (ignore teleports/respawns)
      if (Math.hypot(ix - authX, iy - authY) < 48) {
        visualOffsets[key] = { x: ix - authX, y: iy - authY };
      }
    };

    for (const p of this.predictedState.players) {
      if (p.id === this.playerId) continue;
      computeOffset(p.id, p.x, p.y);
    }
    for (const e of this.predictedState.enemies) {
      computeOffset(`e_${e.id}`, e.x, e.y);
    }

    return { state: this.predictedState, visualOffsets };
  }

  private recordSample(key: string, x: number, y: number, now: number): void {
    let arr = this.remoteSamples.get(key);
    if (!arr) {
      arr = [];
      this.remoteSamples.set(key, arr);
    }
    arr.push({ t: now, x, y });
    if (arr.length > 6) arr.shift();
  }

  private handleMessage(msg: ServerWsMessage): void {
    switch (msg.type) {
      case 'pong': {
        const rtt = Math.max(1, Math.round(performance.now() - msg.t));
        this.rttMs = this.rttMs === 0 ? rtt : Math.round(this.rttMs * 0.7 + rtt * 0.3);
        this.callbacks.onPingUpdate(this.rttMs);
        break;
      }
      case 'rooms_list':
        this.callbacks.onRoomsList(msg.rooms);
        break;
      case 'room_joined':
        this.playerId = msg.playerId;
        this.slot = msg.slot;
        this.room = msg.room;
        this.callbacks.onRoomJoined(msg.playerId, msg.slot, msg.room);
        break;
      case 'room_updated':
        this.room = msg.room;
        this.callbacks.onRoomUpdated(msg.room);
        break;
      case 'room_error':
        this.callbacks.onRoomError(msg.message);
        break;
      case 'game_started':
        this.seq = 0;
        this.pendingInputs = [];
        this.localErrorX = 0;
        this.localErrorY = 0;
        this.remoteSamples.clear();
        this.predictedState = cloneGameState(msg.state);
        this.callbacks.onGameStarted(this.predictedState);
        break;
      case 'snapshot': {
        const now = performance.now();
        // Record interpolation samples for remote entities
        const activeKeys = new Set<string>();
        for (const p of msg.state.players) {
          if (p.id === this.playerId) continue;
          activeKeys.add(p.id);
          this.recordSample(p.id, p.x, p.y, now);
        }
        for (const e of msg.state.enemies) {
          const key = `e_${e.id}`;
          activeKeys.add(key);
          this.recordSample(key, e.x, e.y, now);
        }
        // Clean stale keys
        for (const k of this.remoteSamples.keys()) {
          if (!activeKeys.has(k)) this.remoteSamples.delete(k);
        }

        if (this.playerId) {
          const rec = reconcileClientState(
            this.predictedState,
            msg.state,
            this.playerId,
            this.pendingInputs
          );
          this.predictedState = rec.reconciledState;
          this.pendingInputs = rec.remainingInputs;
          // Accumulate damped error offset smoothly
          this.localErrorX = Math.max(-24, Math.min(24, this.localErrorX + rec.errorX));
          this.localErrorY = Math.max(-24, Math.min(24, this.localErrorY + rec.errorY));
        } else {
          this.predictedState = cloneGameState(msg.state);
        }

        if (msg.events.length > 0) {
          // Avoid double-playing local shoot SFX since client already played it at 0ms
          const filtered = msg.events.filter((ev) => {
            if (ev.type === 'shoot' && this.playerId) {
              const lp = this.predictedState?.players.find((p) => p.id === this.playerId);
              if (lp && Math.hypot(ev.x - (lp.x + 14), ev.y - (lp.y + 14)) < 26) {
                return false;
              }
            }
            return true;
          });
          if (filtered.length > 0) this.callbacks.onEvents(filtered);
        }
        break;
      }
    }
  }
}

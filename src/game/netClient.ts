import Peer, { DataConnection } from 'peerjs';
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
import { P2PRoomHost } from './p2pHost.ts';

export type TransportMode = 'detecting' | 'ws' | 'p2p';

interface EntitySample {
  t: number;
  x: number;
  y: number;
}

export interface NetClientCallbacks {
  onConnectionChange: (connected: boolean, transport: TransportMode) => void;
  onRoomsList: (rooms: RoomSummary[]) => void;
  onRoomJoined: (playerId: string, slot: 1 | 2, room: RoomStatePayload) => void;
  onRoomUpdated: (room: RoomStatePayload) => void;
  onRoomError: (message: string) => void;
  onGameStarted: (state: GameState) => void;
  onPingUpdate: (rttMs: number) => void;
  onEvents: (events: SimEvent[]) => void;
}

const PEER_PREFIX = 'tanks1990-v1-';
const PEER_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Dual-Transport Low-Latency Multiplayer Client:
 * - Automatically uses Node WebSocket (/ws) when running on a backend server.
 * - Automatically switches to Serverless WebRTC P2P (PeerJS) on Vercel Free static hosting!
 * Both modes provide 0ms Client-Side Prediction, Server/Host Reconciliation,
 * smooth visual error damping, and Remote Entity Interpolation.
 */
export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private peer: Peer | null = null;
  private guestConn: DataConnection | null = null; // when we are P2P Guest connecting to Host
  private hostGuestConn: DataConnection | null = null; // when we are P2P Host holding Guest
  private p2pHost: P2PRoomHost | null = null;

  private callbacks: NetClientCallbacks;
  private pingTimer: number | null = null;
  private connecting = false;

  public transport: TransportMode = 'detecting';
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

  private clearPingTimer(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanupPeer(): void {
    this.clearPingTimer();
    try {
      this.guestConn?.close();
    } catch {
      // Ignore close errors
    }
    try {
      this.hostGuestConn?.close();
    } catch {
      // Ignore close errors
    }
    try {
      this.peer?.destroy();
    } catch {
      // Ignore destroy errors
    }
    this.guestConn = null;
    this.hostGuestConn = null;
    this.peer = null;
    this.p2pHost = null;
  }

  public async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    const params = new URLSearchParams(window.location.search);
    const forceP2P = params.get('p2p') === '1';
    const customWsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

    if (!forceP2P) {
      if (customWsUrl) {
        this.connectWebSocket(customWsUrl);
        this.connecting = false;
        return;
      }

      // Deterministic backend probe: Node server exposes JSON /api/health { ws: true },
      // whereas Vercel static hosting returns index.html or 404.
      try {
        const controller = new AbortController();
        const tid = window.setTimeout(() => controller.abort(), 1400);
        const res = await fetch('/api/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        window.clearTimeout(tid);
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = (await res.json()) as { ws?: boolean };
          if (data?.ws) {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.connectWebSocket(`${proto}//${window.location.host}/ws`);
            this.connecting = false;
            return;
          }
        }
      } catch {
        // Static hosting (e.g. Vercel Free) -> seamlessly activate WebRTC P2P
      }
    }

    // Serverless WebRTC P2P mode (works 100% free on Vercel static deployment!)
    this.transport = 'p2p';
    this.connected = true;
    this.connecting = false;
    this.callbacks.onConnectionChange(true, 'p2p');
    this.callbacks.onRoomsList([]);
  }

  private connectWebSocket(url: string): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.transport = 'ws';
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.callbacks.onConnectionChange(true, 'ws');
      this.send({ type: 'list_rooms' });
      this.send({ type: 'ping', t: performance.now() });
      this.clearPingTimer();
      this.pingTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping', t: performance.now() });
        }
      }, 2000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerWsMessage;
        this.handleServerMessage(msg);
      } catch {
        // Ignore malformed packets
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.clearPingTimer();
      this.callbacks.onConnectionChange(false, 'ws');
    };

    ws.onerror = () => {
      // Handled via onclose
    };
  }

  public disconnect(): void {
    this.clearPingTimer();
    this.cleanupPeer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
    this.playerId = null;
    this.slot = null;
    this.room = null;
    this.predictedState = null;
    this.pendingInputs = [];
    this.remoteSamples.clear();
  }

  public send(msg: ClientWsMessage): void {
    if (this.transport === 'ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    } else if (this.transport === 'p2p') {
      if (this.guestConn && this.guestConn.open) {
        this.guestConn.send(msg);
      }
    }
  }

  public requestRooms(): void {
    if (this.transport === 'ws') {
      this.send({ type: 'list_rooms' });
    } else {
      this.callbacks.onRoomsList([]);
    }
  }

  public createRoom(name: string, stage: number, friendlyFire: boolean): void {
    if (this.transport === 'ws') {
      this.send({ type: 'create_room', name, stage, friendlyFire });
      return;
    }

    // WebRTC P2P Host Room Creation (Zero Backend!)
    this.cleanupPeer();
    const code = randomRoomCode();
    const cleanName = (name || 'Игрок 1').trim().slice(0, 16) || 'Игрок 1';

    const host = new P2PRoomHost(code, cleanName, stage, friendlyFire, {
      onHostRoomUpdated: (room) => {
        this.room = room;
        this.callbacks.onRoomUpdated(room);
      },
      onHostGameStarted: (state) => {
        this.seq = 0;
        this.pendingInputs = [];
        this.localErrorX = 0;
        this.localErrorY = 0;
        this.remoteSamples.clear();
        this.predictedState = state;
        this.callbacks.onGameStarted(state);
      },
      onHostEvents: (events) => {
        this.callbacks.onEvents(events);
      },
    });
    this.p2pHost = host;

    const peer = new Peer(`${PEER_PREFIX}${code}`, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      this.playerId = 'p1';
      this.slot = 1;
      const payload = host.getRoomPayload();
      this.room = payload;
      this.rttMs = 0;
      this.callbacks.onRoomJoined('p1', 1, payload);
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.hostGuestConn = conn;
      });
      conn.on('data', (raw) => {
        const msg = raw as ClientWsMessage;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ping') {
          conn.send({ type: 'pong', t: msg.t, serverTime: Date.now() } satisfies ServerWsMessage);
          return;
        }
        if (msg.type === 'join_room') {
          const accepted = host.attachGuest(msg.name || 'Игрок 2', {
            send: (m) => {
              if (conn.open) conn.send(m);
            },
            close: () => conn.close(),
          });
          if (!accepted) {
            window.setTimeout(() => conn.close(), 200);
          }
          return;
        }
        if (msg.type === 'leave_room') {
          host.detachGuest();
          conn.close();
          return;
        }
        if (msg.type === 'input') {
          host.queueGuestInput({ seq: msg.seq, dir: msg.dir, fire: msg.fire });
          return;
        }
        if (msg.type === 'next_stage' && host.state) {
          host.startMatch(host.stage + 1, true);
          return;
        }
        if (msg.type === 'restart_game' && host.state) {
          host.startMatch(host.stage, false);
        }
      });
      conn.on('close', () => {
        if (this.hostGuestConn === conn) {
          this.hostGuestConn = null;
          host.detachGuest();
        }
      });
      conn.on('error', () => {
        if (this.hostGuestConn === conn) {
          this.hostGuestConn = null;
          host.detachGuest();
        }
      });
    });

    peer.on('error', (err) => {
      const msg =
        err.type === 'unavailable-id'
          ? 'Код комнаты занят, попробуйте создать ещё раз'
          : 'Не удалось открыть P2P комнату. Проверьте подключение к сети.';
      this.callbacks.onRoomError(msg);
    });
  }

  public joinRoom(code: string, name: string): void {
    const cleanCode = code.trim().toUpperCase();
    if (this.transport === 'ws') {
      this.send({ type: 'join_room', code: cleanCode, name });
      return;
    }

    // WebRTC P2P Guest Join (connects straight to Host's Peer ID!)
    this.cleanupPeer();
    const cleanName = (name || 'Игрок 2').trim().slice(0, 16) || 'Игрок 2';
    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    let joined = false;
    const timeoutId = window.setTimeout(() => {
      if (!joined) {
        this.cleanupPeer();
        this.callbacks.onRoomError(
          `Комната «${cleanCode}» не найдена или командир не в сети`
        );
      }
    }, 9000);

    peer.on('open', () => {
      const conn = peer.connect(`${PEER_PREFIX}${cleanCode}`, { reliable: true });
      this.guestConn = conn;

      conn.on('open', () => {
        conn.send({
          type: 'join_room',
          code: cleanCode,
          name: cleanName,
        } satisfies ClientWsMessage);
        conn.send({ type: 'ping', t: performance.now() } satisfies ClientWsMessage);
        this.clearPingTimer();
        this.pingTimer = window.setInterval(() => {
          if (conn.open) {
            conn.send({ type: 'ping', t: performance.now() } satisfies ClientWsMessage);
          }
        }, 2000);
      });

      conn.on('data', (raw) => {
        const msg = raw as ServerWsMessage;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'room_joined') {
          joined = true;
          window.clearTimeout(timeoutId);
        }
        this.handleServerMessage(msg);
      });

      conn.on('close', () => {
        window.clearTimeout(timeoutId);
        this.clearPingTimer();
        if (joined) {
          this.room = null;
          this.playerId = null;
          this.slot = null;
          this.callbacks.onRoomError('Соединение с командиром комнаты прервано');
        }
      });

      conn.on('error', () => {
        window.clearTimeout(timeoutId);
        this.callbacks.onRoomError(`Не удалось подключиться к комнате «${cleanCode}»`);
      });
    });

    peer.on('error', (err) => {
      window.clearTimeout(timeoutId);
      const message =
        err.type === 'peer-unavailable'
          ? `Комната «${cleanCode}» не найдена`
          : 'Ошибка P2P подключения. Проверьте интернет или код комнаты.';
      this.callbacks.onRoomError(message);
    });
  }

  public leaveRoom(): void {
    if (this.transport === 'ws') {
      this.send({ type: 'leave_room' });
    } else {
      if (this.guestConn?.open) {
        this.guestConn.send({ type: 'leave_room' } satisfies ClientWsMessage);
      }
      this.cleanupPeer();
    }
    this.room = null;
    this.playerId = null;
    this.slot = null;
    this.predictedState = null;
    this.pendingInputs = [];
    this.remoteSamples.clear();
  }

  public updateRoom(stage?: number, friendlyFire?: boolean): void {
    if (this.transport === 'ws') {
      this.send({ type: 'update_room', stage, friendlyFire });
    } else if (this.p2pHost) {
      this.p2pHost.updateSettings(stage, friendlyFire);
    }
  }

  public startGame(): void {
    if (this.transport === 'ws') {
      this.send({ type: 'start_game' });
    } else if (this.p2pHost) {
      this.p2pHost.startMatch(this.p2pHost.stage, false);
    }
  }

  public nextStage(): void {
    if (this.transport === 'ws') {
      this.send({ type: 'next_stage' });
    } else if (this.p2pHost) {
      this.p2pHost.startMatch(this.p2pHost.stage + 1, true);
    } else {
      this.send({ type: 'next_stage' });
    }
  }

  public restartGame(): void {
    if (this.transport === 'ws') {
      this.send({ type: 'restart_game' });
    } else if (this.p2pHost) {
      this.p2pHost.startMatch(this.p2pHost.stage, false);
    } else {
      this.send({ type: 'restart_game' });
    }
  }

  /**
   * Called at fixed 60 Hz during active online gameplay:
   * - If we are a P2P Host, steps the authoritative host simulation directly at 0ms.
   * - If we are a WS client or P2P Guest, predicts local movement & shots immediately at 0ms
   *   and transmits sequenced inputs for reconciliation.
   */
  public stepLocalInput(dir: Direction | null, fire: boolean): SimEvent[] {
    // P2P Host runs authoritative 60Hz tick directly (0ms native latency)
    if (this.transport === 'p2p' && this.p2pHost) {
      this.p2pHost.setHostInput(dir, fire);
      this.p2pHost.stepTick();
      this.predictedState = this.p2pHost.state;
      return [];
    }

    if (!this.predictedState || !this.playerId) return [];

    this.seq += 1;
    const input: PlayerInput = { seq: this.seq, dir, fire };
    this.pendingInputs.push(input);
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
    if (this.transport === 'p2p' && this.p2pHost) {
      return { state: this.p2pHost.state, visualOffsets: {} };
    }

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

  private handleServerMessage(msg: ServerWsMessage): void {
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
          this.localErrorX = Math.max(-24, Math.min(24, this.localErrorX + rec.errorX));
          this.localErrorY = Math.max(-24, Math.min(24, this.localErrorY + rec.errorY));
        } else {
          this.predictedState = cloneGameState(msg.state);
        }

        if (msg.events.length > 0) {
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

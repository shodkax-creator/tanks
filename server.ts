import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ClientWsMessage,
  FIXED_DT,
  GameState,
  PlayerInput,
  RoomPlayerInfo,
  RoomStatePayload,
  RoomSummary,
  ServerWsMessage,
  SimEvent,
} from './src/game/types.ts';
import { createGameState, stepGameState } from './src/game/simulation.ts';
import { TOTAL_STAGES } from './src/game/levels.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ClientConn {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string | null;
  slot: 1 | 2 | null;
  name: string;
}

interface RoomPlayer {
  id: string; // 'p1' | 'p2'
  slot: 1 | 2;
  name: string;
  ws: WebSocket | null;
  inputQueue: PlayerInput[];
  lastHeldDir: PlayerInput['dir'];
  lastSeq: number;
}

interface GameRoom {
  code: string;
  stage: number;
  friendlyFire: boolean;
  status: 'lobby' | 'playing';
  hostId: string;
  players: RoomPlayer[];
  state: GameState | null;
  pendingEvents: SimEvent[];
  tickCount: number;
  interval: NodeJS.Timeout | null;
  lastActivity: number;
}

const rooms = new Map<string, GameRoom>();
const clients = new Set<ClientConn>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let tries = 0; tries < 50; tries++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

function sendJson(ws: WebSocket | null, msg: ServerWsMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function serializeRoom(room: GameRoom): RoomStatePayload {
  const players: RoomPlayerInfo[] = room.players.map((p) => ({
    id: p.id,
    slot: p.slot,
    name: p.name,
    ready: true,
    connected: Boolean(p.ws && p.ws.readyState === WebSocket.OPEN),
  }));
  return {
    code: room.code,
    stage: room.stage,
    friendlyFire: room.friendlyFire,
    status: room.status,
    hostId: room.hostId,
    players,
  };
}

function getRoomsSummary(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const r of rooms.values()) {
    const activeCount = r.players.filter((p) => p.ws && p.ws.readyState === WebSocket.OPEN).length;
    if (activeCount === 0) continue;
    list.push({
      code: r.code,
      stage: r.stage,
      players: r.players.length,
      maxPlayers: 2,
      status: r.status,
      friendlyFire: r.friendlyFire,
    });
  }
  return list;
}

function broadcastRoomsList(): void {
  const msg: ServerWsMessage = { type: 'rooms_list', rooms: getRoomsSummary() };
  for (const c of clients) {
    if (!c.roomCode) {
      sendJson(c.ws, msg);
    }
  }
}

function broadcastRoomUpdate(room: GameRoom): void {
  const payload = serializeRoom(room);
  const msg: ServerWsMessage = { type: 'room_updated', room: payload };
  for (const p of room.players) {
    sendJson(p.ws, msg);
  }
  broadcastRoomsList();
}

function stopRoomLoop(room: GameRoom): void {
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
}

function startRoomSimulation(room: GameRoom, stage: number, carryOver = false): void {
  stopRoomLoop(room);

  const playerCount = (room.players.length >= 2 ? 2 : 1) as 1 | 2;
  const p1 = room.players.find((p) => p.slot === 1);
  const p2 = room.players.find((p) => p.slot === 2);

  for (const p of room.players) {
    p.inputQueue = [];
    p.lastHeldDir = null;
    p.lastSeq = 0;
  }

  room.stage = ((stage - 1) % TOTAL_STAGES + TOTAL_STAGES) % TOTAL_STAGES + 1;
  room.status = 'playing';
  room.pendingEvents = [];
  room.tickCount = 0;
  room.state = createGameState({
    stage: room.stage,
    playerCount,
    playerNames: [p1?.name ?? 'Игрок 1', p2?.name ?? 'Игрок 2'],
    friendlyFire: room.friendlyFire,
    carryOverPlayers: carryOver ? room.state?.players : undefined,
    seed: Date.now() & 0xffffffff,
  });

  broadcastRoomUpdate(room);

  const startMsg: ServerWsMessage = { type: 'game_started', state: room.state };
  for (const p of room.players) {
    sendJson(p.ws, startMsg);
  }

  // Authoritative 60Hz fixed-timestep loop, broadcasting snapshots at 30Hz
  let lastHr = process.hrtime.bigint();
  let accumulator = 0;

  room.interval = setInterval(() => {
    if (!room.state) return;
    const nowHr = process.hrtime.bigint();
    const rawDt = Number(nowHr - lastHr) / 1e9;
    lastHr = nowHr;
    accumulator += Math.min(rawDt, 0.05);

    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      room.tickCount += 1;

      const inputsByPlayer: Record<string, PlayerInput | undefined> = {};
      for (const rp of room.players) {
        const queued = rp.inputQueue.shift();
        if (queued) {
          rp.lastHeldDir = queued.dir;
          rp.lastSeq = queued.seq;
          inputsByPlayer[rp.id] = queued;
        } else {
          inputsByPlayer[rp.id] = {
            seq: rp.lastSeq,
            dir: rp.lastHeldDir,
            fire: false,
          };
        }
      }

      const evs = stepGameState(room.state, inputsByPlayer, FIXED_DT);
      if (evs.length > 0) {
        room.pendingEvents.push(...evs);
      }

      // Broadcast authoritative snapshot every 2 ticks (30Hz) or immediately on critical events
      const hasCritical = room.pendingEvents.some(
        (e) =>
          e.type === 'tank_explode' ||
          e.type === 'player_explode' ||
          e.type === 'eagle_explode' ||
          e.type === 'stage_clear' ||
          e.type === 'game_over'
      );

      if (room.tickCount % 2 === 0 || hasCritical) {
        const snap: ServerWsMessage = {
          type: 'snapshot',
          serverTime: Date.now(),
          state: room.state,
          events: room.pendingEvents,
        };
        room.pendingEvents = [];
        for (const p of room.players) {
          sendJson(p.ws, snap);
        }
      }
    }
  }, 16);
}

function leaveCurrentRoom(client: ClientConn): void {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  const leavingId = client.playerId;
  client.playerId = null;
  client.slot = null;

  if (!room) return;
  room.players = room.players.filter((p) => p.id !== leavingId);

  if (room.players.length === 0) {
    stopRoomLoop(room);
    rooms.delete(room.code);
    broadcastRoomsList();
    return;
  }

  // Promote remaining player to host
  if (room.hostId === leavingId) {
    room.hostId = room.players[0].id;
  }
  broadcastRoomUpdate(room);
}

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ws: true });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getRoomsSummary() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: ClientConn = {
      ws,
      roomCode: null,
      playerId: null,
      slot: null,
      name: 'Танкист',
    };
    clients.add(client);

    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ping':
          sendJson(ws, { type: 'pong', t: msg.t, serverTime: Date.now() });
          break;

        case 'list_rooms':
          sendJson(ws, { type: 'rooms_list', rooms: getRoomsSummary() });
          break;

        case 'create_room': {
          leaveCurrentRoom(client);
          const code = generateRoomCode();
          const name = (msg.name || 'Игрок 1').trim().slice(0, 16) || 'Игрок 1';
          const stage = Math.max(1, Math.min(TOTAL_STAGES, Math.round(msg.stage || 1)));
          const room: GameRoom = {
            code,
            stage,
            friendlyFire: Boolean(msg.friendlyFire),
            status: 'lobby',
            hostId: 'p1',
            players: [
              {
                id: 'p1',
                slot: 1,
                name,
                ws,
                inputQueue: [],
                lastHeldDir: null,
                lastSeq: 0,
              },
            ],
            state: null,
            pendingEvents: [],
            tickCount: 0,
            interval: null,
            lastActivity: Date.now(),
          };
          rooms.set(code, room);
          client.roomCode = code;
          client.playerId = 'p1';
          client.slot = 1;
          client.name = name;

          sendJson(ws, {
            type: 'room_joined',
            playerId: 'p1',
            slot: 1,
            room: serializeRoom(room),
          });
          broadcastRoomsList();
          break;
        }

        case 'join_room': {
          const code = (msg.code || '').trim().toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            sendJson(ws, { type: 'room_error', message: `Комната «${code}» не найдена` });
            break;
          }
          if (room.players.length >= 2) {
            sendJson(ws, { type: 'room_error', message: 'Комната уже заполнена (2/2)' });
            break;
          }
          if (room.status === 'playing') {
            sendJson(ws, { type: 'room_error', message: 'Бой в этой комнате уже идёт' });
            break;
          }
          leaveCurrentRoom(client);

          const slot: 1 | 2 = room.players.some((p) => p.slot === 1) ? 2 : 1;
          const playerId = slot === 1 ? 'p1' : 'p2';
          const name = (msg.name || `Игрок ${slot}`).trim().slice(0, 16) || `Игрок ${slot}`;

          room.players.push({
            id: playerId,
            slot,
            name,
            ws,
            inputQueue: [],
            lastHeldDir: null,
            lastSeq: 0,
          });
          room.players.sort((a, b) => a.slot - b.slot);

          client.roomCode = code;
          client.playerId = playerId;
          client.slot = slot;
          client.name = name;

          sendJson(ws, {
            type: 'room_joined',
            playerId,
            slot,
            room: serializeRoom(room),
          });
          broadcastRoomUpdate(room);
          break;
        }

        case 'leave_room':
          leaveCurrentRoom(client);
          sendJson(ws, { type: 'rooms_list', rooms: getRoomsSummary() });
          break;

        case 'update_room': {
          if (!client.roomCode) break;
          const room = rooms.get(client.roomCode);
          if (!room || room.hostId !== client.playerId || room.status !== 'lobby') break;
          if (typeof msg.stage === 'number') {
            room.stage = Math.max(1, Math.min(TOTAL_STAGES, Math.round(msg.stage)));
          }
          if (typeof msg.friendlyFire === 'boolean') {
            room.friendlyFire = msg.friendlyFire;
          }
          broadcastRoomUpdate(room);
          break;
        }

        case 'start_game': {
          if (!client.roomCode) break;
          const room = rooms.get(client.roomCode);
          if (!room || room.hostId !== client.playerId) break;
          startRoomSimulation(room, room.stage, false);
          break;
        }

        case 'next_stage': {
          if (!client.roomCode) break;
          const room = rooms.get(client.roomCode);
          if (!room) break;
          startRoomSimulation(room, room.stage + 1, true);
          break;
        }

        case 'restart_game': {
          if (!client.roomCode) break;
          const room = rooms.get(client.roomCode);
          if (!room) break;
          startRoomSimulation(room, room.stage, false);
          break;
        }

        case 'input': {
          if (!client.roomCode || !client.playerId) break;
          const room = rooms.get(client.roomCode);
          if (!room || room.status !== 'playing') break;
          const rp = room.players.find((p) => p.id === client.playerId);
          if (!rp) break;
          // Queue sequenced input cleanly, cap queue length to prevent flood drift
          if (rp.inputQueue.length < 12) {
            rp.inputQueue.push({
              seq: msg.seq,
              dir: msg.dir,
              fire: msg.fire,
            });
          } else {
            rp.inputQueue[rp.inputQueue.length - 1] = {
              seq: msg.seq,
              dir: msg.dir,
              fire: msg.fire,
            };
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(client);
      clients.delete(client);
    });
  });

  // Mount Vite middleware in dev or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tanks 1990 server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import {
  Direction,
  FIXED_DT,
  GameState,
  PlayerInput,
  RoomStatePayload,
  ServerWsMessage,
  SimEvent,
} from './types.ts';
import { createGameState, stepGameState } from './simulation.ts';
import { TOTAL_STAGES } from './levels.ts';

export interface P2PGuestChannel {
  send: (msg: ServerWsMessage) => void;
  close?: () => void;
}

/**
 * Pure Host-Authoritative 60Hz Simulation Engine for serverless WebRTC P2P multiplayer
 * (runs inside Player 1's browser on Vercel Free static hosting, zero backend needed!).
 */
export class P2PRoomHost {
  public code: string;
  public stage: number;
  public friendlyFire: boolean;
  public status: 'lobby' | 'playing' = 'lobby';
  public hostName: string;
  public guestName: string | null = null;
  public state: GameState | null = null;

  private guestChannel: P2PGuestChannel | null = null;
  private guestInputQueue: PlayerInput[] = [];
  private guestLastDir: Direction | null = null;
  private guestLastSeq = 0;

  private hostDir: Direction | null = null;
  private hostFire = false;
  private hostSeq = 0;

  private tickCount = 0;
  private pendingGuestEvents: SimEvent[] = [];

  private onHostRoomUpdated: (room: RoomStatePayload) => void;
  private onHostGameStarted: (state: GameState) => void;
  private onHostEvents: (events: SimEvent[]) => void;

  constructor(
    code: string,
    hostName: string,
    stage: number,
    friendlyFire: boolean,
    callbacks: {
      onHostRoomUpdated: (room: RoomStatePayload) => void;
      onHostGameStarted: (state: GameState) => void;
      onHostEvents: (events: SimEvent[]) => void;
    }
  ) {
    this.code = code;
    this.hostName = hostName;
    this.stage = Math.max(1, Math.min(TOTAL_STAGES, Math.round(stage || 1)));
    this.friendlyFire = friendlyFire;
    this.onHostRoomUpdated = callbacks.onHostRoomUpdated;
    this.onHostGameStarted = callbacks.onHostGameStarted;
    this.onHostEvents = callbacks.onHostEvents;
  }

  public getRoomPayload(): RoomStatePayload {
    const players: RoomStatePayload['players'] = [
      {
        id: 'p1',
        slot: 1,
        name: this.hostName,
        ready: true,
        connected: true,
      },
    ];
    if (this.guestChannel && this.guestName) {
      players.push({
        id: 'p2',
        slot: 2,
        name: this.guestName,
        ready: true,
        connected: true,
      });
    }
    return {
      code: this.code,
      stage: this.stage,
      friendlyFire: this.friendlyFire,
      status: this.status,
      hostId: 'p1',
      players,
    };
  }

  public attachGuest(name: string, channel: P2PGuestChannel): boolean {
    if (this.guestChannel) {
      channel.send({ type: 'room_error', message: 'Комната уже заполнена (2/2)' });
      return false;
    }
    if (this.status === 'playing') {
      channel.send({ type: 'room_error', message: 'Бой в этой комнате уже идёт' });
      return false;
    }
    this.guestName = name.trim().slice(0, 16) || 'Игрок 2';
    this.guestChannel = channel;
    this.guestInputQueue = [];
    this.guestLastDir = null;
    this.guestLastSeq = 0;

    const payload = this.getRoomPayload();
    channel.send({
      type: 'room_joined',
      playerId: 'p2',
      slot: 2,
      room: payload,
    });
    this.onHostRoomUpdated(payload);
    return true;
  }

  public detachGuest(): void {
    if (!this.guestChannel) return;
    this.guestChannel = null;
    this.guestName = null;
    this.guestInputQueue = [];
    this.guestLastDir = null;
    this.onHostRoomUpdated(this.getRoomPayload());
  }

  public updateSettings(stage?: number, friendlyFire?: boolean): void {
    if (this.status !== 'lobby') return;
    if (typeof stage === 'number') {
      this.stage = Math.max(1, Math.min(TOTAL_STAGES, Math.round(stage)));
    }
    if (typeof friendlyFire === 'boolean') {
      this.friendlyFire = friendlyFire;
    }
    const payload = this.getRoomPayload();
    this.guestChannel?.send({ type: 'room_updated', room: payload });
    this.onHostRoomUpdated(payload);
  }

  public startMatch(stage: number, carryOver = false): void {
    this.stage = ((stage - 1) % TOTAL_STAGES + TOTAL_STAGES) % TOTAL_STAGES + 1;
    this.status = 'playing';
    this.tickCount = 0;
    this.pendingGuestEvents = [];
    this.guestInputQueue = [];
    this.guestLastDir = null;
    this.guestLastSeq = 0;
    this.hostSeq = 0;

    const playerCount = (this.guestChannel ? 2 : 1) as 1 | 2;
    this.state = createGameState({
      stage: this.stage,
      playerCount,
      playerNames: [this.hostName, this.guestName ?? 'Игрок 2'],
      friendlyFire: this.friendlyFire,
      carryOverPlayers: carryOver ? this.state?.players : undefined,
      seed: Date.now() & 0xffffffff,
    });

    const roomPayload = this.getRoomPayload();
    this.guestChannel?.send({ type: 'room_updated', room: roomPayload });
    this.onHostRoomUpdated(roomPayload);

    this.guestChannel?.send({ type: 'game_started', state: this.state });
    this.onHostGameStarted(this.state);
  }

  public queueGuestInput(input: PlayerInput): void {
    if (this.guestInputQueue.length < 12) {
      this.guestInputQueue.push(input);
    } else {
      this.guestInputQueue[this.guestInputQueue.length - 1] = input;
    }
  }

  public setHostInput(dir: Direction | null, fire: boolean): void {
    this.hostDir = dir;
    this.hostFire = fire;
  }

  /**
   * Advances authoritative 60Hz simulation by 1 tick (FIXED_DT),
   * sends 30Hz snapshots + events to the WebRTC Guest, and returns local events for Host.
   */
  public stepTick(): SimEvent[] {
    if (!this.state || this.status !== 'playing') return [];

    this.tickCount += 1;
    this.hostSeq += 1;

    const inputsByPlayer: Record<string, PlayerInput | undefined> = {
      p1: { seq: this.hostSeq, dir: this.hostDir, fire: this.hostFire },
    };

    if (this.guestChannel) {
      const queued = this.guestInputQueue.shift();
      if (queued) {
        this.guestLastDir = queued.dir;
        this.guestLastSeq = queued.seq;
        inputsByPlayer.p2 = queued;
      } else {
        inputsByPlayer.p2 = {
          seq: this.guestLastSeq,
          dir: this.guestLastDir,
          fire: false,
        };
      }
    }

    const evs = stepGameState(this.state, inputsByPlayer, FIXED_DT);
    if (evs.length > 0) {
      this.pendingGuestEvents.push(...evs);
    }

    if (this.guestChannel) {
      const hasCritical = this.pendingGuestEvents.some(
        (e) =>
          e.type === 'tank_explode' ||
          e.type === 'player_explode' ||
          e.type === 'eagle_explode' ||
          e.type === 'stage_clear' ||
          e.type === 'game_over'
      );

      if (this.tickCount % 2 === 0 || hasCritical) {
        this.guestChannel.send({
          type: 'snapshot',
          serverTime: Date.now(),
          state: this.state,
          events: this.pendingGuestEvents,
        });
        this.pendingGuestEvents = [];
      }
    } else {
      this.pendingGuestEvents = [];
    }

    if (evs.length > 0) {
      this.onHostEvents(evs);
    }
    return evs;
  }
}

export enum TileType {
  EMPTY = 0,
  BRICK = 1,
  STEEL = 2,
  WATER = 3,
  FOREST = 4,
  ICE = 5,
  EAGLE = 6,
  EAGLE_DEAD = 7,
}

export enum Direction {
  UP = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3,
}

export type EnemyKind = 'basic' | 'fast' | 'power' | 'armor';

export type PowerUpKind =
  | 'star'
  | 'helmet'
  | 'shovel'
  | 'clock'
  | 'grenade'
  | 'tank'
  | 'gun'
  | 'boat';

export type GameMode = 'single' | 'local2p' | 'online';

export type AppScreen = 'title' | 'playing' | 'paused' | 'stage_clear' | 'gameover';

export const GRID_SIZE = 26; // 26x26 half-tiles (13x13 full NES tiles)
export const CELL_SIZE = 16; // 16 world px per half-tile
export const WORLD_SIZE = GRID_SIZE * CELL_SIZE; // 416 x 416 world px
export const TANK_SIZE = 28; // slightly smaller than 32px corridor for smooth driving
export const TANK_SLOT = 32; // 2 half-tiles
export const BULLET_SIZE = 6;
export const FIXED_HZ = 60;
export const FIXED_DT = 1 / FIXED_HZ;

export interface PlayerInput {
  seq: number;
  dir: Direction | null;
  fire: boolean;
}

export interface PlayerTank {
  id: string; // 'p1' | 'p2'
  slot: 1 | 2;
  name: string;
  x: number;
  y: number;
  dir: Direction;
  alive: boolean;
  lives: number;
  tier: number; // 0..3 (Tank 1990 upgrades)
  hasBoat: boolean;
  shieldTimer: number; // seconds
  respawnTimer: number; // seconds
  fireCooldown: number; // seconds
  stunTimer: number; // friendly fire freeze
  iceSlideTimer: number;
  iceSlideDir: Direction;
  treadDist: number;
  recoil: number;
  score: number;
  kills: Record<EnemyKind, number>;
  lastProcessedSeq: number;
}

export interface EnemyTank {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  dir: Direction;
  hp: number;
  maxHp: number;
  bonus: boolean; // flashing red tank that drops power-up
  treadDist: number;
  recoil: number;
  hitFlash: number;
  fireCooldown: number;
  aiTurnTimer: number;
  aiStuckFrames: number;
  spawnAnim: number; // > 0 while teleport star spins
}

export interface Bullet {
  id: number;
  ownerId: string; // 'p1' | 'p2' | 'enemy'
  ownerEnemyId?: number;
  x: number;
  y: number;
  dir: Direction;
  speed: number;
  power: number; // 1 = breaks brick, 2 = breaks steel
  predicted?: boolean; // client-only local prediction bullet
}

export interface PowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  timer: number; // remaining seconds before despawn
}

export interface SimEvent {
  type:
    | 'shoot'
    | 'brick_hit'
    | 'steel_hit'
    | 'armor_hit'
    | 'tank_explode'
    | 'player_explode'
    | 'eagle_explode'
    | 'powerup_spawn'
    | 'powerup_pickup'
    | 'extra_life'
    | 'stage_clear'
    | 'game_over';
  x: number;
  y: number;
  value?: number;
  label?: string;
  heavy?: boolean;
}

export interface GameState {
  tick: number;
  stage: number; // 1..35
  grid: number[]; // length 26 * 26 = 676
  players: PlayerTank[];
  enemies: EnemyTank[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  enemyQueue: EnemyKind[];
  enemiesRemaining: number;
  maxActiveEnemies: number;
  spawnTimer: number;
  spawnPointIndex: number;
  freezeTimer: number; // Clock power-up
  fortressTimer: number; // Shovel steel base timer
  eagleAlive: boolean;
  status: 'playing' | 'stage_clear' | 'game_over';
  statusDelay: number; // brief celebration / defeat beat before modal
  nextEntityId: number;
  friendlyFire: boolean;
  stageTimer: number;
  bonusDropIndices: number[];
  enemiesSpawned: number;
  rngState: number;
  events: SimEvent[];
}

export interface RoomPlayerInfo {
  id: string;
  slot: 1 | 2;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface RoomSummary {
  code: string;
  stage: number;
  players: number;
  maxPlayers: number;
  status: 'lobby' | 'playing';
  friendlyFire: boolean;
}

export interface RoomStatePayload {
  code: string;
  stage: number;
  friendlyFire: boolean;
  status: 'lobby' | 'playing';
  hostId: string;
  players: RoomPlayerInfo[];
}

export type ClientWsMessage =
  | { type: 'ping'; t: number }
  | { type: 'list_rooms' }
  | { type: 'create_room'; name: string; stage: number; friendlyFire: boolean }
  | { type: 'join_room'; code: string; name: string }
  | { type: 'leave_room' }
  | { type: 'update_room'; stage?: number; friendlyFire?: boolean }
  | { type: 'start_game' }
  | { type: 'next_stage' }
  | { type: 'restart_game' }
  | { type: 'input'; seq: number; dir: Direction | null; fire: boolean };

export type ServerWsMessage =
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'rooms_list'; rooms: RoomSummary[] }
  | { type: 'room_joined'; playerId: string; slot: 1 | 2; room: RoomStatePayload }
  | { type: 'room_updated'; room: RoomStatePayload }
  | { type: 'room_error'; message: string }
  | { type: 'game_started'; state: GameState }
  | { type: 'snapshot'; serverTime: number; state: GameState; events: SimEvent[] };

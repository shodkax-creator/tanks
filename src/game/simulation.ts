import {
  BULLET_SIZE,
  Bullet,
  CELL_SIZE,
  Direction,
  EnemyKind,
  EnemyTank,
  FIXED_DT,
  GRID_SIZE,
  GameState,
  PlayerInput,
  PlayerTank,
  PowerUp,
  PowerUpKind,
  SimEvent,
  TANK_SIZE,
  TileType,
  WORLD_SIZE,
} from './types.ts';
import { FORTRESS_COORDS, buildEnemyQueue, buildStageGrid } from './levels.ts';

// Deterministic linear congruential PRNG so server & unit tests stay reproducible
export function nextRand(state: GameState): number {
  state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return state.rngState / 0x100000000;
}

export const PLAYER_SPAWNS: Record<1 | 2, { x: number; y: number }> = {
  1: { x: 8 * CELL_SIZE + 2, y: 24 * CELL_SIZE + 2 },
  2: { x: 16 * CELL_SIZE + 2, y: 24 * CELL_SIZE + 2 },
};

export const ENEMY_SPAWNS: { x: number; y: number }[] = [
  { x: 0 * CELL_SIZE + 2, y: 0 * CELL_SIZE + 2 },
  { x: 12 * CELL_SIZE + 2, y: 0 * CELL_SIZE + 2 },
  { x: 24 * CELL_SIZE + 2, y: 0 * CELL_SIZE + 2 },
];

export const ENEMY_SCORE: Record<EnemyKind, number> = {
  basic: 100,
  fast: 200,
  power: 300,
  armor: 400,
};

export const ENEMY_STATS: Record<
  EnemyKind,
  { speed: number; bulletSpeed: number; hp: number; fireInterval: number }
> = {
  basic: { speed: 66, bulletSpeed: 215, hp: 1, fireInterval: 1.55 },
  fast: { speed: 106, bulletSpeed: 235, hp: 1, fireInterval: 1.25 },
  power: { speed: 74, bulletSpeed: 325, hp: 1, fireInterval: 0.95 },
  armor: { speed: 64, bulletSpeed: 245, hp: 4, fireInterval: 1.2 },
};

const PLAYER_BASE_SPEED = 96;
const CORNER_SNAP_THRESHOLD = 11;

export function dirVector(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case Direction.UP:
      return { dx: 0, dy: -1 };
    case Direction.RIGHT:
      return { dx: 1, dy: 0 };
    case Direction.DOWN:
      return { dx: 0, dy: 1 };
    case Direction.LEFT:
      return { dx: -1, dy: 0 };
  }
}

export function createPlayer(
  slot: 1 | 2,
  name: string,
  prev?: Partial<PlayerTank>
): PlayerTank {
  const spawn = PLAYER_SPAWNS[slot];
  return {
    id: slot === 1 ? 'p1' : 'p2',
    slot,
    name,
    x: spawn.x,
    y: spawn.y,
    dir: Direction.UP,
    alive: true,
    lives: prev?.lives ?? 3,
    tier: prev?.tier ?? 0,
    hasBoat: prev?.hasBoat ?? false,
    shieldTimer: 3.0,
    respawnTimer: 0,
    fireCooldown: 0,
    stunTimer: 0,
    iceSlideTimer: 0,
    iceSlideDir: Direction.UP,
    treadDist: 0,
    recoil: 0,
    score: prev?.score ?? 0,
    kills: { basic: 0, fast: 0, power: 0, armor: 0 },
    lastProcessedSeq: prev?.lastProcessedSeq ?? 0,
  };
}

export interface CreateGameOptions {
  stage: number;
  playerCount: 1 | 2;
  playerNames?: [string, string?];
  friendlyFire?: boolean;
  carryOverPlayers?: PlayerTank[];
  seed?: number;
}

export function createGameState(options: CreateGameOptions): GameState {
  const {
    stage,
    playerCount,
    playerNames = ['Игрок 1', 'Игрок 2'],
    friendlyFire = false,
    carryOverPlayers,
    seed = 1990 + stage * 7919,
  } = options;

  const players: PlayerTank[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const slot = i as 1 | 2;
    const prev = carryOverPlayers?.find((p) => p.slot === slot);
    const aliveCarry = prev && (prev.alive || prev.lives > 0);
    players.push(
      createPlayer(slot, prev?.name ?? playerNames[slot - 1] ?? `Игрок ${slot}`, {
        lives: aliveCarry ? Math.max(1, prev.lives) : 3,
        tier: aliveCarry && prev.alive ? prev.tier : 0,
        hasBoat: aliveCarry && prev.alive ? prev.hasBoat : false,
        score: prev?.score ?? 0,
        lastProcessedSeq: prev?.lastProcessedSeq ?? 0,
      })
    );
  }

  const enemyQueue = buildEnemyQueue(stage);

  return {
    tick: 0,
    stage,
    grid: buildStageGrid(stage),
    players,
    enemies: [],
    bullets: [],
    powerUps: [],
    enemyQueue,
    enemiesRemaining: enemyQueue.length,
    maxActiveEnemies: playerCount === 2 ? 6 : 4,
    spawnTimer: 0.4,
    spawnPointIndex: 1, // start center, then cycle left, right, center
    freezeTimer: 0,
    fortressTimer: 0,
    eagleAlive: true,
    status: 'playing',
    statusDelay: 0,
    nextEntityId: 100,
    friendlyFire,
    stageTimer: 0,
    bonusDropIndices: [4, 11, 18],
    enemiesSpawned: 0,
    rngState: seed >>> 0,
    events: [],
  };
}

export function cloneGameState(s: GameState): GameState {
  return {
    ...s,
    grid: s.grid.slice(),
    players: s.players.map((p) => ({ ...p, kills: { ...p.kills } })),
    enemies: s.enemies.map((e) => ({ ...e })),
    bullets: s.bullets.map((b) => ({ ...b })),
    powerUps: s.powerUps.map((pu) => ({ ...pu })),
    enemyQueue: s.enemyQueue.slice(),
    bonusDropIndices: s.bonusDropIndices.slice(),
    events: [],
  };
}

export function getTile(grid: number[], gx: number, gy: number): TileType {
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) {
    return TileType.STEEL;
  }
  return grid[gy * GRID_SIZE + gx] as TileType;
}

export function setTile(grid: number[], gx: number, gy: number, tile: TileType): void {
  if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
    grid[gy * GRID_SIZE + gx] = tile;
  }
}

export function isSolidForTank(tile: TileType, hasBoat: boolean): boolean {
  if (tile === TileType.BRICK || tile === TileType.STEEL || tile === TileType.EAGLE || tile === TileType.EAGLE_DEAD) {
    return true;
  }
  if (tile === TileType.WATER) {
    return !hasBoat;
  }
  return false;
}

export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function collidesWithGrid(
  grid: number[],
  x: number,
  y: number,
  size: number,
  hasBoat: boolean
): boolean {
  if (x < 0 || y < 0 || x + size > WORLD_SIZE || y + size > WORLD_SIZE) {
    return true;
  }
  const minGx = Math.floor(x / CELL_SIZE);
  const maxGx = Math.floor((x + size - 0.01) / CELL_SIZE);
  const minGy = Math.floor(y / CELL_SIZE);
  const maxGy = Math.floor((y + size - 0.01) / CELL_SIZE);

  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (isSolidForTank(getTile(grid, gx, gy), hasBoat)) {
        return true;
      }
    }
  }
  return false;
}

function isOnIce(grid: number[], x: number, y: number): boolean {
  const cx = Math.floor((x + TANK_SIZE / 2) / CELL_SIZE);
  const cy = Math.floor((y + TANK_SIZE / 2) / CELL_SIZE);
  return getTile(grid, cx, cy) === TileType.ICE;
}

function collidesWithOtherTanks(
  state: GameState,
  x: number,
  y: number,
  ignorePlayerId?: string,
  ignoreEnemyId?: number
): boolean {
  // Use slightly inset tank-vs-tank box so tanks passing in adjacent lanes don't snag
  const pad = 2;
  for (const p of state.players) {
    if (!p.alive || p.id === ignorePlayerId) continue;
    if (
      rectsOverlap(
        x + pad,
        y + pad,
        TANK_SIZE - pad * 2,
        TANK_SIZE - pad * 2,
        p.x + pad,
        p.y + pad,
        TANK_SIZE - pad * 2,
        TANK_SIZE - pad * 2
      )
    ) {
      return true;
    }
  }
  for (const e of state.enemies) {
    if (e.spawnAnim > 0 || e.id === ignoreEnemyId) continue;
    if (
      rectsOverlap(
        x + pad,
        y + pad,
        TANK_SIZE - pad * 2,
        TANK_SIZE - pad * 2,
        e.x + pad,
        e.y + pad,
        TANK_SIZE - pad * 2,
        TANK_SIZE - pad * 2
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Authentic Battle City movement with smooth corner-alignment assist:
 * When turning perpendicular or nudging past a half-tile corner, smoothly snaps
 * perpendicular axis onto the 16px lane alignment so tanks glide through 1-tile alleys.
 */
function moveTankWithAssist(
  state: GameState,
  tank: { x: number; y: number; dir: Direction; treadDist: number },
  moveDir: Direction,
  speed: number,
  dt: number,
  hasBoat: boolean,
  ignorePlayerId?: string,
  ignoreEnemyId?: number
): boolean {
  const prevDir = tank.dir;
  tank.dir = moveDir;

  // Snap perpendicular axis gently when changing orientation (horizontal <-> vertical)
  const wasVertical = prevDir === Direction.UP || prevDir === Direction.DOWN;
  const isVertical = moveDir === Direction.UP || moveDir === Direction.DOWN;

  if (wasVertical !== isVertical) {
    if (isVertical) {
      const nearest = Math.round((tank.x - 2) / CELL_SIZE) * CELL_SIZE + 2;
      if (
        Math.abs(nearest - tank.x) <= CORNER_SNAP_THRESHOLD &&
        !collidesWithGrid(state.grid, nearest, tank.y, TANK_SIZE, hasBoat) &&
        !collidesWithOtherTanks(state, nearest, tank.y, ignorePlayerId, ignoreEnemyId)
      ) {
        tank.x = nearest;
      }
    } else {
      const nearest = Math.round((tank.y - 2) / CELL_SIZE) * CELL_SIZE + 2;
      if (
        Math.abs(nearest - tank.y) <= CORNER_SNAP_THRESHOLD &&
        !collidesWithGrid(state.grid, tank.x, nearest, TANK_SIZE, hasBoat) &&
        !collidesWithOtherTanks(state, tank.x, nearest, ignorePlayerId, ignoreEnemyId)
      ) {
        tank.y = nearest;
      }
    }
  }

  const { dx, dy } = dirVector(moveDir);
  const step = speed * dt;
  const nx = tank.x + dx * step;
  const ny = tank.y + dy * step;

  const blocked =
    collidesWithGrid(state.grid, nx, ny, TANK_SIZE, hasBoat) ||
    collidesWithOtherTanks(state, nx, ny, ignorePlayerId, ignoreEnemyId);

  if (!blocked) {
    tank.x = nx;
    tank.y = ny;
    tank.treadDist += step;
    return true;
  }

  // Corner-assist nudge: if trying to drive forward and just clipped a corner, slide toward aligned lane
  if (isVertical) {
    const nearest = Math.round((tank.x - 2) / CELL_SIZE) * CELL_SIZE + 2;
    const diff = nearest - tank.x;
    if (Math.abs(diff) > 0.01 && Math.abs(diff) <= CORNER_SNAP_THRESHOLD) {
      const slide = Math.sign(diff) * Math.min(Math.abs(diff), step * 1.15);
      const sx = tank.x + slide;
      if (
        !collidesWithGrid(state.grid, sx, tank.y, TANK_SIZE, hasBoat) &&
        !collidesWithOtherTanks(state, sx, tank.y, ignorePlayerId, ignoreEnemyId)
      ) {
        tank.x = sx;
        tank.treadDist += Math.abs(slide);
        return true;
      }
    }
  } else {
    const nearest = Math.round((tank.y - 2) / CELL_SIZE) * CELL_SIZE + 2;
    const diff = nearest - tank.y;
    if (Math.abs(diff) > 0.01 && Math.abs(diff) <= CORNER_SNAP_THRESHOLD) {
      const slide = Math.sign(diff) * Math.min(Math.abs(diff), step * 1.15);
      const sy = tank.y + slide;
      if (
        !collidesWithGrid(state.grid, tank.x, sy, TANK_SIZE, hasBoat) &&
        !collidesWithOtherTanks(state, tank.x, sy, ignorePlayerId, ignoreEnemyId)
      ) {
        tank.y = sy;
        tank.treadDist += Math.abs(slide);
        return true;
      }
    }
  }

  return false;
}

export function spawnPlayerBullet(
  state: GameState,
  player: PlayerTank,
  isPredicted = false
): Bullet | null {
  if (!player.alive || player.fireCooldown > 0 || player.stunTimer > 0) return null;

  const maxBullets = player.tier >= 2 ? 2 : 1;
  const activeCount = state.bullets.filter((b) => b.ownerId === player.id).length;
  if (activeCount >= maxBullets) return null;

  const { dx, dy } = dirVector(player.dir);
  const cx = player.x + TANK_SIZE / 2;
  const cy = player.y + TANK_SIZE / 2;
  const bx = cx + dx * (TANK_SIZE / 2 + 1) - BULLET_SIZE / 2;
  const by = cy + dy * (TANK_SIZE / 2 + 1) - BULLET_SIZE / 2;

  const speed = player.tier >= 1 ? 350 : 255;
  const power = player.tier >= 3 ? 2 : 1;

  const bullet: Bullet = {
    id: isPredicted ? -Math.abs(state.nextEntityId++) : state.nextEntityId++,
    ownerId: player.id,
    x: bx,
    y: by,
    dir: player.dir,
    speed,
    power,
    predicted: isPredicted || undefined,
  };

  state.bullets.push(bullet);
  player.fireCooldown = player.tier >= 2 ? 0.16 : 0.24;
  player.recoil = 1.0;

  if (!isPredicted) {
    state.events.push({ type: 'shoot', x: cx, y: cy });
  }
  return bullet;
}

/**
 * Pure deterministic single-player input step.
 * Used identically on the authoritative server AND in client-side prediction / reconciliation!
 */
export function stepPlayerInput(
  state: GameState,
  playerId: string,
  input: PlayerInput,
  dt: number,
  isClientPrediction = false
): Bullet | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;

  if (input.seq > player.lastProcessedSeq) {
    player.lastProcessedSeq = input.seq;
  }

  if (!player.alive) return null;

  if (player.fireCooldown > 0) {
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  }
  if (player.recoil > 0) {
    player.recoil = Math.max(0, player.recoil - dt * 6);
  }
  if (player.stunTimer > 0) {
    player.stunTimer = Math.max(0, player.stunTimer - dt);
    return null;
  }

  const speed = PLAYER_BASE_SPEED + (player.tier >= 1 ? 8 : 0);
  const onIce = isOnIce(state.grid, player.x, player.y);

  if (input.dir !== null) {
    moveTankWithAssist(
      state,
      player,
      input.dir,
      speed,
      dt,
      player.hasBoat,
      player.id,
      undefined
    );
    if (onIce) {
      player.iceSlideTimer = 0.28;
      player.iceSlideDir = input.dir;
    } else {
      player.iceSlideTimer = 0;
    }
  } else if (player.iceSlideTimer > 0 && onIce) {
    player.iceSlideTimer = Math.max(0, player.iceSlideTimer - dt);
    moveTankWithAssist(
      state,
      player,
      player.iceSlideDir,
      speed * 0.72,
      dt,
      player.hasBoat,
      player.id,
      undefined
    );
  } else {
    player.iceSlideTimer = 0;
  }

  if (input.fire) {
    return spawnPlayerBullet(state, player, isClientPrediction);
  }
  return null;
}

function setFortressTiles(grid: number[], tile: TileType): void {
  for (const [fx, fy] of FORTRESS_COORDS) {
    setTile(grid, fx, fy, tile);
  }
}

function spawnPowerUp(state: GameState): void {
  const kinds: PowerUpKind[] = [
    'star',
    'helmet',
    'shovel',
    'clock',
    'grenade',
    'tank',
    'gun',
    'boat',
  ];
  const kind = kinds[Math.floor(nextRand(state) * kinds.length)];

  // Pick a clear position inside the map (away from top row and eagle box)
  let px = 6 * CELL_SIZE;
  let py = 12 * CELL_SIZE;
  for (let attempt = 0; attempt < 25; attempt++) {
    const gx = 2 + Math.floor(nextRand(state) * (GRID_SIZE - 5));
    const gy = 3 + Math.floor(nextRand(state) * (GRID_SIZE - 7));
    const t = getTile(state.grid, gx, gy);
    if (t !== TileType.WATER && t !== TileType.EAGLE && t !== TileType.EAGLE_DEAD) {
      px = gx * CELL_SIZE;
      py = gy * CELL_SIZE;
      break;
    }
  }

  // Classic Battle City: only one power-up on field at a time (replace older)
  state.powerUps = [
    {
      id: state.nextEntityId++,
      kind,
      x: px,
      y: py,
      timer: 15,
    },
  ];
  state.events.push({ type: 'powerup_spawn', x: px + 14, y: py + 14 });
}

export function applyPowerUp(state: GameState, player: PlayerTank, pu: PowerUp): void {
  player.score += 500;
  state.events.push({
    type: 'powerup_pickup',
    x: pu.x + 14,
    y: pu.y + 14,
    value: 500,
    label: powerUpLabel(pu.kind),
  });

  switch (pu.kind) {
    case 'star':
      player.tier = Math.min(3, player.tier + 1);
      break;
    case 'gun':
      player.tier = 3;
      break;
    case 'boat':
      player.hasBoat = true;
      break;
    case 'helmet':
      player.shieldTimer = Math.max(player.shieldTimer, 10);
      break;
    case 'shovel':
      state.fortressTimer = 18;
      setFortressTiles(state.grid, TileType.STEEL);
      break;
    case 'clock':
      state.freezeTimer = 10;
      break;
    case 'tank':
      player.lives = Math.min(9, player.lives + 1);
      state.events.push({
        type: 'extra_life',
        x: player.x + TANK_SIZE / 2,
        y: player.y,
        label: '1UP',
      });
      break;
    case 'grenade':
      for (const e of state.enemies) {
        if (e.spawnAnim > 0) continue;
        state.events.push({
          type: 'tank_explode',
          x: e.x + TANK_SIZE / 2,
          y: e.y + TANK_SIZE / 2,
          value: ENEMY_SCORE[e.kind],
          heavy: e.kind === 'armor',
        });
      }
      state.enemies = state.enemies.filter((e) => e.spawnAnim > 0);
      break;
  }
}

function powerUpLabel(kind: PowerUpKind): string {
  switch (kind) {
    case 'star':
      return 'ЗВЕЗДА';
    case 'helmet':
      return 'ЩИТ';
    case 'shovel':
      return 'БАЗА';
    case 'clock':
      return 'СТОП';
    case 'grenade':
      return 'ГРАНАТА';
    case 'tank':
      return '+1 ЖИЗНЬ';
    case 'gun':
      return 'МАКС. ПУШКА';
    case 'boat':
      return 'КАТЕР';
  }
}

function spawnEnemy(state: GameState): void {
  if (state.enemyQueue.length === 0) return;
  if (state.enemies.length >= state.maxActiveEnemies) return;

  for (let tries = 0; tries < ENEMY_SPAWNS.length; tries++) {
    const idx = (state.spawnPointIndex + tries) % ENEMY_SPAWNS.length;
    const sp = ENEMY_SPAWNS[idx];
    const occupied = collidesWithOtherTanks(state, sp.x, sp.y);
    if (!occupied) {
      const kind = state.enemyQueue.shift()!;
      state.enemiesSpawned += 1;
      state.enemiesRemaining = state.enemyQueue.length;
      state.spawnPointIndex = (idx + 1) % ENEMY_SPAWNS.length;
      const stats = ENEMY_STATS[kind];
      const isBonus = state.bonusDropIndices.includes(state.enemiesSpawned);

      state.enemies.push({
        id: state.nextEntityId++,
        kind,
        x: sp.x,
        y: sp.y,
        dir: Direction.DOWN,
        hp: stats.hp,
        maxHp: stats.hp,
        bonus: isBonus,
        treadDist: 0,
        recoil: 0,
        hitFlash: 0,
        fireCooldown: 0.9 + nextRand(state) * 0.7,
        aiTurnTimer: 0.8 + nextRand(state) * 1.4,
        aiStuckFrames: 0,
        spawnAnim: 0.85,
      });
      return;
    }
  }
}

function chooseEnemyDirection(state: GameState, enemy: EnemyTank): Direction {
  const dirs: Direction[] = [Direction.UP, Direction.RIGHT, Direction.DOWN, Direction.LEFT];
  const r = nextRand(state);

  // Distinct behavior policies per enemy archetype
  const eagleX = 12.5 * CELL_SIZE;
  const eagleY = 24.5 * CELL_SIZE;

  if (enemy.kind === 'armor') {
    // Siege juggernaut: strongly biases downward toward Eagle HQ
    if (r < 0.65) {
      if (Math.abs(enemy.x - eagleX) > 36 && nextRand(state) < 0.5) {
        return enemy.x < eagleX ? Direction.RIGHT : Direction.LEFT;
      }
      return Direction.DOWN;
    }
  } else if (enemy.kind === 'fast') {
    // Flanker: actively hunts nearest living player
    const target = state.players.find((p) => p.alive);
    if (target && r < 0.58) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? Direction.RIGHT : Direction.LEFT;
      }
      return dy > 0 ? Direction.DOWN : Direction.UP;
    }
  } else if (enemy.kind === 'power') {
    // Line-of-sight sniper: aligns on player or HQ axis
    const target = state.players.find((p) => p.alive);
    if (target && r < 0.62) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      if (Math.abs(dx) < 24) return dy > 0 ? Direction.DOWN : Direction.UP;
      if (Math.abs(dy) < 24) return dx > 0 ? Direction.RIGHT : Direction.LEFT;
      return Math.abs(dx) < Math.abs(dy)
        ? dx > 0
          ? Direction.RIGHT
          : Direction.LEFT
        : dy > 0
          ? Direction.DOWN
          : Direction.UP;
    }
  } else {
    // Basic patrol: gentle bias downward as stage progresses
    if (r < 0.38) return Direction.DOWN;
  }

  return dirs[Math.floor(nextRand(state) * dirs.length)];
}

function stepEnemies(state: GameState, dt: number): void {
  if (state.freezeTimer > 0) {
    state.freezeTimer = Math.max(0, state.freezeTimer - dt);
  }

  // Spawn timer
  if (state.enemyQueue.length > 0 && state.enemies.length < state.maxActiveEnemies) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state);
      // Faster spawns on higher stages
      const baseInterval = Math.max(1.4, 2.9 - state.stage * 0.04);
      state.spawnTimer = baseInterval;
    }
  }

  // Crowd attack fairness: cap simultaneous enemy bullets
  const maxEnemyBullets = state.players.length === 2 ? 5 : 4;
  let currentEnemyBullets = state.bullets.filter((b) => b.ownerId === 'enemy').length;

  for (const e of state.enemies) {
    if (e.spawnAnim > 0) {
      e.spawnAnim = Math.max(0, e.spawnAnim - dt);
      continue;
    }
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 6);

    if (state.freezeTimer > 0) continue;

    const stats = ENEMY_STATS[e.kind];
    e.aiTurnTimer -= dt;
    e.fireCooldown -= dt;

    const moved = moveTankWithAssist(
      state,
      e,
      e.dir,
      stats.speed,
      dt,
      false,
      undefined,
      e.id
    );

    if (!moved) {
      e.aiStuckFrames++;
      if (e.aiStuckFrames > 6) {
        e.dir = chooseEnemyDirection(state, e);
        e.aiStuckFrames = 0;
        e.aiTurnTimer = 0.7 + nextRand(state) * 1.4;
      }
    } else {
      e.aiStuckFrames = 0;
      if (e.aiTurnTimer <= 0) {
        e.dir = chooseEnemyDirection(state, e);
        e.aiTurnTimer = 1.1 + nextRand(state) * 1.9;
      }
    }

    // Firing decision
    const enemyHasBullet = state.bullets.some((b) => b.ownerEnemyId === e.id);
    if (e.fireCooldown <= 0 && !enemyHasBullet && currentEnemyBullets < maxEnemyBullets) {
      const { dx, dy } = dirVector(e.dir);
      const cx = e.x + TANK_SIZE / 2;
      const cy = e.y + TANK_SIZE / 2;
      state.bullets.push({
        id: state.nextEntityId++,
        ownerId: 'enemy',
        ownerEnemyId: e.id,
        x: cx + dx * (TANK_SIZE / 2 + 1) - BULLET_SIZE / 2,
        y: cy + dy * (TANK_SIZE / 2 + 1) - BULLET_SIZE / 2,
        dir: e.dir,
        speed: stats.bulletSpeed,
        power: e.kind === 'power' ? 1 : 1,
      });
      e.recoil = 0.85;
      e.fireCooldown = stats.fireInterval * (0.75 + nextRand(state) * 0.55);
      currentEnemyBullets++;
    }
  }
}

function handleBulletTileImpact(state: GameState, b: Bullet): boolean {
  // Check map boundaries
  if (
    b.x < 0 ||
    b.y < 0 ||
    b.x + BULLET_SIZE > WORLD_SIZE ||
    b.y + BULLET_SIZE > WORLD_SIZE
  ) {
    if (b.ownerId !== 'enemy') {
      state.events.push({ type: 'steel_hit', x: b.x + 3, y: b.y + 3 });
    }
    return true;
  }

  // Expand bullet impact laterally across the 2 half-tile cells along the tank's firing face
  // so 1 shot cleanly carves a tank-width notch in bricks just like NES Battle City!
  const cx = b.x + BULLET_SIZE / 2;
  const cy = b.y + BULLET_SIZE / 2;
  const isVertical = b.dir === Direction.UP || b.dir === Direction.DOWN;

  const samplePoints: [number, number][] = isVertical
    ? [
        [cx - 6, cy],
        [cx + 6, cy],
      ]
    : [
        [cx, cy - 6],
        [cx, cy + 6],
      ];

  let hitBrick = false;
  let hitSteel = false;
  let hitEagle = false;

  for (const [sx, sy] of samplePoints) {
    const gx = Math.floor(sx / CELL_SIZE);
    const gy = Math.floor(sy / CELL_SIZE);
    const tile = getTile(state.grid, gx, gy);

    if (tile === TileType.BRICK) {
      setTile(state.grid, gx, gy, TileType.EMPTY);
      hitBrick = true;
    } else if (tile === TileType.STEEL) {
      if (b.power >= 2) {
        setTile(state.grid, gx, gy, TileType.EMPTY);
        hitBrick = true;
      } else {
        hitSteel = true;
      }
    } else if (tile === TileType.EAGLE) {
      hitEagle = true;
    }
  }

  if (hitEagle && state.eagleAlive) {
    state.eagleAlive = false;
    setTile(state.grid, 12, 24, TileType.EAGLE_DEAD);
    setTile(state.grid, 13, 24, TileType.EAGLE_DEAD);
    setTile(state.grid, 12, 25, TileType.EAGLE_DEAD);
    setTile(state.grid, 13, 25, TileType.EAGLE_DEAD);
    state.status = 'game_over';
    state.statusDelay = 1.1;
    state.events.push({
      type: 'eagle_explode',
      x: 13 * CELL_SIZE,
      y: 25 * CELL_SIZE,
      heavy: true,
    });
    state.events.push({ type: 'game_over', x: 13 * CELL_SIZE, y: 25 * CELL_SIZE });
    return true;
  }

  if (hitBrick) {
    state.events.push({ type: 'brick_hit', x: cx, y: cy });
    return true;
  }
  if (hitSteel) {
    if (b.ownerId !== 'enemy') {
      state.events.push({ type: 'steel_hit', x: cx, y: cy });
    }
    return true;
  }
  return false;
}

function stepBullets(state: GameState, dt: number): void {
  const removeIds = new Set<number>();

  // Move bullets
  for (const b of state.bullets) {
    const { dx, dy } = dirVector(b.dir);
    b.x += dx * b.speed * dt;
    b.y += dy * b.speed * dt;
  }

  // Bullet vs Bullet interception
  for (let i = 0; i < state.bullets.length; i++) {
    const a = state.bullets[i];
    if (removeIds.has(a.id)) continue;
    for (let j = i + 1; j < state.bullets.length; j++) {
      const b = state.bullets[j];
      if (removeIds.has(b.id)) continue;
      if (a.ownerId === b.ownerId) continue;
      if (rectsOverlap(a.x, a.y, BULLET_SIZE, BULLET_SIZE, b.x, b.y, BULLET_SIZE, BULLET_SIZE)) {
        removeIds.add(a.id);
        removeIds.add(b.id);
      }
    }
  }

  // Bullet vs Tiles & Tanks
  for (const b of state.bullets) {
    if (removeIds.has(b.id)) continue;

    if (handleBulletTileImpact(state, b)) {
      removeIds.add(b.id);
      continue;
    }

    // Player bullet vs Enemies
    if (b.ownerId !== 'enemy') {
      let hitTank = false;
      for (let ei = state.enemies.length - 1; ei >= 0; ei--) {
        const e = state.enemies[ei];
        if (e.spawnAnim > 0) continue;
        if (rectsOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, e.x, e.y, TANK_SIZE, TANK_SIZE)) {
          removeIds.add(b.id);
          hitTank = true;

          if (e.bonus) {
            e.bonus = false;
            spawnPowerUp(state);
          }

          e.hp -= b.power >= 2 ? 2 : 1;
          e.hitFlash = 0.08;

          if (e.hp <= 0) {
            const shooter = state.players.find((p) => p.id === b.ownerId);
            const pts = ENEMY_SCORE[e.kind];
            if (shooter) {
              shooter.score += pts;
              shooter.kills[e.kind] += 1;
            }
            state.events.push({
              type: 'tank_explode',
              x: e.x + TANK_SIZE / 2,
              y: e.y + TANK_SIZE / 2,
              value: pts,
              heavy: e.kind === 'armor' || e.kind === 'power',
            });
            state.enemies.splice(ei, 1);
          } else {
            state.events.push({
              type: 'armor_hit',
              x: e.x + TANK_SIZE / 2,
              y: e.y + TANK_SIZE / 2,
            });
          }
          break;
        }
      }
      if (hitTank) continue;

      // Player bullet vs Ally (Friendly fire stun, authentic Battle City!)
      if (state.friendlyFire) {
        for (const p of state.players) {
          if (!p.alive || p.id === b.ownerId) continue;
          if (rectsOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, p.x, p.y, TANK_SIZE, TANK_SIZE)) {
            removeIds.add(b.id);
            if (p.shieldTimer <= 0) {
              p.stunTimer = 2.5;
            }
            break;
          }
        }
      }
    } else {
      // Enemy bullet vs Players
      for (const p of state.players) {
        if (!p.alive) continue;
        if (rectsOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, p.x, p.y, TANK_SIZE, TANK_SIZE)) {
          removeIds.add(b.id);
          if (p.shieldTimer > 0) {
            state.events.push({ type: 'steel_hit', x: b.x + 3, y: b.y + 3 });
          } else if (p.hasBoat) {
            // Tank 1990 Boat absorbs 1 extra hit!
            p.hasBoat = false;
            p.shieldTimer = 1.2;
            state.events.push({ type: 'armor_hit', x: p.x + TANK_SIZE / 2, y: p.y + TANK_SIZE / 2 });
          } else {
            p.alive = false;
            p.lives -= 1;
            p.tier = 0;
            p.respawnTimer = p.lives > 0 ? 1.5 : 0;
            state.events.push({
              type: 'player_explode',
              x: p.x + TANK_SIZE / 2,
              y: p.y + TANK_SIZE / 2,
              heavy: true,
            });
          }
          break;
        }
      }
    }
  }

  if (removeIds.size > 0) {
    state.bullets = state.bullets.filter((b) => !removeIds.has(b.id));
  }
}

/**
 * Full authoritative tick step (60 Hz).
 * Advances players, enemies, bullets, power-ups, timers, and win/loss conditions.
 */
export function stepGameState(
  state: GameState,
  inputsByPlayerId: Record<string, PlayerInput | undefined>,
  dt: number = FIXED_DT
): SimEvent[] {
  state.events = [];
  state.tick += 1;
  state.stageTimer += dt;

  if (state.status !== 'playing') {
    if (state.statusDelay > 0) {
      state.statusDelay = Math.max(0, state.statusDelay - dt);
    }
    return state.events;
  }

  // Fortress Shovel timer (18s total, last 3s flashes between steel and brick)
  if (state.fortressTimer > 0) {
    state.fortressTimer = Math.max(0, state.fortressTimer - dt);
    if (state.fortressTimer <= 0) {
      setFortressTiles(state.grid, TileType.BRICK);
    } else if (state.fortressTimer <= 3.0) {
      const flashSteel = Math.floor(state.fortressTimer * 6) % 2 === 0;
      setFortressTiles(state.grid, flashSteel ? TileType.STEEL : TileType.BRICK);
    }
  }

  // Update player timers, respawns, and apply player inputs
  for (const p of state.players) {
    if (p.shieldTimer > 0) {
      p.shieldTimer = Math.max(0, p.shieldTimer - dt);
    }

    if (!p.alive) {
      if (p.lives > 0) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          const sp = PLAYER_SPAWNS[p.slot];
          p.x = sp.x;
          p.y = sp.y;
          p.dir = Direction.UP;
          p.alive = true;
          p.shieldTimer = 3.0;
          p.fireCooldown = 0;
          p.stunTimer = 0;
          p.iceSlideTimer = 0;
        }
      }
      continue;
    }

    const input = inputsByPlayerId[p.id];
    if (input) {
      stepPlayerInput(state, p.id, input, dt, false);
    } else {
      // Decay cooldowns & ice slide even if no input arrived this tick
      stepPlayerInput(
        state,
        p.id,
        { seq: p.lastProcessedSeq, dir: null, fire: false },
        dt,
        false
      );
    }
  }

  // Power-up pickups & expiration
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const pu = state.powerUps[i];
    pu.timer -= dt;
    if (pu.timer <= 0) {
      state.powerUps.splice(i, 1);
      continue;
    }
    for (const p of state.players) {
      if (!p.alive) continue;
      if (rectsOverlap(p.x, p.y, TANK_SIZE, TANK_SIZE, pu.x, pu.y, 28, 28)) {
        applyPowerUp(state, p, pu);
        state.powerUps.splice(i, 1);
        break;
      }
    }
  }

  // Step Enemies & Bullets
  stepEnemies(state, dt);
  stepBullets(state, dt);

  // Check Defeat (all players dead with 0 lives)
  const anyPlayerActive = state.players.some((p) => p.alive || p.lives > 0);
  if (!anyPlayerActive && state.status === 'playing') {
    state.status = 'game_over';
    state.statusDelay = 0.85;
    state.events.push({ type: 'game_over', x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });
  }

  // Check Victory (all 20 enemies destroyed)
  if (
    state.status === 'playing' &&
    state.enemyQueue.length === 0 &&
    state.enemies.length === 0
  ) {
    state.status = 'stage_clear';
    state.statusDelay = 1.6;
    state.events.push({ type: 'stage_clear', x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });
  }

  return state.events;
}

export interface ReconciliationResult {
  reconciledState: GameState;
  remainingInputs: PlayerInput[];
  errorX: number;
  errorY: number;
}

/**
 * Client-Side Prediction & Server Reconciliation:
 * 1. Captures the client's current predicted local player visual position.
 * 2. Accepts the server's authoritative snapshot as the new baseline.
 * 3. Drops inputs already acknowledged by the server (seq <= lastProcessedSeq).
 * 4. Replays every unacknowledged input deterministically through stepPlayerInput().
 * 5. Returns the tiny residual visual offset (errorX, errorY) so the renderer can
 *    exponentially damp it to 0 over ~80ms — making ping completely imperceptible!
 */
export function reconcileClientState(
  prevLocalState: GameState | null,
  serverSnapshot: GameState,
  localPlayerId: string,
  pendingInputs: PlayerInput[]
): ReconciliationResult {
  const prevPlayer = prevLocalState?.players.find((p) => p.id === localPlayerId);
  const nextState = cloneGameState(serverSnapshot);
  const authPlayer = nextState.players.find((p) => p.id === localPlayerId);

  if (!authPlayer) {
    return {
      reconciledState: nextState,
      remainingInputs: [],
      errorX: 0,
      errorY: 0,
    };
  }

  const ackSeq = authPlayer.lastProcessedSeq;
  const remainingInputs = pendingInputs.filter((inp) => inp.seq > ackSeq);

  // Replay all unacknowledged local inputs deterministically
  for (const inp of remainingInputs) {
    stepPlayerInput(nextState, localPlayerId, inp, FIXED_DT, true);
  }

  let errorX = 0;
  let errorY = 0;
  if (prevPlayer && prevPlayer.alive && authPlayer.alive) {
    const dx = prevPlayer.x - authPlayer.x;
    const dy = prevPlayer.y - authPlayer.y;
    // Only smooth small discrepancies (< 48px); huge jumps (e.g. respawn) snap immediately
    if (Math.hypot(dx, dy) < 48) {
      errorX = dx;
      errorY = dy;
    }
  }

  return {
    reconciledState: nextState,
    remainingInputs,
    errorX,
    errorY,
  };
}

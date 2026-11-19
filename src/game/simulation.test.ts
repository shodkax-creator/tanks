import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, TOTAL_STAGES, buildEnemyQueue, buildStageGrid } from './levels.ts';
import {
  applyPowerUp,
  cloneGameState,
  createGameState,
  getTile,
  reconcileClientState,
  setTile,
  stepGameState,
  stepPlayerInput,
} from './simulation.ts';
import {
  CELL_SIZE,
  Direction,
  FIXED_DT,
  GRID_SIZE,
  PlayerInput,
  TileType,
} from './types.ts';

test('all 35 Battle City stages build valid 26x26 grids with intact Eagle HQ and 20 enemies', () => {
  assert.equal(TOTAL_STAGES, 35);
  assert.equal(STAGES.length, 35);

  for (let stage = 1; stage <= 35; stage++) {
    const grid = buildStageGrid(stage);
    assert.equal(grid.length, GRID_SIZE * GRID_SIZE, `Stage ${stage} grid size`);

    // Eagle HQ must be intact at bottom center
    assert.equal(getTile(grid, 12, 24), TileType.EAGLE, `Stage ${stage} Eagle TL`);
    assert.equal(getTile(grid, 13, 24), TileType.EAGLE, `Stage ${stage} Eagle TR`);
    assert.equal(getTile(grid, 12, 25), TileType.EAGLE, `Stage ${stage} Eagle BL`);
    assert.equal(getTile(grid, 13, 25), TileType.EAGLE, `Stage ${stage} Eagle BR`);

    // Player 1 spawn area must be clear
    assert.equal(getTile(grid, 8, 24), TileType.EMPTY, `Stage ${stage} P1 spawn clear`);
    assert.equal(getTile(grid, 9, 24), TileType.EMPTY, `Stage ${stage} P1 spawn clear`);

    // Exactly 20 enemies per stage
    const queue = buildEnemyQueue(stage);
    assert.equal(queue.length, 20, `Stage ${stage} must have 20 enemies`);
  }
});

test('player tank moves cleanly upward from spawn and fires bullet destroying brick', () => {
  const state = createGameState({ stage: 1, playerCount: 1 });
  const p1 = state.players[0];
  const startY = p1.y;

  // Move UP for 10 ticks
  for (let i = 1; i <= 10; i++) {
    stepGameState(state, { p1: { seq: i, dir: Direction.UP, fire: false } }, FIXED_DT);
  }
  assert.ok(p1.y < startY - 10, 'Player tank should move upward');

  // Place a brick directly above player and shoot it
  const gx = Math.floor((p1.x + 14) / CELL_SIZE);
  const gy = Math.floor(p1.y / CELL_SIZE) - 2;
  setTile(state.grid, gx, gy, TileType.BRICK);

  stepGameState(state, { p1: { seq: 11, dir: Direction.UP, fire: true } }, FIXED_DT);
  assert.equal(state.bullets.length, 1, 'Shot should spawn 1 bullet');

  for (let i = 12; i <= 45; i++) {
    stepGameState(state, {}, FIXED_DT);
  }
  assert.equal(getTile(state.grid, gx, gy), TileType.EMPTY, 'Brick should be destroyed by bullet');
});

test('steel wall blocks tier 0 bullets but breaks at tier 3 (Star x3 / Gun)', () => {
  const state = createGameState({ stage: 1, playerCount: 1 });
  const p1 = state.players[0];
  const gx = Math.floor((p1.x + 14) / CELL_SIZE);
  const gy = Math.floor(p1.y / CELL_SIZE) - 2;
  setTile(state.grid, gx, gy, TileType.STEEL);

  // Tier 0 shot should NOT destroy steel
  stepGameState(state, { p1: { seq: 1, dir: Direction.UP, fire: true } }, FIXED_DT);
  for (let i = 0; i < 30; i++) stepGameState(state, {}, FIXED_DT);
  assert.equal(getTile(state.grid, gx, gy), TileType.STEEL, 'Tier 0 cannot break steel');

  // Upgrade to Tier 3 via Gun powerup
  applyPowerUp(state, p1, { id: 999, kind: 'gun', x: p1.x, y: p1.y, timer: 10 });
  assert.equal(p1.tier, 3);

  p1.fireCooldown = 0;
  stepGameState(state, { p1: { seq: 2, dir: Direction.UP, fire: true } }, FIXED_DT);
  for (let i = 0; i < 30; i++) stepGameState(state, {}, FIXED_DT);
  assert.equal(getTile(state.grid, gx, gy), TileType.EMPTY, 'Tier 3 breaks steel wall');
});

test('Shovel power-up reinforces Eagle fortress with steel and reverts cleanly', () => {
  const state = createGameState({ stage: 1, playerCount: 1 });
  const p1 = state.players[0];

  applyPowerUp(state, p1, { id: 500, kind: 'shovel', x: p1.x, y: p1.y, timer: 10 });
  assert.equal(getTile(state.grid, 12, 23), TileType.STEEL);
  assert.ok(state.fortressTimer > 17);

  // Advance past 18s
  for (let i = 0; i < 60 * 19; i++) {
    stepGameState(state, {}, FIXED_DT);
  }
  assert.equal(getTile(state.grid, 12, 23), TileType.BRICK);
});

test('destroying Eagle HQ triggers game_over state', () => {
  const state = createGameState({ stage: 1, playerCount: 1 });
  const p1 = state.players[0];
  // Position player left of Eagle facing right, clear brick wall between
  setTile(state.grid, 11, 24, TileType.EMPTY);
  setTile(state.grid, 11, 25, TileType.EMPTY);
  p1.x = 9 * CELL_SIZE;
  p1.y = 24 * CELL_SIZE + 2;
  p1.dir = Direction.RIGHT;

  stepGameState(state, { p1: { seq: 1, dir: Direction.RIGHT, fire: true } }, FIXED_DT);
  for (let i = 0; i < 30; i++) stepGameState(state, {}, FIXED_DT);

  assert.equal(state.eagleAlive, false);
  assert.equal(state.status, 'game_over');
});

test('client-side prediction & server reconciliation converges with zero drift under latency', () => {
  const serverState = createGameState({ stage: 1, playerCount: 2 });
  const clientState = cloneGameState(serverState);

  // Suppose client has 100ms RTT -> sends 6 inputs (seq 1..6) and predicts them immediately locally
  const pendingInputs: PlayerInput[] = [];
  for (let seq = 1; seq <= 6; seq++) {
    const inp: PlayerInput = { seq, dir: Direction.UP, fire: false };
    pendingInputs.push(inp);
    stepPlayerInput(clientState, 'p1', inp, FIXED_DT, true);
  }

  // Server has only processed seq 1..3 so far and sends authoritative snapshot
  for (let seq = 1; seq <= 3; seq++) {
    stepGameState(
      serverState,
      { p1: { seq, dir: Direction.UP, fire: false } },
      FIXED_DT
    );
  }
  const serverSnap1 = cloneGameState(serverState);

  // Client reconciles against serverSnap1 (ackSeq = 3), replaying seq 4..6
  const rec = reconcileClientState(clientState, serverSnap1, 'p1', pendingInputs);
  assert.equal(rec.remainingInputs.length, 3, 'Should retain unacked inputs 4..6');
  assert.equal(rec.remainingInputs[0].seq, 4);

  // Residual visual error should be near zero because deterministic physics matched!
  assert.ok(Math.abs(rec.errorX) < 0.001, `Expected ~0 errorX, got ${rec.errorX}`);
  assert.ok(Math.abs(rec.errorY) < 0.001, `Expected ~0 errorY, got ${rec.errorY}`);

  // Now server processes remaining inputs 4..6
  for (let seq = 4; seq <= 6; seq++) {
    stepGameState(
      serverState,
      { p1: { seq, dir: Direction.UP, fire: false } },
      FIXED_DT
    );
  }

  const clientP1 = rec.reconciledState.players.find((p) => p.id === 'p1')!;
  const serverP1 = serverState.players.find((p) => p.id === 'p1')!;
  assert.ok(
    Math.abs(clientP1.x - serverP1.x) < 0.001 && Math.abs(clientP1.y - serverP1.y) < 0.001,
    `Predicted (${clientP1.x}, ${clientP1.y}) must match authoritative (${serverP1.x}, ${serverP1.y})`
  );
});

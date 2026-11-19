import {
  BULLET_SIZE,
  CELL_SIZE,
  Direction,
  EnemyKind,
  EnemyTank,
  GRID_SIZE,
  GameState,
  PlayerTank,
  PowerUp,
  SimEvent,
  TANK_SIZE,
  TileType,
  WORLD_SIZE,
} from './types.ts';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingPopup {
  active: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface ExplosionRing {
  active: boolean;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
}

const MAX_PARTICLES = 180;
const MAX_POPUPS = 16;
const MAX_EXPLOSIONS = 20;

export class TankRenderer {
  private particles: Particle[] = [];
  private particleCursor = 0;
  private popups: FloatingPopup[] = [];
  private popupCursor = 0;
  private explosions: ExplosionRing[] = [];
  private explosionCursor = 0;

  public shakeTrauma = 0;
  public hitstopTimer = 0;
  private animTime = 0;
  private tileCacheCanvas: HTMLCanvasElement | null = null;
  private cachedGridSignature = '';

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 3,
        color: '#fff',
      });
    }
    for (let i = 0; i < MAX_POPUPS; i++) {
      this.popups.push({
        active: false,
        x: 0,
        y: 0,
        text: '',
        life: 0,
        color: '#fff',
      });
    }
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      this.explosions.push({
        active: false,
        x: 0,
        y: 0,
        life: 0,
        maxLife: 0.3,
        radius: 22,
      });
    }
  }

  public resetEffects(): void {
    for (const p of this.particles) p.active = false;
    for (const po of this.popups) po.active = false;
    for (const ex of this.explosions) ex.active = false;
    this.shakeTrauma = 0;
    this.hitstopTimer = 0;
    this.cachedGridSignature = '';
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
  }

  private spawnBurst(x: number, y: number, count: number, colors: string[], speed: number): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.4 + Math.random() * 0.85);
      this.spawnParticle(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        0.22 + Math.random() * 0.28,
        2 + Math.random() * 3.5,
        colors[i % colors.length]
      );
    }
  }

  private spawnPopup(x: number, y: number, text: string, color: string): void {
    const po = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % MAX_POPUPS;
    po.active = true;
    po.x = x;
    po.y = y;
    po.text = text;
    po.life = 0.95;
    po.color = color;
  }

  private spawnExplosion(x: number, y: number, radius: number, duration: number): void {
    const ex = this.explosions[this.explosionCursor];
    this.explosionCursor = (this.explosionCursor + 1) % MAX_EXPLOSIONS;
    ex.active = true;
    ex.x = x;
    ex.y = y;
    ex.life = duration;
    ex.maxLife = duration;
    ex.radius = radius;
  }

  public consumeEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          this.spawnBurst(ev.x, ev.y, 4, ['#fef08a', '#fb923c'], 55);
          break;
        case 'brick_hit':
          this.spawnBurst(ev.x, ev.y, 6, ['#c85a32', '#9a3412', '#fdba74'], 85);
          this.spawnExplosion(ev.x, ev.y, 10, 0.14);
          break;
        case 'steel_hit':
          this.spawnBurst(ev.x, ev.y, 5, ['#f8fafc', '#93c5fd', '#fde047'], 110);
          this.spawnExplosion(ev.x, ev.y, 9, 0.12);
          break;
        case 'armor_hit':
          this.spawnBurst(ev.x, ev.y, 8, ['#fde047', '#f97316', '#ffffff'], 125);
          this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.18);
          break;
        case 'tank_explode':
          this.spawnExplosion(ev.x, ev.y, ev.heavy ? 28 : 22, ev.heavy ? 0.38 : 0.28);
          this.spawnBurst(
            ev.x,
            ev.y,
            ev.heavy ? 22 : 14,
            ['#fff7ed', '#fde047', '#f97316', '#dc2626', '#475569'],
            ev.heavy ? 165 : 130
          );
          this.shakeTrauma = Math.min(1, this.shakeTrauma + (ev.heavy ? 0.5 : 0.28));
          if (ev.heavy) this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
          if (ev.value) {
            this.spawnPopup(ev.x, ev.y - 6, `+${ev.value}`, '#fde047');
          }
          break;
        case 'player_explode':
          this.spawnExplosion(ev.x, ev.y, 30, 0.42);
          this.spawnBurst(ev.x, ev.y, 24, ['#ffffff', '#fde047', '#ef4444', '#f97316'], 175);
          this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.65);
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
          break;
        case 'eagle_explode':
          this.spawnExplosion(ev.x, ev.y, 44, 0.6);
          this.spawnBurst(ev.x, ev.y, 34, ['#ffffff', '#fde047', '#ef4444', '#ea580c'], 210);
          this.shakeTrauma = 1.0;
          this.hitstopTimer = 0.065;
          break;
        case 'powerup_pickup':
          this.spawnBurst(ev.x, ev.y, 12, ['#fef08a', '#34d399', '#ffffff'], 115);
          this.spawnPopup(ev.x, ev.y - 8, ev.label ?? '+500', '#6ee7b7');
          break;
        case 'extra_life':
          this.spawnPopup(ev.x, ev.y - 16, '1UP', '#fde047');
          break;
        default:
          break;
      }
    }
  }

  public updateEffects(realDt: number): void {
    this.animTime += realDt;
    if (this.shakeTrauma > 0) {
      this.shakeTrauma = Math.max(0, this.shakeTrauma - realDt * 2.4);
    }
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - realDt);
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= realDt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * realDt;
      p.y += p.vy * realDt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }

    for (const ex of this.explosions) {
      if (!ex.active) continue;
      ex.life -= realDt;
      if (ex.life <= 0) ex.active = false;
    }

    for (const po of this.popups) {
      if (!po.active) continue;
      po.life -= realDt;
      po.y -= 24 * realDt;
      if (po.life <= 0) po.active = false;
    }
  }

  private ensureStaticTileCache(state: GameState): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.tileCacheCanvas) {
      this.tileCacheCanvas = document.createElement('canvas');
      this.tileCacheCanvas.width = WORLD_SIZE;
      this.tileCacheCanvas.height = WORLD_SIZE;
    }
    const sig = `${state.stage}:${state.eagleAlive ? 1 : 0}:${state.grid.join('')}`;
    if (sig === this.cachedGridSignature) {
      return this.tileCacheCanvas;
    }
    this.cachedGridSignature = sig;

    const cctx = this.tileCacheCanvas.getContext('2d');
    if (!cctx) return null;

    cctx.fillStyle = '#090b0f';
    cctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    cctx.strokeStyle = 'rgba(255,255,255,0.025)';
    cctx.lineWidth = 1;
    for (let i = 1; i < 13; i++) {
      const p = i * 32;
      cctx.beginPath();
      cctx.moveTo(p, 0);
      cctx.lineTo(p, WORLD_SIZE);
      cctx.moveTo(0, p);
      cctx.lineTo(WORLD_SIZE, p);
      cctx.stroke();
    }

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const t = state.grid[gy * GRID_SIZE + gx] as TileType;
        const x = gx * CELL_SIZE;
        const y = gy * CELL_SIZE;
        if (t === TileType.BRICK) {
          this.drawBrickHalfTile(cctx, x, y, (gx + gy) % 2 === 0);
        } else if (t === TileType.STEEL) {
          this.drawSteelHalfTile(cctx, x, y);
        } else if (t === TileType.ICE) {
          this.drawIceHalfTile(cctx, x, y);
        }
      }
    }

    this.drawEagleHQ(cctx, 12 * CELL_SIZE, 24 * CELL_SIZE, state.eagleAlive);
    return this.tileCacheCanvas;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    visualOffsets?: Record<string, { x: number; y: number }>
  ): void {
    ctx.save();

    // Apply decaying trauma*trauma screen shake
    if (this.shakeTrauma > 0.01) {
      const mag = this.shakeTrauma * this.shakeTrauma * 7;
      const sx = (Math.random() * 2 - 1) * mag;
      const sy = (Math.random() * 2 - 1) * mag;
      ctx.fillStyle = '#090b0f';
      ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
      ctx.translate(sx, sy);
    }

    // 1. Static cached ground layer (floor, bricks, steel, ice, Eagle HQ) + animated water
    const cache = this.ensureStaticTileCache(state);
    if (cache) {
      ctx.drawImage(cache, 0, 0);
    }
    this.drawWaterLayer(ctx, state);

    // 2. Players
    for (const p of state.players) {
      if (!p.alive) continue;
      const off = visualOffsets?.[p.id];
      const rx = p.x + (off?.x ?? 0);
      const ry = p.y + (off?.y ?? 0);
      this.drawPlayerTank(ctx, p, rx, ry);
    }

    // 3. Enemies
    for (const e of state.enemies) {
      const off = visualOffsets?.[`e_${e.id}`];
      const rx = e.x + (off?.x ?? 0);
      const ry = e.y + (off?.y ?? 0);
      if (e.spawnAnim > 0) {
        this.drawSpawnStar(ctx, rx + TANK_SIZE / 2, ry + TANK_SIZE / 2, e.spawnAnim);
      } else {
        this.drawEnemyTank(ctx, e, rx, ry, state.freezeTimer > 0);
      }
    }

    // 4. Bullets
    for (const b of state.bullets) {
      this.drawBullet(ctx, b.x, b.y, b.dir, b.power >= 2, b.ownerId !== 'enemy');
    }

    // 5. Forest Canopy (rendered OVER tanks, authentic Battle City!)
    this.drawForestLayer(ctx, state);

    // 6. Power-ups (flashing crisp emblems above canopy)
    for (const pu of state.powerUps) {
      this.drawPowerUp(ctx, pu);
    }

    // 7. Explosions, Particles & Floating Popups
    this.drawExplosionsAndParticles(ctx);

    ctx.restore();
  }

  private drawWaterLayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const waterPhase = Math.floor(this.animTime * 2.5) % 2;

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        if (state.grid[gy * GRID_SIZE + gx] !== TileType.WATER) continue;
        this.drawWaterHalfTile(ctx, gx * CELL_SIZE, gy * CELL_SIZE, waterPhase, gx + gy);
      }
    }
  }

  private drawBrickHalfTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    alt: boolean
  ): void {
    // Rich terracotta brick with crisp mortar
    ctx.fillStyle = '#9e3b1e';
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

    ctx.fillStyle = '#c9532b';
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, 6);
    ctx.fillRect(x + 1, y + 9, CELL_SIZE - 2, 6);

    // Top highlight bevel
    ctx.fillStyle = '#e07243';
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, 1.5);
    ctx.fillRect(x + 1, y + 9, CELL_SIZE - 2, 1.5);

    // Mortar lines
    ctx.fillStyle = '#2d1c17';
    ctx.fillRect(x, y + 7, CELL_SIZE, 2);
    ctx.fillRect(x, y + 15, CELL_SIZE, 1);
    const splitTop = alt ? 8 : 4;
    const splitBot = alt ? 4 : 10;
    ctx.fillRect(x + splitTop, y, 2, 8);
    ctx.fillRect(x + splitBot, y + 8, 2, 8);
  }

  private drawSteelHalfTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#6c7684';
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    // Light beveled top-left
    ctx.fillStyle = '#dce3ec';
    ctx.fillRect(x, y, CELL_SIZE, 2);
    ctx.fillRect(x, y, 2, CELL_SIZE);
    // Dark beveled bottom-right
    ctx.fillStyle = '#3b424d';
    ctx.fillRect(x, y + CELL_SIZE - 2, CELL_SIZE, 2);
    ctx.fillRect(x + CELL_SIZE - 2, y, 2, CELL_SIZE);
    // Machined center plate
    ctx.fillStyle = '#bcc6d4';
    ctx.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
    // Rivet dot
    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(x + 4, y + 4, 3, 3);
  }

  private drawWaterHalfTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    phase: number,
    seed: number
  ): void {
    ctx.fillStyle = '#18478a';
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    ctx.fillStyle = '#2563b8';
    const shift = ((phase + seed) % 2) * 3;
    ctx.fillRect(x + 2 + shift, y + 3, 7, 2);
    ctx.fillRect(x + 5 - shift * 0.5, y + 10, 8, 2);
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(x + 3 + shift, y + 3, 3, 1);
  }

  private drawIceHalfTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#9bb8cc';
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    ctx.fillStyle = '#cfe4f2';
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    ctx.strokeStyle = '#6d94b0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 12);
    ctx.lineTo(x + 12, y + 3);
    ctx.moveTo(x + 8, y + 14);
    ctx.lineTo(x + 14, y + 8);
    ctx.stroke();
  }

  private drawForestLayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        if (state.grid[gy * GRID_SIZE + gx] !== TileType.FOREST) continue;
        const x = gx * CELL_SIZE;
        const y = gy * CELL_SIZE;
        ctx.fillStyle = 'rgba(20, 83, 45, 0.88)';
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.fillStyle = 'rgba(34, 139, 64, 0.9)';
        ctx.fillRect(x + 2, y + 2, 6, 6);
        ctx.fillRect(x + 8, y + 7, 6, 6);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.65)';
        ctx.fillRect(x + 3, y + 3, 3, 2);
        ctx.fillRect(x + 10, y + 9, 3, 2);
      }
    }
  }

  private drawEagleHQ(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    alive: boolean
  ): void {
    ctx.save();
    ctx.fillStyle = '#181c24';
    ctx.fillRect(x + 1, y + 1, 30, 30);
    ctx.strokeStyle = alive ? '#d97706' : '#52525b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, 29, 29);

    if (alive) {
      // Iconic Battle City Golden Eagle Emblem
      ctx.fillStyle = '#f59e0b';
      // Wings
      ctx.fillRect(x + 4, y + 8, 7, 13);
      ctx.fillRect(x + 21, y + 8, 7, 13);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(x + 5, y + 9, 5, 4);
      ctx.fillRect(x + 22, y + 9, 5, 4);
      // Body & crest
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + 11, y + 6, 10, 18);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x + 13, y + 4, 6, 5);
      // Beak & shield center
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 14, y + 12, 4, 6);
      // Tail
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x + 9, y + 23, 14, 4);
    } else {
      // Destroyed HQ flag / rubble
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(x + 5, y + 20, 22, 7);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(x + 14, y + 7, 2, 16);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(x + 16, y + 8, 9, 6);
    }
    ctx.restore();
  }

  private drawTankChassis(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: Direction,
    treadDist: number,
    recoil: number,
    primary: string,
    light: string,
    dark: string,
    barrelLen: number,
    heavyArmor = false
  ): void {
    ctx.save();
    const cx = x + TANK_SIZE / 2;
    const cy = y + TANK_SIZE / 2;
    ctx.translate(cx, cy);
    const rot =
      dir === Direction.UP
        ? 0
        : dir === Direction.RIGHT
          ? Math.PI / 2
          : dir === Direction.DOWN
            ? Math.PI
            : -Math.PI / 2;
    ctx.rotate(rot);

    // Subtle ground drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-13, -12, 27, 27);

    // Treads (left & right) synced to distance traveled
    const treadPhase = Math.floor(treadDist * 0.45) % 2;
    ctx.fillStyle = '#272c35';
    ctx.fillRect(-14, -13, 6, 26);
    ctx.fillRect(8, -13, 6, 26);

    ctx.fillStyle = '#525b6b';
    for (let ty = -12 + treadPhase * 2; ty < 12; ty += 4) {
      ctx.fillRect(-14, ty, 6, 2);
      ctx.fillRect(8, ty, 6, 2);
    }

    // Hull body
    ctx.fillStyle = dark;
    ctx.fillRect(-9, -11, 18, 22);
    ctx.fillStyle = primary;
    ctx.fillRect(-8, -10, 16, 20);
    ctx.fillStyle = light;
    ctx.fillRect(-8, -10, 16, 3);

    // Extra side plates for heavy / upgraded tanks
    if (heavyArmor) {
      ctx.fillStyle = light;
      ctx.fillRect(-10, -7, 2, 14);
      ctx.fillRect(8, -7, 2, 14);
    }

    // Turret cupola
    const recoilOffset = recoil * 2.4;
    ctx.fillStyle = dark;
    ctx.fillRect(-6, -5 + recoilOffset * 0.4, 12, 11);
    ctx.fillStyle = light;
    ctx.fillRect(-5, -4 + recoilOffset * 0.4, 10, 9);
    ctx.fillStyle = primary;
    ctx.fillRect(-3, -2 + recoilOffset * 0.4, 6, 5);

    // Gun barrel
    ctx.fillStyle = dark;
    ctx.fillRect(-2.5, -barrelLen + recoilOffset, 5, barrelLen - 2);
    ctx.fillStyle = light;
    ctx.fillRect(-1.5, -barrelLen + recoilOffset, 3, barrelLen - 3);
    // Muzzle brake
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-2.5, -barrelLen + recoilOffset, 5, 2);

    ctx.restore();
  }

  private drawPlayerTank(
    ctx: CanvasRenderingContext2D,
    p: PlayerTank,
    x: number,
    y: number
  ): void {
    // Stunned blink (friendly fire)
    if (p.stunTimer > 0 && Math.floor(this.animTime * 14) % 2 === 0) {
      return;
    }

    const isP1 = p.slot === 1;
    const primary = isP1 ? '#eab308' : '#10b981';
    const light = isP1 ? '#fef08a' : '#6ee7b7';
    const dark = isP1 ? '#a16207' : '#047857';

    // Boat hull ring (Tank 1990 water-crossing aura)
    if (p.hasBoat) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, TANK_SIZE + 2, TANK_SIZE + 2);
      ctx.restore();
    }

    this.drawTankChassis(
      ctx,
      x,
      y,
      p.dir,
      p.treadDist,
      p.recoil,
      primary,
      light,
      dark,
      14 + p.tier * 1.2,
      p.tier >= 2
    );

    // Star tier pips on tank rear corners (subtle diegetic indicator)
    if (p.tier > 0) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < p.tier; i++) {
        ctx.fillRect(x + 4 + i * 5, y + TANK_SIZE - 4, 3, 2);
      }
    }

    // Helmet / spawn forcefield shield shimmer
    if (p.shieldTimer > 0) {
      const pulse = Math.floor(this.animTime * 14) % 2 === 0;
      ctx.save();
      ctx.strokeStyle = pulse ? '#f8fafc' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x - 2, y - 2, TANK_SIZE + 4, TANK_SIZE + 4);
      ctx.restore();
    }
  }

  private drawEnemyTank(
    ctx: CanvasRenderingContext2D,
    e: EnemyTank,
    x: number,
    y: number,
    frozen: boolean
  ): void {
    let primary = '#cbd5e1';
    let light = '#f8fafc';
    let dark = '#64748b';
    let barrel = 13;
    let heavy = false;

    if (e.kind === 'fast') {
      primary = '#38bdf8';
      light = '#bae6fd';
      dark = '#0369a1';
      barrel = 12;
    } else if (e.kind === 'power') {
      primary = '#f97316';
      light = '#fed7aa';
      dark = '#9a3412';
      barrel = 16;
    } else if (e.kind === 'armor') {
      heavy = true;
      barrel = 15;
      if (e.hp >= 4) {
        primary = '#4ade80';
        light = '#bbf7d0';
        dark = '#166534';
      } else if (e.hp === 3) {
        primary = '#facc15';
        light = '#fef08a';
        dark = '#a16207';
      } else if (e.hp === 2) {
        primary = '#94a3b8';
        light = '#e2e8f0';
        dark = '#475569';
      } else {
        primary = '#f87171';
        light = '#fecaca';
        dark = '#991b1b';
      }
    }

    // Flashing red bonus tank indicator
    if (e.bonus && Math.floor(this.animTime * 9) % 2 === 0) {
      primary = '#ef4444';
      light = '#fecaca';
      dark = '#991b1b';
    }

    // Hit flash override
    if (e.hitFlash > 0) {
      primary = '#ffffff';
      light = '#ffffff';
      dark = '#cbd5e1';
    }

    this.drawTankChassis(ctx, x, y, e.dir, e.treadDist, e.recoil, primary, light, dark, barrel, heavy);

    if (frozen) {
      ctx.fillStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.fillRect(x, y, TANK_SIZE, TANK_SIZE);
    }
  }

  private drawSpawnStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    remain: number
  ): void {
    const r = 6 + Math.abs(Math.sin(remain * 18)) * 9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(remain * 6);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  private drawBullet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: Direction,
    heavy: boolean,
    isPlayer: boolean
  ): void {
    ctx.save();
    ctx.fillStyle = heavy ? '#fde047' : isPlayer ? '#ffffff' : '#fca5a5';
    const w = dir === Direction.LEFT || dir === Direction.RIGHT ? BULLET_SIZE + 2 : BULLET_SIZE - 1;
    const h = dir === Direction.UP || dir === Direction.DOWN ? BULLET_SIZE + 2 : BULLET_SIZE - 1;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  private drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp): void {
    // Blink faster when about to expire
    if (pu.timer < 3.5 && Math.floor(this.animTime * 14) % 2 === 0) return;
    const pulse = Math.floor(this.animTime * 6) % 2 === 0;

    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.fillRect(pu.x, pu.y, 28, 28);
    ctx.strokeStyle = pulse ? '#fde047' : '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(pu.x + 1, pu.y + 1, 26, 26);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(pu.x + 3, pu.y + 3, 22, 22);

    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = pu.x + 14;
    const cy = pu.y + 15;
    switch (pu.kind) {
      case 'star':
        ctx.fillStyle = '#facc15';
        ctx.fillText('★', cx, cy);
        break;
      case 'helmet':
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('◈', cx, cy);
        break;
      case 'shovel':
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('■', cx, cy);
        break;
      case 'clock':
        ctx.fillStyle = '#93c5fd';
        ctx.fillText('◷', cx, cy);
        break;
      case 'grenade':
        ctx.fillStyle = '#f87171';
        ctx.fillText('✹', cx, cy);
        break;
      case 'tank':
        ctx.fillStyle = '#4ade80';
        ctx.fillText('1P', cx, cy);
        break;
      case 'gun':
        ctx.fillStyle = '#fb923c';
        ctx.fillText('▲', cx, cy);
        break;
      case 'boat':
        ctx.fillStyle = '#22d3ee';
        ctx.fillText('⚓', cx, cy);
        break;
    }
    ctx.restore();
  }

  private drawExplosionsAndParticles(ctx: CanvasRenderingContext2D): void {
    for (const ex of this.explosions) {
      if (!ex.active) continue;
      const t = 1 - ex.life / ex.maxLife;
      const r = ex.radius * (0.35 + t * 0.75);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = t < 0.35 ? '#ffffff' : t < 0.65 ? '#fde047' : '#ea580c';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const po of this.popups) {
      if (!po.active) continue;
      ctx.globalAlpha = Math.min(1, po.life * 1.4);
      ctx.fillStyle = '#000000';
      ctx.fillText(po.text, po.x + 1, po.y + 1);
      ctx.fillStyle = po.color;
      ctx.fillText(po.text, po.x, po.y);
    }
    ctx.globalAlpha = 1;
  }
}

export function renderStagePreview(
  canvas: HTMLCanvasElement,
  grid: number[]
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cell = w / GRID_SIZE;

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, w, h);

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const t = grid[gy * GRID_SIZE + gx] as TileType;
      if (t === TileType.EMPTY) continue;
      if (t === TileType.BRICK) ctx.fillStyle = '#c9532b';
      else if (t === TileType.STEEL) ctx.fillStyle = '#cbd5e1';
      else if (t === TileType.WATER) ctx.fillStyle = '#2563eb';
      else if (t === TileType.FOREST) ctx.fillStyle = '#228b40';
      else if (t === TileType.ICE) ctx.fillStyle = '#bae6fd';
      else if (t === TileType.EAGLE) ctx.fillStyle = '#facc15';
      else continue;
      ctx.fillRect(gx * cell, gy * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

export function getEnemyTypeLabel(kind: EnemyKind): string {
  switch (kind) {
    case 'basic':
      return 'Обычный';
    case 'fast':
      return 'Быстрый';
    case 'power':
      return 'Штурмовой';
    case 'armor':
      return 'Тяжёлый';
  }
}

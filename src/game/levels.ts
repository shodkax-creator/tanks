import { EnemyKind, GRID_SIZE, TileType } from './types.ts';

export interface StageDefinition {
  stage: number;
  name: string;
  /** 13 rows x 13 cols macro-tiles:
   *  '.' empty, '#' brick, '@' steel, '~' water, '%' forest, '=' ice
   *  Half-tile shorthand:
   *  'u' top-half brick, 'd' bottom-half brick, 'l' left-half brick, 'r' right-half brick
   *  'U' top-half steel, 'D' bottom-half steel, 'L' left-half steel, 'R' right-half steel
   */
  layout: string[];
  enemies: { basic: number; fast: number; power: number; armor: number };
}

/**
 * All 35 authentic Battle City / Tank 1990 stages (13x13 macro-grid -> 26x26 half-tile grid).
 * Bottom center (rows 11-12, cols 5-7) is always reserved for the Eagle HQ and brick fortress,
 * and top row (row 0, cols 0, 6, 12) is cleared for enemy spawns, while (row 12, cols 4 & 8)
 * are guaranteed clear for P1 and P2 spawn lanes.
 */
export const STAGES: StageDefinition[] = [
  // Stage 1: Classic Battle City Iconic Pillars
  {
    stage: 1,
    name: 'Первый рубеж',
    layout: [
      '.............',
      '.#.#.#.#.#.#.',
      '.#.#.#.#.#.#.',
      '.#.#.#@#.#.#.',
      '.#.#.#.#.#.#.',
      '.#.#..#..#.#.',
      '.d.d.#.#.d.d.',
      '#..##...##..#',
      '@..##.#.##..@',
      '.#.#.#.#.#.#.',
      '.#.#.#.#.#.#.',
      '.#.#.....#.#.',
      '.............',
    ],
    enemies: { basic: 18, fast: 2, power: 0, armor: 0 },
  },
  // Stage 2: Twin Steel Bastions & Forest Flanks
  {
    stage: 2,
    name: 'Стальной бастион',
    layout: [
      '.............',
      '.#.#.@.@.#.#.',
      '.#.#..#..#.#.',
      '.#.#..#..#.#.',
      '.%..#...#..%.',
      '.%.@#.#.#@.%.',
      '..#..###..#..',
      '.##.#.@.#.##.',
      '.#..#...#..#.',
      '.#.##.#.##.#.',
      '.#.#..#..#.#.',
      '.....#.#.....',
      '.............',
    ],
    enemies: { basic: 14, fast: 4, power: 0, armor: 2 },
  },
  // Stage 3: River Crossing
  {
    stage: 3,
    name: 'Переправа',
    layout: [
      '.............',
      '..##..#..##..',
      '..##..#..##..',
      '....##@##....',
      '~~~..###..~~~',
      '~~~..#.#..~~~',
      '.%%..###..%%.',
      '.%%.##.##.%%.',
      '..#.#...#.#..',
      '..#.##.##.#..',
      '.##..#.#..##.',
      '.............',
      '.............',
    ],
    enemies: { basic: 14, fast: 4, power: 2, armor: 0 },
  },
  // Stage 4: Forest Ambush
  {
    stage: 4,
    name: 'Лесная засада',
    layout: [
      '.............',
      '.%%.#.#.#.%%.',
      '.%%.#.#.#.%%.',
      '.#..#@#@#..#.',
      '.#.##...##.#.',
      '.%%.#.#.#.%%.',
      '..#..###..#..',
      '@.#.##.##.#.@',
      '..#.#...#.#..',
      '.%%.#.#.#.%%.',
      '.#.##...##.#.',
      '.#.........#.',
      '.............',
    ],
    enemies: { basic: 2, fast: 5, power: 10, armor: 3 },
  },
  // Stage 5: Canal Fortress
  {
    stage: 5,
    name: 'Каналы',
    layout: [
      '.............',
      '.#.#.~~~.#.#.',
      '.#.#.~~~.#.#.',
      '.@....#....@.',
      '..##.###.##..',
      '~~.#..@..#.~~',
      '~~.#.###.#.~~',
      '..##..#..##..',
      '.#..##.##..#.',
      '.#.#..#..#.#.',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 8, fast: 5, power: 5, armor: 2 },
  },
  // Stage 6: Iron Cross
  {
    stage: 6,
    name: 'Железный крест',
    layout: [
      '.............',
      '.#.##.#.##.#.',
      '.#....#....#.',
      '.##.@###@.##.',
      '....#...#....',
      '.##.#.@.#.##.',
      '.#@.#...#.@#.',
      '.##.#.@.#.##.',
      '....#...#....',
      '.##.##.##.##.',
      '.#....#....#.',
      '.#.........#.',
      '.............',
    ],
    enemies: { basic: 9, fast: 2, power: 7, armor: 2 },
  },
  // Stage 7: Frozen Outpost
  {
    stage: 7,
    name: 'Ледяной аванпост',
    layout: [
      '.............',
      '.#.#.===.#.#.',
      '.#.#.===.#.#.',
      '.#..==#==..#.',
      '.@.##.#.##.@.',
      '..==..@..==..',
      '.#==.###.==#.',
      '.#..##.##..#.',
      '..#..===..#..',
      '.##.#===#.##.',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 7, fast: 4, power: 6, armor: 3 },
  },
  // Stage 8: Brick Labyrinth
  {
    stage: 8,
    name: 'Кирпичный лабиринт',
    layout: [
      '.............',
      '.#####.#####.',
      '.#.........#.',
      '.#.###.###.#.',
      '.#.#..@..#.#.',
      '...#.###.#...',
      '@.##.#.#.##.@',
      '...#.#.#.#...',
      '.#.#.....#.#.',
      '.#.###.###.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 7, fast: 4, power: 7, armor: 2 },
  },
  // Stage 9: Twin Islands
  {
    stage: 9,
    name: 'Два острова',
    layout: [
      '.............',
      '.~~~.#.#.~~~.',
      '.~#~.#.#.~#~.',
      '.~~~..@..~~~.',
      '..#.##.##.#..',
      '.##.#...#.##.',
      '.#..#.@.#..#.',
      '.##.#...#.##.',
      '..#.##.##.#..',
      '.%%..#.#..%%.',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 6, fast: 4, power: 7, armor: 3 },
  },
  // Stage 10: Tank Depot
  {
    stage: 10,
    name: 'Танковый полигон',
    layout: [
      '.............',
      '.#..@###@..#.',
      '.#..#...#..#.',
      '.##.#.#.#.##.',
      '....#.#.#....',
      '.@#.##.##.#@.',
      '.##...#...##.',
      '.#..##@##..#.',
      '.#.#.....#.#.',
      '.#.#.###.#.#.',
      '..#.......#..',
      '.............',
      '.............',
    ],
    enemies: { basic: 12, fast: 2, power: 4, armor: 2 },
  },
  // Stage 11: Steel Corridors
  {
    stage: 11,
    name: 'Стальные коридоры',
    layout: [
      '.............',
      '.@.#.#.#.#.@.',
      '.#.#.#@#.#.#.',
      '.#...#.#...#.',
      '.##.@...#.@##',
      '....#.#.#....',
      '.@.##.#.##.@.',
      '....#...#....',
      '.##.#.@.#.##.',
      '.#..#...#..#.',
      '.#.##...##.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 5, fast: 5, power: 4, armor: 6 },
  },
  // Stage 12: Swamp & Steel
  {
    stage: 12,
    name: 'Болотный фронт',
    layout: [
      '.............',
      '.%#.~...~.#%.',
      '.%#.~.@.~.#%.',
      '..#.#.#.#.#..',
      '.~..##.##..~.',
      '.~.#..#..#.~.',
      '.%.#.#@#.#.%.',
      '.%.#..#..#.%.',
      '..###...###..',
      '.#..#.#.#..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 6, power: 8, armor: 6 },
  },
  // Stage 13: Diamond Ring
  {
    stage: 13,
    name: 'Алмазное кольцо',
    layout: [
      '.............',
      '.....###.....',
      '....#...#....',
      '...#.###.#...',
      '..#.#.@.#.#..',
      '.#.#..#..#.#.',
      '.@..#.#.#..@.',
      '.#.#..#..#.#.',
      '..#.#.@.#.#..',
      '...#.###.#...',
      '..#.......#..',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 8, power: 8, armor: 4 },
  },
  // Stage 14: Winter Blitz
  {
    stage: 14,
    name: 'Зимний прорыв',
    layout: [
      '.............',
      '.===.#.#.===.',
      '.=#=.#@#.=#=.',
      '.===.#.#.===.',
      '..#..===..#..',
      '.@#.##=##.#@.',
      '..#.#===#.#..',
      '.===.#.#.===.',
      '.#..##.##..#.',
      '.#.#..#..#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 4, power: 10, armor: 6 },
  },
  // Stage 15: Archipelago
  {
    stage: 15,
    name: 'Архипелаг',
    layout: [
      '.............',
      '..~~.#.#.~~..',
      '..~~.#.#.~~..',
      '.#....@....#.',
      '.#.~~###~~.#.',
      '...~~#@#~~...',
      '.#.~~###~~.#.',
      '.#..#...#..#.',
      '..##.#.#.##..',
      '.#..#...#..#.',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 2, fast: 10, power: 0, armor: 8 },
  },
  // Stage 16: Citadel Gate
  {
    stage: 16,
    name: 'Ворота цитадели',
    layout: [
      '.............',
      '.##.@.#.@.##.',
      '.##.#.#.#.##.',
      '....#.#.#....',
      '.###.@.@.###.',
      '.#....#....#.',
      '.#.###.###.#.',
      '...#..@..#...',
      '.##.##.##.##.',
      '.#..#...#..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 16, fast: 2, power: 0, armor: 2 },
  },
  // Stage 17: Green Maze
  {
    stage: 17,
    name: 'Зелёный лабиринт',
    layout: [
      '.............',
      '.%%%.#.#.%%%.',
      '.%#%.#.#.%#%.',
      '.%%%.#@#.%%%.',
      '..#..#.#..#..',
      '.###.%%%.###.',
      '..@..%#%..@..',
      '.###.%%%.###.',
      '..#..#.#..#..',
      '.%%.##.##.%%.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 8, power: 2, armor: 10 },
  },
  // Stage 18: Twin Bridges
  {
    stage: 18,
    name: 'Два моста',
    layout: [
      '.............',
      '.#.#..#..#.#.',
      '.#.#.###.#.#.',
      '~~~~..#..~~~~',
      '~~~~.#@#.~~~~',
      '..#..#.#..#..',
      '.##.##.##.##.',
      '.#..#...#..#.',
      '.@.##.#.##.@.',
      '..#..#.#..#..',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 2, fast: 8, power: 6, armor: 4 },
  },
  // Stage 19: Artillery Grid
  {
    stage: 19,
    name: 'Артиллерийская сетка',
    layout: [
      '.............',
      '.#.#.#.#.#.#.',
      '..@...@...@..',
      '.#.#.#.#.#.#.',
      '....@...@....',
      '.#.#.###.#.#.',
      '..@..#@#..@..',
      '.#.#.###.#.#.',
      '....@...@....',
      '.#.#.#.#.#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 4, fast: 4, power: 4, armor: 8 },
  },
  // Stage 20: Fortress Ring
  {
    stage: 20,
    name: 'Кольцо обороны',
    layout: [
      '.............',
      '.#.#.@.@.#.#.',
      '.###.#.#.###.',
      '.#....#....#.',
      '.#.@#####@.#.',
      '...#.....#...',
      '.@.#.#@#.#.@.',
      '...#.....#...',
      '.#.###.###.#.',
      '.#..#...#..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 2, fast: 8, power: 2, armor: 8 },
  },
  // Stage 21: River Delta
  {
    stage: 21,
    name: 'Дельта реки',
    layout: [
      '.............',
      '.#..~~#~~..#.',
      '.#..~~#~~..#.',
      '.##..#.#..##.',
      '..~~.#@#.~~..',
      '.#~~.#.#.~~#.',
      '.#...###...#.',
      '.##.##.##.##.',
      '..#..~~~..#..',
      '.#.#..#..#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 6, fast: 2, power: 8, armor: 4 },
  },
  // Stage 22: Glacier Bunker
  {
    stage: 22,
    name: 'Ледниковый бункер',
    layout: [
      '.............',
      '.===.@.@.===.',
      '.#.#.===.#.#.',
      '.#.##===##.#.',
      '..===.#.===..',
      '.@.#.#@#.#.@.',
      '..#..===..#..',
      '.###.===.###.',
      '.#..##.##..#.',
      '.#.#..#..#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 6, fast: 8, power: 2, armor: 4 },
  },
  // Stage 23: Hidden Bastion
  {
    stage: 23,
    name: 'Скрытый бастион',
    layout: [
      '.............',
      '.%%.@###@.%%.',
      '.%%.#...#.%%.',
      '.#..#.@.#..#.',
      '.#.##...##.#.',
      '.%%.#.###.%%.',
      '..#.#.#@#.#..',
      '.##.#.###.##.',
      '.#..#...#..#.',
      '.%%.#.#.#.%%.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 10, power: 4, armor: 6 },
  },
  // Stage 24: Iron Spine
  {
    stage: 24,
    name: 'Железный хребет',
    layout: [
      '.............',
      '.#.#..@..#.#.',
      '.#.#.#@#.#.#.',
      '.#....@....#.',
      '.###.#@#.##..',
      '..#...#...#..',
      '.@#.##@##.#@.',
      '..#...#...#..',
      '.###.#.#.###.',
      '.#..#...#..#.',
      '.#.#.....#.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 10, fast: 4, power: 4, armor: 2 },
  },
  // Stage 25: Sunken City
  {
    stage: 25,
    name: 'Затопленный город',
    layout: [
      '.............',
      '.~#..###..#~.',
      '.~#.#...#.#~.',
      '..#.~~@~~.#..',
      '.##.~~#~~.##.',
      '.#...###...#.',
      '.@.##.#.##.@.',
      '.#.#..#..#.#.',
      '.~.#.###.#.~.',
      '.~..#...#..~.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 8, power: 2, armor: 10 },
  },
  // Stage 26: Checkerboard Siege
  {
    stage: 26,
    name: 'Шахматная осада',
    layout: [
      '.............',
      '.#@.#.#.#.@#.',
      '..#..#@#..#..',
      '.#.#..#..#.#.',
      '.@..##.##..@.',
      '..#.#...#.#..',
      '.#.#.#@#.#.#.',
      '..#.#...#.#..',
      '.@..##.##..@.',
      '.#.#..#..#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 4, fast: 6, power: 4, armor: 6 },
  },
  // Stage 27: Armored Canyon
  {
    stage: 27,
    name: 'Броневой каньон',
    layout: [
      '.............',
      '.##.@...#.##.',
      '.##.@.#.#.##.',
      '.#..@.#.@..#.',
      '.#.##.#.##.#.',
      '...#..@..#...',
      '.@.#.###.#.@.',
      '...#.#.#.#...',
      '.##.#...#.##.',
      '.#..##.##..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 2, fast: 8, power: 2, armor: 8 },
  },
  // Stage 28: Ice & Fire
  {
    stage: 28,
    name: 'Лёд и сталь',
    layout: [
      '.............',
      '.=#=.#.#.=#=.',
      '.===.#@#.#==.',
      '..#..===..#..',
      '.@.##===##.@.',
      '.#.===#===.#.',
      '.#.#.#@#.#.#.',
      '.#.===#===.#.',
      '..##..#..##..',
      '.#..#.#.#..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 15, fast: 2, power: 1, armor: 2 },
  },
  // Stage 29: Twin Towers
  {
    stage: 29,
    name: 'Башни-близнецы',
    layout: [
      '.............',
      '.###..#..###.',
      '.#@#..#..#@#.',
      '.###.#@#.###.',
      '.....#.#.....',
      '.##.##.##.##.',
      '.#@.#...#.@#.',
      '.##.#.@.#.##.',
      '....#...#....',
      '.###.#.#.###.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 10, power: 4, armor: 6 },
  },
  // Stage 30: Jungle Rivers
  {
    stage: 30,
    name: 'Тропический прорыв',
    layout: [
      '.............',
      '.%~~.#.#.~~%.',
      '.%~~.#@#.~#%.',
      '..#..#.#..#..',
      '.%%.##.##.%%.',
      '.#..~~#~~..#.',
      '.@.#.~~~.#.@.',
      '.#.#..#..#.#.',
      '.%%.##.##.%%.',
      '.#..#...#..#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 4, fast: 8, power: 4, armor: 4 },
  },
  // Stage 31: Steel Foundry
  {
    stage: 31,
    name: 'Сталелитейный завод',
    layout: [
      '.............',
      '.@.#.@.@.#.@.',
      '.#.#.#.#.#.#.',
      '.#..##@##..#.',
      '..#.#...#.#..',
      '.@#.#.@.#.#@.',
      '..#.#...#.#..',
      '.#..##@##..#.',
      '.#.#..#..#.#.',
      '.@.#.###.#.@.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 8, power: 6, armor: 6 },
  },
  // Stage 32: Crossfire Plaza
  {
    stage: 32,
    name: 'Площадь перекрёстного огня',
    layout: [
      '.............',
      '.#.##.#.##.#.',
      '.#..@.#.@..#.',
      '..#..###..#..',
      '.@.#.#@#.#.@.',
      '.###..#..###.',
      '..#..#@#..#..',
      '.###..#..###.',
      '.@.#.#@#.#.@.',
      '..#.##.##.#..',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 6, power: 8, armor: 6 },
  },
  // Stage 33: Frozen Harbor
  {
    stage: 33,
    name: 'Ледяная гавань',
    layout: [
      '.............',
      '.~~~.===.~~~.',
      '.~#~.=#=.#~~.',
      '..#..===..#..',
      '.@#.##@##.#@.',
      '..=..#.#..=..',
      '.#=.#===#.=#.',
      '.#..##.##..#.',
      '.~~~..#..~~~.',
      '.#.#.#.#.#.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 4, power: 8, armor: 8 },
  },
  // Stage 34: Heavy Vanguard
  {
    stage: 34,
    name: 'Тяжёлый авангард',
    layout: [
      '.............',
      '.@##.#.#.##@.',
      '.#...#@#...#.',
      '.#.##.#.##.#.',
      '..#..@.@..#..',
      '.##.#...#.##.',
      '.#@.#.#.#.@#.',
      '.##.#.@.#.##.',
      '..#..#.#..#..',
      '.#.##...##.#.',
      '.#.........#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 4, power: 6, armor: 10 },
  },
  // Stage 35: Final Citadel (Boss Stage!)
  {
    stage: 35,
    name: 'Последняя цитадель',
    layout: [
      '.............',
      '.#@#.#.#.#@#.',
      '.#.#.~~~.#.#.',
      '.@..##@##..@.',
      '.%%.#...#.%%.',
      '.##.#.@.#.##.',
      '.@=.#.@.#.=@.',
      '.##.#...#.##.',
      '.%%.##.##.%%.',
      '.#.#..#..#.#.',
      '.#.##...##.#.',
      '.............',
      '.............',
    ],
    enemies: { basic: 0, fast: 4, power: 6, armor: 10 },
  },
];

export const TOTAL_STAGES = STAGES.length; // 35

export function getStageDef(stageNumber: number): StageDefinition {
  const clamped = ((stageNumber - 1) % TOTAL_STAGES + TOTAL_STAGES) % TOTAL_STAGES;
  return STAGES[clamped];
}

export function buildEnemyQueue(stageNumber: number): EnemyKind[] {
  const def = getStageDef(stageNumber);
  const { basic, fast, power, armor } = def.enemies;
  // Interleave enemy types cleanly so opening 10-15s aren't exclusively 4-HP armor tanks
  // while keeping exact counts from the stage definition.
  const queue: EnemyKind[] = [];
  const counts: Record<EnemyKind, number> = { basic, fast, power, armor };
  const order: EnemyKind[] = ['basic', 'fast', 'power', 'armor'];

  // Place 2 lighter units first when available so opening wave feels approachable
  for (let i = 0; i < 2; i++) {
    for (const k of order) {
      if (counts[k] > 0) {
        queue.push(k);
        counts[k]--;
        break;
      }
    }
  }

  // Round-robin interleave remaining
  let remaining = counts.basic + counts.fast + counts.power + counts.armor;
  while (remaining > 0) {
    for (const k of order) {
      if (counts[k] > 0) {
        queue.push(k);
        counts[k]--;
        remaining--;
      }
    }
  }

  return queue;
}

export function buildStageGrid(stageNumber: number): number[] {
  const def = getStageDef(stageNumber);
  const grid = new Array<number>(GRID_SIZE * GRID_SIZE).fill(TileType.EMPTY);

  const setHalf = (gx: number, gy: number, tile: TileType) => {
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      grid[gy * GRID_SIZE + gx] = tile;
    }
  };

  for (let my = 0; my < 13; my++) {
    const row = def.layout[my] ?? '.............';
    for (let mx = 0; mx < 13; mx++) {
      const ch = row[mx] ?? '.';
      const bx = mx * 2;
      const by = my * 2;

      switch (ch) {
        case '#':
          setHalf(bx, by, TileType.BRICK);
          setHalf(bx + 1, by, TileType.BRICK);
          setHalf(bx, by + 1, TileType.BRICK);
          setHalf(bx + 1, by + 1, TileType.BRICK);
          break;
        case '@':
          setHalf(bx, by, TileType.STEEL);
          setHalf(bx + 1, by, TileType.STEEL);
          setHalf(bx, by + 1, TileType.STEEL);
          setHalf(bx + 1, by + 1, TileType.STEEL);
          break;
        case '~':
          setHalf(bx, by, TileType.WATER);
          setHalf(bx + 1, by, TileType.WATER);
          setHalf(bx, by + 1, TileType.WATER);
          setHalf(bx + 1, by + 1, TileType.WATER);
          break;
        case '%':
          setHalf(bx, by, TileType.FOREST);
          setHalf(bx + 1, by, TileType.FOREST);
          setHalf(bx, by + 1, TileType.FOREST);
          setHalf(bx + 1, by + 1, TileType.FOREST);
          break;
        case '=':
          setHalf(bx, by, TileType.ICE);
          setHalf(bx + 1, by, TileType.ICE);
          setHalf(bx, by + 1, TileType.ICE);
          setHalf(bx + 1, by + 1, TileType.ICE);
          break;
        case 'u':
          setHalf(bx, by, TileType.BRICK);
          setHalf(bx + 1, by, TileType.BRICK);
          break;
        case 'd':
          setHalf(bx, by + 1, TileType.BRICK);
          setHalf(bx + 1, by + 1, TileType.BRICK);
          break;
        case 'l':
          setHalf(bx, by, TileType.BRICK);
          setHalf(bx, by + 1, TileType.BRICK);
          break;
        case 'r':
          setHalf(bx + 1, by, TileType.BRICK);
          setHalf(bx + 1, by + 1, TileType.BRICK);
          break;
        default:
          break;
      }
    }
  }

  // Guarantee top 3 enemy spawn points (2x2 half-tiles each) are completely clear
  const clear2x2 = (hx: number, hy: number) => {
    setHalf(hx, hy, TileType.EMPTY);
    setHalf(hx + 1, hy, TileType.EMPTY);
    setHalf(hx, hy + 1, TileType.EMPTY);
    setHalf(hx + 1, hy + 1, TileType.EMPTY);
  };
  clear2x2(0, 0);
  clear2x2(12, 0);
  clear2x2(24, 0);

  // Guarantee P1 (8,24) and P2 (16,24) spawn points AND lane right in front of them are clear
  clear2x2(8, 24);
  clear2x2(8, 22);
  clear2x2(16, 24);
  clear2x2(16, 22);

  // Guarantee Eagle HQ (12..13, 24..25) and its classic brick fortress wall (11..14, 23..25)
  const fortressCoords: [number, number][] = [
    [11, 25],
    [11, 24],
    [11, 23],
    [12, 23],
    [13, 23],
    [14, 23],
    [14, 24],
    [14, 25],
  ];
  for (const [fx, fy] of fortressCoords) {
    setHalf(fx, fy, TileType.BRICK);
  }
  setHalf(12, 24, TileType.EAGLE);
  setHalf(13, 24, TileType.EAGLE);
  setHalf(12, 25, TileType.EAGLE);
  setHalf(13, 25, TileType.EAGLE);

  return grid;
}

export const FORTRESS_COORDS: [number, number][] = [
  [11, 25],
  [11, 24],
  [11, 23],
  [12, 23],
  [13, 23],
  [14, 23],
  [14, 24],
  [14, 25],
];

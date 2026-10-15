// Original 16×16 pixel pictograms for the 18 events of Figure 2, composed from
// small primitives. Each follows the figure source's own description of its
// miniature (hero.json → figure2.pictograms); none is cut from the paper.

const P = {
  person: [
    '.###.',
    '.###.',
    '..#..',
    '#####',
    '#.#.#',
    '#.#.#',
    '..#..',
    '.#.#.',
    '.#.#.',
    '##.##',
  ],
  fallen: [
    '.##........',
    '.##.#######',
    '....#.#..#.',
  ],
  doc: [
    '#####.',
    '#...##',
    '#.##.#',
    '#....#',
    '#.##.#',
    '#....#',
    '######',
  ],
  note: [
    '####.',
    '#..##',
    '#...#',
    '#.#.#',
    '#...#',
    '#####',
  ],
  card: [
    '#########',
    '#.##....#',
    '#.##.##.#',
    '#.......#',
    '#.##.##.#',
    '#########',
  ],
  car: [
    '..#####..',
    '.##.#.##.',
    '#########',
    '#########',
    '.##...##.',
  ],
  house: [
    '...#...',
    '..###..',
    '.#####.',
    '#######',
    '.#...#.',
    '.#.#.#.',
    '.#.#.#.',
  ],
  camera: [
    '..##....',
    '########',
    '#..##..#',
    '#.#..#.#',
    '#..##..#',
    '########',
  ],
  fire: [
    '..#..',
    '.##..',
    '.###.',
    '#####',
    '.###.',
    '#.#.#',
  ],
  speech: [
    '#######',
    '#.....#',
    '#.###.#',
    '#######',
    '.##....',
  ],
  bubbleL: [
    '#####',
    '#...#',
    '#####',
    '.#...',
  ],
  bubbleR: [
    '#####',
    '#...#',
    '#####',
    '...#.',
  ],
  thought: [
    '.#####.',
    '#.....#',
    '#.....#',
    '.#####.',
    '..#....',
    '.#.....',
  ],
  mark: [
    '#...#',
    '.#.#.',
    '..#..',
    '.#.#.',
    '#...#',
  ],
  item: ['###', '###'],
  pen: ['...#', '..#.', '.#..', '#...'],
  arrow: ['...#.', '#####', '...#.'],
  desk: [
    '######',
    '#....#',
    '#....#',
    '#....#',
    '#....#',
  ],
  dots: ['#.#'],
  bang: ['#', '#', '.'],
};

// Event → list of [primitive, x, y] placed on a 16×16 canvas.
const LAYOUT = {
  1: [['person', 0, 6], ['doc', 5, 1], ['person', 11, 6]],
  2: [['person', 0, 6], ['arrow', 5, 6], ['item', 6, 10], ['person', 11, 6]],
  3: [['person', 1, 6], ['thought', 8, 0], ['dots', 10, 2]],
  4: [['person', 0, 6], ['card', 6, 4]],
  5: [['person', 0, 6], ['fallen', 5, 13]],
  6: [['person', 1, 6], ['thought', 8, 0], ['bang', 11, 1]],
  7: [['person', 1, 6], ['fire', 10, 10]],
  8: [['person', 1, 6], ['note', 9, 5], ['pen', 12, 1]],
  9: [['camera', 1, 2], ['fallen', 4, 13]],
  10: [['house', 0, 6], ['car', 7, 9]],
  11: [['person', 0, 6], ['speech', 5, 0], ['person', 11, 6]],
  12: [['person', 0, 6], ['doc', 8, 6], ['pen', 12, 2]],
  13: [['person', 1, 6], ['mark', 10, 7]],
  14: [['person', 0, 6], ['desk', 5, 11], ['person', 11, 6]],
  15: [['person', 0, 6], ['bubbleL', 3, 0], ['bubbleR', 8, 2], ['person', 11, 6]],
  16: [['person', 0, 6], ['car', 7, 9]],
  17: [['person', 0, 6], ['card', 3, 0], ['person', 11, 6]],
  18: [['person', 0, 6], ['camera', 8, 1], ['fallen', 5, 13]],
};

function cells(event) {
  const on = new Set();
  for (const [name, ox, oy] of LAYOUT[event]) {
    P[name].forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '#' && ox + x < 16 && oy + y < 16) on.add(`${ox + x},${oy + y}`);
      });
    });
  }
  return on;
}

// Path data in pixel units (0–16), with horizontal runs merged.
const cache = new Map();
export function spritePath(event) {
  if (cache.has(event)) return cache.get(event);
  const on = cells(event);
  let d = '';
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      if (!on.has(`${x},${y}`)) { x++; continue; }
      let len = 1;
      while (x + len < 16 && on.has(`${x + len},${y}`)) len++;
      d += `M${x} ${y}h${len}v1h-${len}z`;
      x += len;
    }
  }
  cache.set(event, d);
  return d;
}

export const SPRITE_SIZE = 16;

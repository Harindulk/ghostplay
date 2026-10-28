// Three handcrafted levels for "Lantern Keep". Level 3 hides a deliberate difficulty
// spike: a timed-spike corridor that kills anyone who walks through without waiting.
export const LEVELS = [
  {
    id: 'level-1',
    name: 'The Gatehouse',
    genre: 'grid puzzle',
    grid: [
      '###########',
      '#@....#...#',
      '#.##..#.#.#',
      '#..#....#.#',
      '##.####.#.#',
      '#.....#...#',
      '#.###...#E#',
      '###########',
    ],
  },
  {
    id: 'level-2',
    name: 'Key to the Cellar',
    genre: 'grid puzzle',
    grid: [
      '############',
      '#@...#....k#',
      '#.##.#.###.#',
      '#.#......#.#',
      '#.#.####.#.#',
      '#...#....#.#',
      '#####.####.#',
      '#E..D......#',
      '############',
    ],
  },
  {
    id: 'level-3',
    name: 'The Spike Hall',
    genre: 'grid puzzle',
    // Two planted problems. Spikes are down one turn in three and their phases make a
    // safe wave that moves left a tile per turn, so you must wait at (9,7) for the gap and
    // then walk without stopping. And pushing the crate all the way to (9,5) blocks the
    // only way down to the hall: a softlock.
    spike: { period: 3, on: 2 },
    grid: [
      '###########',
      '#@..#....k#',
      '#.#.#.###.#',
      '#.#...#...#',
      '#.#####.###',
      '#..C......#',
      '#########.#',
      '#E.D^^^^^.#',
      '###########',
    ],
    spikes: [
      { x: 8, y: 7, phase: 0 }, { x: 7, y: 7, phase: 2 }, { x: 6, y: 7, phase: 1 },
      { x: 5, y: 7, phase: 0 }, { x: 4, y: 7, phase: 2 },
    ],
  },
];

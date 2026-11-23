/**
 * 2048 Studio — Deterministic Game Engine
 * Supports Power-of-2 modes (4x4, Daily, 3x3, 5x5) and Fibonacci mode (1, 2, 3, 5, 8 ... 2584).
 * Tracks persistent tile IDs, source coordinates, merge pairs, undo history, and seeded PRNG.
 */

export const DIRECTIONS = {
  up:    { dr: -1, dc: 0 },
  down:  { dr:  1, dc: 0 },
  left:  { dr:  0, dc: -1 },
  right: { dr:  0, dc: 1 },
};

// Canonical Fibonacci tile progression (1+1=2, 1+2=3, 2+3=5, ..., 987+1597=2584)
export const FIB_SEQUENCE = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657,
];

export const FIB_INDEX = new Map(FIB_SEQUENCE.map((v, i) => [v, i]));

export const MODE_CONFIG = {
  classic:   { id: 'classic',   label: '4×4',       size: 4, target: 2048, maxUndos: 5, seeded: false, rules: 'power2' },
  fibonacci: { id: 'fibonacci', label: '피보나치',   size: 4, target: 2584, maxUndos: 5, seeded: false, rules: 'fibonacci' },
  daily:     { id: 'daily',     label: '오늘의 도전', size: 4, target: 2048, maxUndos: 3, seeded: true,  rules: 'power2' },
  sprint:    { id: 'sprint',    label: '3×3',       size: 3, target: 512,  maxUndos: 3, seeded: false, rules: 'power2' },
  marathon:  { id: 'marathon',  label: '5×5',       size: 5, target: 4096, maxUndos: 5, seeded: false, rules: 'power2' },
};

/**
 * Determine whether two tile values can merge under the given ruleset.
 */
export function canMergeValues(a, b, rules = 'power2') {
  if (rules === 'fibonacci') {
    if (a === 1 && b === 1) return true;
    const ia = FIB_INDEX.get(a);
    const ib = FIB_INDEX.get(b);
    return ia !== undefined && ib !== undefined && Math.abs(ia - ib) === 1;
  }
  return a === b;
}

/**
 * Return the next milestone goal beyond currentMax for the given ruleset.
 */
export function getNextMilestone(currentMax, baseTarget, rules = 'power2') {
  if (currentMax < baseTarget) return baseTarget;
  if (rules === 'fibonacci') {
    const idx = FIB_INDEX.get(currentMax);
    if (idx !== undefined && idx + 1 < FIB_SEQUENCE.length) {
      return FIB_SEQUENCE[idx + 1];
    }
    return Math.round(currentMax * 1.618);
  }
  return currentMax * 2;
}

/**
 * Compute 0..100 progress percentage toward the current goal.
 */
export function getMilestoneProgress(currentMax, goal, rules = 'power2') {
  if (rules === 'fibonacci') {
    const curIdx = FIB_INDEX.get(currentMax) ?? 0;
    const goalIdx = FIB_INDEX.get(goal) ?? 16;
    if (goalIdx <= 0) return 100;
    return Math.min(100, Math.max(4, Math.round(((curIdx + 1) / (goalIdx + 1)) * 100)));
  }
  const safeMax = Math.max(2, currentMax);
  return Math.min(100, Math.max(4, Math.round((Math.log2(safeMax) / Math.log2(goal)) * 100)));
}

/**
 * Hash a string into a 32-bit unsigned integer (FNV-1a).
 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pure steppable Mulberry32 PRNG so snapshots can restore RNG state on undo.
 */
export function nextRand(state) {
  let t = (state + 0x6D2B79F5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

export function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class Game2048 {
  constructor(options = {}) {
    const modeId = options.mode && MODE_CONFIG[options.mode] ? options.mode : 'classic';
    const cfg = MODE_CONFIG[modeId];

    this.mode = modeId;
    this.rules = options.rules ?? cfg.rules;
    this.size = options.size ?? cfg.size;
    this.target = options.target ?? cfg.target;
    this.maxUndos = options.maxUndos ?? cfg.maxUndos;
    this.seedKey = options.seedKey ?? (cfg.seeded ? `daily-${getTodayKey()}` : null);

    this.rngState = this.seedKey
      ? hashSeed(this.seedKey)
      : ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0);

    this.nextTileId = 1;
    this.grid = this._createEmptyGrid();
    this.score = 0;
    this.moves = 0;
    this.merges = 0;
    this.comboStreak = 0;
    this.maxCombo = 0;
    this.undosLeft = this.maxUndos;
    this.history = [];
    this.won = false;
    this.keepPlaying = false;
    this.over = false;
    this.elapsedMs = 0;

    if (!options.skipInit) {
      this.spawnTile();
      this.spawnTile();
    }
  }

  _createEmptyGrid() {
    return Array.from({ length: this.size }, () => Array(this.size).fill(null));
  }

  _random() {
    const res = nextRand(this.rngState);
    this.rngState = res.state;
    return res.value;
  }

  getEmptyCells() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.grid[r][c]) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }

  getTiles() {
    const tiles = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c]) tiles.push(this.grid[r][c]);
      }
    }
    return tiles;
  }

  getMaxTile() {
    let max = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const t = this.grid[r][c];
        if (t && t.value > max) max = t.value;
      }
    }
    return max;
  }

  spawnTile(forcedCell = null, forcedValue = null) {
    const empty = this.getEmptyCells();
    if (empty.length === 0) return null;

    const cell = forcedCell ?? empty[Math.floor(this._random() * empty.length)];
    let value = forcedValue;
    if (value === null || value === undefined) {
      if (this.rules === 'fibonacci') {
        value = this._random() < 0.8 ? 1 : 2;
      } else {
        value = this._random() < 0.9 ? 2 : 4;
      }
    }

    const tile = {
      id: this.nextTileId++,
      value,
      row: cell.row,
      col: cell.col,
      prevRow: cell.row,
      prevCol: cell.col,
      mergedFrom: null,
      isNew: true,
    };

    this.grid[cell.row][cell.col] = tile;
    return tile;
  }

  _prepareTilesForMove() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const t = this.grid[r][c];
        if (t) {
          t.prevRow = t.row;
          t.prevCol = t.col;
          t.mergedFrom = null;
          t.isNew = false;
        }
      }
    }
  }

  _snapshot() {
    return {
      grid: this.grid.map((row) =>
        row.map((t) =>
          t
            ? {
                id: t.id,
                value: t.value,
                row: t.row,
                col: t.col,
                prevRow: t.row,
                prevCol: t.col,
                mergedFrom: null,
                isNew: false,
              }
            : null
        )
      ),
      score: this.score,
      moves: this.moves,
      merges: this.merges,
      comboStreak: this.comboStreak,
      maxCombo: this.maxCombo,
      won: this.won,
      keepPlaying: this.keepPlaying,
      over: this.over,
      rngState: this.rngState,
      nextTileId: this.nextTileId,
    };
  }

  move(direction) {
    const vec = DIRECTIONS[direction];
    if (!vec) throw new Error(`Invalid direction: ${direction}`);
    if (this.over || (this.won && !this.keepPlaying)) {
      return { moved: false, blocked: true };
    }

    const preSnapshot = this._snapshot();
    this._prepareTilesForMove();

    const rowOrder = Array.from({ length: this.size }, (_, i) => i);
    const colOrder = Array.from({ length: this.size }, (_, i) => i);
    if (vec.dr === 1) rowOrder.reverse();
    if (vec.dc === 1) colOrder.reverse();

    let moved = false;
    let scoreGain = 0;
    const mergedEvents = [];
    let highestMerged = 0;

    for (const r of rowOrder) {
      for (const c of colOrder) {
        const tile = this.grid[r][c];
        if (!tile) continue;

        let curR = r;
        let curC = c;
        let nextR = curR + vec.dr;
        let nextC = curC + vec.dc;

        while (this._inBounds(nextR, nextC) && !this.grid[nextR][nextC]) {
          curR = nextR;
          curC = nextC;
          nextR = curR + vec.dr;
          nextC = curC + vec.dc;
        }

        const obstacle = this._inBounds(nextR, nextC) ? this.grid[nextR][nextC] : null;

        if (obstacle && !obstacle.mergedFrom && canMergeValues(obstacle.value, tile.value, this.rules)) {
          const mergedValue = obstacle.value + tile.value;
          const mergedTile = {
            id: this.nextTileId++,
            value: mergedValue,
            row: nextR,
            col: nextC,
            prevRow: nextR,
            prevCol: nextC,
            mergedFrom: [
              { ...obstacle, row: nextR, col: nextC },
              { ...tile, row: nextR, col: nextC },
            ],
            isNew: false,
          };

          this.grid[r][c] = null;
          this.grid[nextR][nextC] = mergedTile;

          moved = true;
          scoreGain += mergedValue;
          if (mergedValue > highestMerged) highestMerged = mergedValue;
          mergedEvents.push({ row: nextR, col: nextC, value: mergedValue });
        } else if (curR !== r || curC !== c) {
          this.grid[r][c] = null;
          tile.row = curR;
          tile.col = curC;
          this.grid[curR][curC] = tile;
          moved = true;
        }
      }
    }

    if (!moved) {
      return {
        moved: false,
        scoreGain: 0,
        mergedEvents: [],
        highestMerged: 0,
        combo: 0,
        spawned: null,
        justWon: false,
        justOver: false,
      };
    }

    this.history.push(preSnapshot);
    if (this.history.length > Math.max(this.maxUndos, 10)) {
      this.history.shift();
    }

    this.score += scoreGain;
    this.moves += 1;
    this.merges += mergedEvents.length;

    if (mergedEvents.length > 0) {
      this.comboStreak += 1;
      if (this.comboStreak > this.maxCombo) this.maxCombo = this.comboStreak;
    } else {
      this.comboStreak = 0;
    }

    const spawned = this.spawnTile();

    let justWon = false;
    if (!this.won && this.getMaxTile() >= this.target) {
      this.won = true;
      justWon = true;
    }

    let justOver = false;
    if (!this.hasMovesAvailable()) {
      this.over = true;
      justOver = true;
    }

    return {
      moved: true,
      scoreGain,
      mergedEvents,
      highestMerged,
      combo: this.comboStreak,
      multiMerge: mergedEvents.length,
      spawned,
      justWon,
      justOver,
    };
  }

  canUndo() {
    return this.undosLeft > 0 && this.history.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    const prev = this.history.pop();
    this.grid = prev.grid;
    this.score = prev.score;
    this.moves = prev.moves;
    this.merges = prev.merges;
    this.comboStreak = prev.comboStreak;
    this.maxCombo = prev.maxCombo;
    this.won = prev.won;
    this.keepPlaying = prev.keepPlaying;
    this.over = prev.over;
    this.rngState = prev.rngState;
    this.nextTileId = prev.nextTileId;
    this.undosLeft -= 1;
    return true;
  }

  continueEndless() {
    if (this.won) {
      this.keepPlaying = true;
    }
  }

  hasMovesAvailable() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const t = this.grid[r][c];
        if (!t) return true;
        if (r + 1 < this.size) {
          const down = this.grid[r + 1][c];
          if (down && canMergeValues(t.value, down.value, this.rules)) return true;
        }
        if (c + 1 < this.size) {
          const right = this.grid[r][c + 1];
          if (right && canMergeValues(t.value, right.value, this.rules)) return true;
        }
      }
    }
    return false;
  }

  _inBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  serialize() {
    return {
      mode: this.mode,
      rules: this.rules,
      size: this.size,
      target: this.target,
      maxUndos: this.maxUndos,
      seedKey: this.seedKey,
      rngState: this.rngState,
      nextTileId: this.nextTileId,
      score: this.score,
      moves: this.moves,
      merges: this.merges,
      comboStreak: this.comboStreak,
      maxCombo: this.maxCombo,
      undosLeft: this.undosLeft,
      won: this.won,
      keepPlaying: this.keepPlaying,
      over: this.over,
      elapsedMs: this.elapsedMs,
      cells: this.grid.map((row) => row.map((t) => (t ? t.value : 0))),
    };
  }

  static deserialize(data) {
    if (!data || !Array.isArray(data.cells)) return null;
    const game = new Game2048({
      mode: data.mode,
      rules: data.rules,
      size: data.size,
      target: data.target,
      maxUndos: data.maxUndos,
      seedKey: data.seedKey,
      skipInit: true,
    });
    game.rngState = data.rngState >>> 0;
    game.nextTileId = Math.max(1, data.nextTileId || 1);
    game.score = data.score || 0;
    game.moves = data.moves || 0;
    game.merges = data.merges || 0;
    game.comboStreak = data.comboStreak || 0;
    game.maxCombo = data.maxCombo || 0;
    game.undosLeft = typeof data.undosLeft === 'number' ? data.undosLeft : game.maxUndos;
    game.won = Boolean(data.won);
    game.keepPlaying = Boolean(data.keepPlaying);
    game.over = Boolean(data.over);
    game.elapsedMs = data.elapsedMs || 0;

    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const v = data.cells[r]?.[c] || 0;
        if (v > 0) {
          game.grid[r][c] = {
            id: game.nextTileId++,
            value: v,
            row: r,
            col: c,
            prevRow: r,
            prevCol: c,
            mergedFrom: null,
            isNew: false,
          };
        }
      }
    }
    return game;
  }

  buildShareSummary() {
    const emojiMap = (v) => {
      if (!v) return '⬜';
      if (this.rules === 'fibonacci') {
        if (v <= 2) return '▫️';
        if (v <= 8) return '🟧';
        if (v <= 34) return '🟥';
        if (v <= 233) return '🟨';
        if (v <= 1597) return '🟩';
        return '🏆';
      }
      if (v <= 4) return '▫️';
      if (v <= 16) return '🟧';
      if (v <= 64) return '🟥';
      if (v <= 512) return '🟨';
      if (v === 1024) return '🟩';
      return '🏆';
    };

    const modeLabel = this.mode === 'daily'
      ? `오늘의 도전 (${getTodayKey()})`
      : this.mode === 'fibonacci'
        ? `피보나치 (목표 ${this.target})`
        : MODE_CONFIG[this.mode]?.label ?? `${this.size}×${this.size}`;

    const boardLines = this.grid
      .map((row) => row.map((t) => emojiMap(t?.value || 0)).join(''))
      .join('\n');

    return [
      `2048 Studio — ${modeLabel}`,
      `점수 ${this.score.toLocaleString()} · 최고 타일 ${this.getMaxTile()} · ${this.moves}회 이동`,
      boardLines,
    ].join('\n');
  }
}

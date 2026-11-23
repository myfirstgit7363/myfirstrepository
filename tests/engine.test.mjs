import test from 'node:test';
import assert from 'node:assert/strict';
import { Game2048, canMergeValues, getNextMilestone } from '../src/engine.js';

function loadGrid(game, matrix) {
  game.size = matrix.length;
  game.grid = Array.from({ length: game.size }, () => Array(game.size).fill(null));
  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      if (matrix[r][c] > 0) {
        game.grid[r][c] = {
          id: game.nextTileId++,
          value: matrix[r][c],
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
}

function toMatrix(game) {
  return game.grid.map((row) => row.map((t) => (t ? t.value : 0)));
}

test('initializes with 2 tiles on 4x4 grid', () => {
  const game = new Game2048({ mode: 'classic' });
  assert.equal(game.size, 4);
  assert.equal(game.getTiles().length, 2);
});

test('prevents double-merge in a single move: [2, 2, 4, 0] left -> [4, 4, 0, 0]', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [2, 2, 4, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);

  game.spawnTile = () => null;
  const res = game.move('left');

  assert.equal(res.moved, true);
  assert.equal(res.scoreGain, 4);
  assert.deepEqual(toMatrix(game)[0], [4, 4, 0, 0]);
});

test('merges quadruple row properly: [2, 2, 2, 2] right -> [0, 0, 4, 4]', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [2, 2, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.spawnTile = () => null;

  const res = game.move('right');
  assert.equal(res.moved, true);
  assert.equal(res.scoreGain, 8);
  assert.equal(res.mergedEvents.length, 2);
  assert.deepEqual(toMatrix(game)[0], [0, 0, 4, 4]);
});

test('blocks move when no tile can slide or merge', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [2, 4, 8, 16],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);

  const res = game.move('up');
  assert.equal(res.moved, false);
  assert.equal(game.moves, 0);
});

test('detects 2048 victory and supports endless continuation', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.spawnTile = () => null;

  const res = game.move('left');
  assert.equal(res.justWon, true);
  assert.equal(game.won, true);
  assert.equal(game.score, 2048);

  const paused = game.move('right');
  assert.equal(paused.moved, false);

  game.continueEndless();
  const resumed = game.move('right');
  assert.equal(resumed.moved, true);
  assert.deepEqual(toMatrix(game)[0], [0, 0, 0, 2048]);
});

test('detects game over when board is full with no adjacent equal tiles', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 8, 8],
  ]);
  game.spawnTile = () => Game2048.prototype.spawnTile.call(game, { row: 3, col: 3 }, 32);

  const res = game.move('left');
  assert.equal(res.moved, true);
  assert.equal(res.justOver, true);
  assert.equal(game.over, true);
});

test('undo restores exact board state, score, and decrements undo counter', () => {
  const game = new Game2048({ mode: 'classic', skipInit: true });
  loadGrid(game, [
    [4, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);

  const before = toMatrix(game);
  const initialUndos = game.undosLeft;
  game.move('left');
  assert.equal(game.score, 8);
  assert.equal(game.moves, 1);

  const undone = game.undo();
  assert.equal(undone, true);
  assert.deepEqual(toMatrix(game), before);
  assert.equal(game.score, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.undosLeft, initialUndos - 1);
});

test('daily challenge seed produces deterministic starting boards and spawns', () => {
  const g1 = new Game2048({ mode: 'daily', seedKey: 'daily-2026-11-23' });
  const g2 = new Game2048({ mode: 'daily', seedKey: 'daily-2026-11-23' });

  assert.deepEqual(toMatrix(g1), toMatrix(g2));

  g1.move('left');
  g2.move('left');
  assert.deepEqual(toMatrix(g1), toMatrix(g2));
});

test('serialize and deserialize roundtrip preserves board and metadata', () => {
  const game = new Game2048({ mode: 'marathon' });
  game.move('left');
  game.move('down');

  const data = game.serialize();
  const restored = Game2048.deserialize(data);

  assert.equal(restored.mode, 'marathon');
  assert.equal(restored.size, 5);
  assert.equal(restored.score, game.score);
  assert.equal(restored.moves, game.moves);
  assert.deepEqual(toMatrix(restored), toMatrix(game));
});

/* ---------------- Fibonacci Mode Tests ---------------- */

test('fibonacci merge rules allow 1+1 and adjacent Fibonacci pairs only', () => {
  assert.equal(canMergeValues(1, 1, 'fibonacci'), true);
  assert.equal(canMergeValues(1, 2, 'fibonacci'), true);
  assert.equal(canMergeValues(2, 1, 'fibonacci'), true);
  assert.equal(canMergeValues(2, 3, 'fibonacci'), true);
  assert.equal(canMergeValues(89, 144, 'fibonacci'), true);
  assert.equal(canMergeValues(987, 1597, 'fibonacci'), true);

  // Equal tiles > 1 and non-adjacent Fibonacci numbers cannot merge
  assert.equal(canMergeValues(2, 2, 'fibonacci'), false);
  assert.equal(canMergeValues(3, 3, 'fibonacci'), false);
  assert.equal(canMergeValues(5, 5, 'fibonacci'), false);
  assert.equal(canMergeValues(1, 3, 'fibonacci'), false);
  assert.equal(canMergeValues(2, 5, 'fibonacci'), false);
});

test('fibonacci spawns only 1 or 2 tiles initially', () => {
  const game = new Game2048({ mode: 'fibonacci' });
  assert.equal(game.rules, 'fibonacci');
  assert.equal(game.target, 2584);
  for (const t of game.getTiles()) {
    assert.ok(t.value === 1 || t.value === 2);
  }
});

test('fibonacci merges pairs once per move: [1, 1, 2, 3] left -> [2, 5, 0, 0]', () => {
  const game = new Game2048({ mode: 'fibonacci', skipInit: true });
  loadGrid(game, [
    [1, 1, 2, 3],
    [2, 2, 3, 3],
    [1, 2, 3, 5],
    [0, 0, 0, 0],
  ]);
  game.spawnTile = () => null;

  const res = game.move('left');
  assert.equal(res.moved, true);
  const m = toMatrix(game);
  assert.deepEqual(m[0], [2, 5, 0, 0]);
  assert.deepEqual(m[1], [2, 5, 3, 0]); // middle 2+3=5, identical 2+2 and 3+3 do NOT merge
  assert.deepEqual(m[2], [3, 8, 0, 0]); // 1+2=3 and 3+5=8
});

test('fibonacci merges right direction properly: [1, 2, 3, 5] right -> [0, 0, 3, 8]', () => {
  const game = new Game2048({ mode: 'fibonacci', skipInit: true });
  loadGrid(game, [
    [1, 2, 3, 5],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.spawnTile = () => null;

  const res = game.move('right');
  assert.equal(res.moved, true);
  assert.equal(res.scoreGain, 11);
  assert.deepEqual(toMatrix(game)[0], [0, 0, 3, 8]);
});

test('fibonacci detects victory at 2584 and next milestone 4181', () => {
  const game = new Game2048({ mode: 'fibonacci', skipInit: true });
  loadGrid(game, [
    [987, 1597, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  game.spawnTile = () => null;

  const res = game.move('left');
  assert.equal(res.justWon, true);
  assert.equal(game.won, true);
  assert.equal(game.getMaxTile(), 2584);
  assert.equal(getNextMilestone(2584, 2584, 'fibonacci'), 4181);
});

test('fibonacci detects game over when full board has only equal >1 tiles (e.g. all 2s)', () => {
  const game = new Game2048({ mode: 'fibonacci', skipInit: true });
  loadGrid(game, [
    [2, 2, 2, 2],
    [2, 2, 2, 2],
    [2, 2, 2, 2],
    [2, 2, 1, 1],
  ]);
  game.spawnTile = () => Game2048.prototype.spawnTile.call(game, { row: 3, col: 0 }, 2);

  const res = game.move('right');
  assert.equal(res.moved, true);
  assert.equal(res.justOver, true);
  assert.equal(game.over, true);
  assert.equal(game.hasMovesAvailable(), false);
});

test('fibonacci serialize/deserialize preserves ruleset', () => {
  const game = new Game2048({ mode: 'fibonacci' });
  game.move('left');
  const restored = Game2048.deserialize(game.serialize());
  assert.equal(restored.mode, 'fibonacci');
  assert.equal(restored.rules, 'fibonacci');
  assert.equal(restored.target, 2584);
  assert.deepEqual(toMatrix(restored), toMatrix(game));
});

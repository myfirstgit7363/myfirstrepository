/**
 * 2048 Studio — Persistent Local Storage Layer
 * Safely stores preferences, mode best scores, in-progress boards, and player statistics.
 */

const STORAGE_KEY = 'studio2048_v1';

const DEFAULT_DATA = {
  prefs: {
    theme: 'porcelain',
    sound: true,
    lastMode: 'classic',
  },
  bestScores: {
    classic: 0,
    fibonacci: 0,
    sprint: 0,
    marathon: 0,
    daily: {}, // keyed by YYYY-MM-DD
  },
  savedGames: {}, // keyed by mode (or daily:YYYY-MM-DD)
  stats: {
    gamesPlayed: 0,
    wins: 0,
    highestTile: 2,
    totalMerges: 0,
    bestCombo: 0,
    unlockedTiles: [2, 4],
    unlockedFibTiles: [1, 2],
    dailyCleared: [], // array of YYYY-MM-DD strings
  },
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

export class StudioStorage {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaults();
      const parsed = JSON.parse(raw);
      return {
        prefs: { ...DEFAULT_DATA.prefs, ...(parsed.prefs || {}) },
        bestScores: {
          ...DEFAULT_DATA.bestScores,
          ...(parsed.bestScores || {}),
          daily: { ...(parsed.bestScores?.daily || {}) },
        },
        savedGames: { ...(parsed.savedGames || {}) },
        stats: {
          ...DEFAULT_DATA.stats,
          ...(parsed.stats || {}),
          unlockedTiles: Array.isArray(parsed.stats?.unlockedTiles)
            ? parsed.stats.unlockedTiles
            : [2, 4],
          unlockedFibTiles: Array.isArray(parsed.stats?.unlockedFibTiles)
            ? parsed.stats.unlockedFibTiles
            : [1, 2],
          dailyCleared: Array.isArray(parsed.stats?.dailyCleared)
            ? parsed.stats.dailyCleared
            : [],
        },
      };
    } catch {
      return cloneDefaults();
    }
  }

  _save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore quota / sandbox errors gracefully
    }
  }

  getPrefs() {
    return this.data.prefs;
  }

  setPref(key, value) {
    this.data.prefs[key] = value;
    this._save();
  }

  getBestScore(mode, dateKey = null) {
    if (mode === 'daily') {
      return this.data.bestScores.daily[dateKey] || 0;
    }
    return this.data.bestScores[mode] || 0;
  }

  updateBestScore(mode, score, dateKey = null) {
    const current = this.getBestScore(mode, dateKey);
    if (score > current) {
      if (mode === 'daily') {
        this.data.bestScores.daily[dateKey] = score;
      } else {
        this.data.bestScores[mode] = score;
      }
      this._save();
      return true;
    }
    return false;
  }

  _gameKey(mode, dateKey = null) {
    return mode === 'daily' ? `daily:${dateKey}` : mode;
  }

  saveGame(mode, serialized, dateKey = null) {
    this.data.savedGames[this._gameKey(mode, dateKey)] = serialized;
    this._save();
  }

  loadGame(mode, dateKey = null) {
    return this.data.savedGames[this._gameKey(mode, dateKey)] || null;
  }

  clearGame(mode, dateKey = null) {
    delete this.data.savedGames[this._gameKey(mode, dateKey)];
    this._save();
  }

  getStats() {
    return this.data.stats;
  }

  recordGameStart() {
    this.data.stats.gamesPlayed += 1;
    this._save();
  }

  recordMoveOutcome({ mergedEvents = [], combo = 0, maxTile = 2, justWon = false, mode = 'classic', rules = 'power2', dateKey = null }) {
    const s = this.data.stats;
    s.totalMerges += mergedEvents.length;
    if (combo > s.bestCombo) s.bestCombo = combo;
    if (maxTile > s.highestTile) s.highestTile = maxTile;

    if (rules === 'fibonacci') {
      const unlocked = new Set(s.unlockedFibTiles);
      unlocked.add(1);
      unlocked.add(2);
      if (maxTile >= 1) unlocked.add(maxTile);
      for (const ev of mergedEvents) {
        unlocked.add(ev.value);
      }
      s.unlockedFibTiles = Array.from(unlocked).sort((a, b) => a - b);
    } else {
      const unlocked = new Set(s.unlockedTiles);
      unlocked.add(2);
      unlocked.add(4);
      if (maxTile >= 2) unlocked.add(maxTile);
      for (const ev of mergedEvents) {
        unlocked.add(ev.value);
      }
      s.unlockedTiles = Array.from(unlocked).sort((a, b) => a - b);
    }

    if (justWon) {
      s.wins += 1;
      if (mode === 'daily' && dateKey && !s.dailyCleared.includes(dateKey)) {
        s.dailyCleared.push(dateKey);
      }
    }
    this._save();
  }

  resetStats() {
    this.data.stats = cloneDefaults().stats;
    this.data.bestScores = cloneDefaults().bestScores;
    this._save();
  }
}

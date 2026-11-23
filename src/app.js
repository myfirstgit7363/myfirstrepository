/**
 * 2048 Studio — Main Application Controller
 */

import {
  Game2048,
  MODE_CONFIG,
  FIB_SEQUENCE,
  FIB_INDEX,
  getTodayKey,
  getNextMilestone,
  getMilestoneProgress,
} from './engine.js';
import { BoardRenderer, getTileStyleClass } from './renderer.js';
import { SoundStudio } from './sound.js';
import { StudioStorage } from './storage.js';
import { InputController } from './input.js';

const GALLERY_TIERS_POWER2 = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
const GALLERY_TIERS_FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 2584];

class Studio2048App {
  constructor() {
    this.storage = new StudioStorage();
    const prefs = this.storage.getPrefs();
    this.sound = new SoundStudio(prefs.sound);
    this.todayKey = getTodayKey();
    this.activeGalleryTab = 'power2';

    this.dom = {
      brandTitle: document.querySelector('.brand-title'),
      scoreCard: document.getElementById('score-card'),
      scoreVal: document.getElementById('score-value'),
      bestCard: document.getElementById('best-card'),
      bestVal: document.getElementById('best-value'),
      dailyBadge: document.getElementById('daily-badge'),
      modeTabs: Array.from(document.querySelectorAll('.mode-tab')),
      undoBtn: document.getElementById('btn-undo'),
      undoCount: document.getElementById('undo-count'),
      newGameBtn: document.getElementById('btn-new-game'),
      soundBtn: document.getElementById('btn-sound'),
      statsBtn: document.getElementById('btn-stats'),
      progressLabel: document.getElementById('progress-label'),
      movesTimer: document.getElementById('moves-timer'),
      comboPill: document.getElementById('combo-pill'),
      progressFill: document.getElementById('progress-fill'),
      fibRibbon: document.getElementById('fib-ribbon'),
      fibSeqTrack: document.getElementById('fib-seq-track'),
      boardStage: document.getElementById('board-stage'),
      boardInner: document.getElementById('board-inner'),
      gridBg: document.getElementById('grid-bg'),
      tileLayer: document.getElementById('tile-layer'),
      fxCanvas: document.getElementById('fx-canvas'),
      overlay: document.getElementById('board-overlay'),
      overlayKicker: document.getElementById('overlay-kicker'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayScore: document.getElementById('overlay-score'),
      overlayMax: document.getElementById('overlay-max'),
      overlayMoves: document.getElementById('overlay-moves'),
      overlayContinueBtn: document.getElementById('btn-overlay-continue'),
      overlayShareBtn: document.getElementById('btn-overlay-share'),
      overlayRestartBtn: document.getElementById('btn-overlay-restart'),
      themeSwatches: Array.from(document.querySelectorAll('.theme-swatch')),
      statsModal: document.getElementById('stats-modal'),
      statsCloseBtn: document.getElementById('btn-stats-close'),
      statsResetBtn: document.getElementById('btn-stats-reset'),
      statGames: document.getElementById('stat-games'),
      statWinRate: document.getElementById('stat-win-rate'),
      statHighestTile: document.getElementById('stat-highest-tile'),
      statBestCombo: document.getElementById('stat-best-combo'),
      statTotalMerges: document.getElementById('stat-total-merges'),
      statDailyCount: document.getElementById('stat-daily-count'),
      galleryTabs: Array.from(document.querySelectorAll('.gallery-tab')),
      tileGallery: document.getElementById('tile-gallery'),
      toast: document.getElementById('toast'),
      srLive: document.getElementById('sr-live'),
    };

    this.renderer = new BoardRenderer({
      stageEl: this.dom.boardStage,
      innerEl: this.dom.boardInner,
      gridBgEl: this.dom.gridBg,
      tileLayerEl: this.dom.tileLayer,
      fxCanvasEl: this.dom.fxCanvas,
    });

    this.game = null;
    this.sessionHighestTile = 4;
    this.timerInterval = null;
    this.lastTickAt = null;
    this.toastTimer = null;

    this.applyTheme(prefs.theme || 'porcelain', false);
    this.updateSoundButton();
    this._bindEvents();

    this.input = new InputController(this.dom.boardStage, {
      onMove: (dir) => this.handleMove(dir),
      onUndo: () => this.handleUndo(),
      onToggleSound: () => this.toggleSound(),
      onNewGame: () => this.startNewGame(this.game.mode),
      onEscape: () => this.closeStatsModal(),
      isModalOpen: () => this.dom.statsModal.classList.contains('is-open'),
    });

    const initialMode = MODE_CONFIG[prefs.lastMode] ? prefs.lastMode : 'classic';
    this.switchMode(initialMode, { restoreSaved: true });
    this._startClock();
  }

  _bindEvents() {
    this.dom.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (mode && mode !== this.game?.mode) {
          this.switchMode(mode, { restoreSaved: true });
        }
      });
    });

    this.dom.galleryTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const g = tab.dataset.gallery;
        if (g) {
          this.activeGalleryTab = g;
          this.renderStatsModal();
        }
      });
    });

    this.dom.undoBtn.addEventListener('click', () => this.handleUndo());
    this.dom.newGameBtn.addEventListener('click', () => this.startNewGame(this.game.mode));
    this.dom.soundBtn.addEventListener('click', () => this.toggleSound());
    this.dom.statsBtn.addEventListener('click', () => this.openStatsModal());
    this.dom.statsCloseBtn.addEventListener('click', () => this.closeStatsModal());

    this.dom.statsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.statsModal) this.closeStatsModal();
    });

    this.dom.statsResetBtn.addEventListener('click', () => {
      this.storage.resetStats();
      this.renderStatsModal();
      this.updateHUD();
      this.showToast('기록을 초기화했어요');
    });

    this.dom.overlayContinueBtn.addEventListener('click', () => {
      this.game.continueEndless();
      this.hideOverlay();
      this.persistGame();
      this.updateHUD();
      this.showToast('무한 모드로 계속 도전합니다!');
    });

    this.dom.overlayRestartBtn.addEventListener('click', () => {
      this.startNewGame(this.game.mode);
    });

    this.dom.overlayShareBtn.addEventListener('click', () => {
      this.shareBoard();
    });

    this.dom.themeSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        this.applyTheme(swatch.dataset.theme, true);
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lastTickAt = null;
        this.persistGame();
      } else {
        this.lastTickAt = Date.now();
      }
    });
  }

  _startClock() {
    this.lastTickAt = Date.now();
    this.timerInterval = window.setInterval(() => {
      if (!this.game || document.hidden) return;
      if (this.game.moves > 0 && !this.game.over && !(this.game.won && !this.game.keepPlaying)) {
        const now = Date.now();
        if (this.lastTickAt) {
          this.game.elapsedMs += Math.min(2000, now - this.lastTickAt);
        }
        this.lastTickAt = now;
        this.updateTimerText();
      } else {
        this.lastTickAt = Date.now();
      }
    }, 500);
  }

  applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    this.dom.themeSwatches.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.theme === theme));
    });
    if (save) {
      this.storage.setPref('theme', theme);
    }
  }

  toggleSound() {
    const next = !this.sound.enabled;
    this.sound.setEnabled(next);
    this.storage.setPref('sound', next);
    this.updateSoundButton();
    if (next) this.sound.playSlide();
    this.showToast(next ? '사운드 켜짐' : '사운드 꺼짐');
  }

  updateSoundButton() {
    const on = this.sound.enabled;
    this.dom.soundBtn.setAttribute('aria-pressed', String(on));
    this.dom.soundBtn.setAttribute('aria-label', on ? '사운드 끄기' : '사운드 켜기');
    this.dom.soundBtn.title = on ? '사운드 끄기 (M)' : '사운드 켜기 (M)';
    this.dom.soundBtn.innerHTML = on
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  }

  _updateModeBranding(mode) {
    const isDaily = mode === 'daily';
    const isFib = mode === 'fibonacci';

    this.dom.brandTitle.textContent = isFib ? '2584' : '2048';
    this.dom.fibRibbon.hidden = !isFib;

    if (isDaily) {
      this.dom.dailyBadge.hidden = false;
      this.dom.dailyBadge.textContent = `DAILY · ${this.todayKey.slice(5)}`;
    } else if (isFib) {
      this.dom.dailyBadge.hidden = false;
      this.dom.dailyBadge.textContent = 'FIBONACCI';
    } else {
      this.dom.dailyBadge.hidden = true;
    }
  }

  switchMode(mode, { restoreSaved = true } = {}) {
    this.todayKey = getTodayKey();
    this.storage.setPref('lastMode', mode);

    this.dom.modeTabs.forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    });
    this._updateModeBranding(mode);

    const isDaily = mode === 'daily';
    let restored = null;
    if (restoreSaved) {
      const saved = this.storage.loadGame(mode, this.todayKey);
      if (saved && saved.mode === mode && !saved.over) {
        restored = Game2048.deserialize(saved);
      }
    }

    if (restored) {
      this.game = restored;
    } else {
      this.game = new Game2048({ mode, seedKey: isDaily ? `daily-${this.todayKey}` : null });
      this.storage.recordGameStart();
      this.persistGame();
    }

    this.sessionHighestTile = Math.max(this.game.rules === 'fibonacci' ? 2 : 4, this.game.getMaxTile());
    this.renderer.configureGrid(this.game.size, this.game.rules);
    this.renderer.renderStatic(this.game.grid);
    this.hideOverlay();
    this.updateHUD();

    if (this.game.won && !this.game.keepPlaying) {
      this.showOverlay('win');
    } else if (this.game.over) {
      this.showOverlay('over');
    }
  }

  startNewGame(mode) {
    this.todayKey = getTodayKey();
    const isDaily = mode === 'daily';
    this.storage.clearGame(mode, this.todayKey);
    this.game = new Game2048({ mode, seedKey: isDaily ? `daily-${this.todayKey}` : null });
    this.storage.recordGameStart();
    this.sessionHighestTile = Math.max(this.game.rules === 'fibonacci' ? 2 : 4, this.game.getMaxTile());

    this.renderer.configureGrid(this.game.size, this.game.rules);
    this.renderer.renderStatic(this.game.grid);
    this.hideOverlay();
    this.persistGame();
    this.updateHUD();
    this.sound.playSlide();
  }

  handleMove(direction) {
    if (!this.game) return;
    if (this.game.over || (this.game.won && !this.game.keepPlaying)) return;

    const result = this.game.move(direction);
    if (!result.moved) {
      this.renderer.bump(direction);
      this.sound.playBump();
      return;
    }

    this.renderer.renderTurn(this.game.grid);

    const isNewBest = this.storage.updateBestScore(this.game.mode, this.game.score, this.todayKey);
    this.dom.bestCard.classList.toggle('is-new-best', isNewBest);

    const isFib = this.game.rules === 'fibonacci';
    const popupThreshold = isFib ? 34 : 64;
    const burstThreshold = isFib ? 89 : 128;

    if (result.scoreGain > 0) {
      this.spawnScoreDelta(result.scoreGain);
      this.sound.playMerge(result.highestMerged, result.combo, this.game.rules);

      for (const ev of result.mergedEvents) {
        if (ev.value >= popupThreshold || result.multiMerge >= 2) {
          this.renderer.spawnCellPopup(ev.row, ev.col, ev.value);
        }
        if (ev.value >= burstThreshold && ev.value > this.sessionHighestTile) {
          const intensity = Math.min(2.6, Math.log2(ev.value) - 5.2);
          this.renderer.burstAtCell(ev.row, ev.col, Math.max(1, intensity));
        }
      }
    } else {
      this.sound.playSlide();
    }

    const currentMax = this.game.getMaxTile();
    if (currentMax > this.sessionHighestTile) {
      this.sessionHighestTile = currentMax;
    }

    this.storage.recordMoveOutcome({
      mergedEvents: result.mergedEvents,
      combo: result.combo,
      maxTile: currentMax,
      justWon: result.justWon,
      mode: this.game.mode,
      rules: this.game.rules,
      dateKey: this.todayKey,
    });

    this.persistGame();
    this.updateHUD();

    if (result.scoreGain > 0) {
      this.dom.srLive.textContent = `${result.scoreGain}점 획득, 현재 점수 ${this.game.score}점`;
    }

    if (result.justWon) {
      this.sound.playWin();
      this.renderer.celebrateWin();
      window.setTimeout(() => this.showOverlay('win'), 340);
    } else if (result.justOver) {
      window.setTimeout(() => this.showOverlay('over'), 300);
    }
  }

  handleUndo() {
    if (!this.game || !this.game.canUndo()) return;
    if (this.game.undo()) {
      this.hideOverlay();
      this.renderer.renderStatic(this.game.grid);
      this.sound.playUndo();
      this.persistGame();
      this.updateHUD();
    }
  }

  persistGame() {
    if (!this.game) return;
    this.storage.saveGame(this.game.mode, this.game.serialize(), this.todayKey);
  }

  spawnScoreDelta(points) {
    const el = document.createElement('span');
    el.className = 'score-delta';
    el.textContent = `+${points}`;
    this.dom.scoreCard.appendChild(el);
    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 740);
  }

  _updateFibRibbon(maxTile) {
    if (this.game.rules !== 'fibonacci') return;
    const idx = FIB_INDEX.get(maxTile) ?? 0;
    const start = Math.max(0, Math.min(idx - 2, FIB_SEQUENCE.length - 6));
    const slice = FIB_SEQUENCE.slice(start, start + 6);

    this.dom.fibSeqTrack.innerHTML = '';
    slice.forEach((val, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.textContent = '·';
        sep.style.opacity = '0.45';
        this.dom.fibSeqTrack.appendChild(sep);
      }
      const step = document.createElement('span');
      step.className = 'fib-step';
      if (val === maxTile) step.classList.add('is-current');
      else if (start + i === idx + 1) step.classList.add('is-next');
      step.textContent = String(val);
      this.dom.fibSeqTrack.appendChild(step);
    });
  }

  updateHUD() {
    const best = Math.max(
      this.game.score,
      this.storage.getBestScore(this.game.mode, this.todayKey)
    );
    this.dom.scoreVal.textContent = this.game.score.toLocaleString();
    this.dom.bestVal.textContent = best.toLocaleString();

    this.dom.undoCount.textContent = String(this.game.undosLeft);
    this.dom.undoBtn.disabled = !this.game.canUndo();

    const minBase = this.game.rules === 'fibonacci' ? 1 : 2;
    const maxTile = Math.max(minBase, this.game.getMaxTile());
    const nextGoal = getNextMilestone(maxTile, this.game.target, this.game.rules);
    const pct = getMilestoneProgress(maxTile, nextGoal, this.game.rules);

    this.dom.progressLabel.textContent = `최고 타일 ${maxTile} / 목표 ${nextGoal}`;
    this.dom.progressFill.style.width = `${pct}%`;
    this.dom.progressFill.classList.toggle('is-achieved', maxTile >= this.game.target);

    if (this.game.comboStreak >= 2) {
      this.dom.comboPill.textContent = `${this.game.comboStreak}× COMBO`;
      this.dom.comboPill.classList.add('is-visible');
    } else {
      this.dom.comboPill.classList.remove('is-visible');
    }

    this._updateFibRibbon(maxTile);
    this.updateTimerText();
  }

  updateTimerText() {
    const totalSec = Math.floor((this.game?.elapsedMs || 0) / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = String(totalSec % 60).padStart(2, '0');
    this.dom.movesTimer.textContent = `${this.game?.moves || 0}수 · ${min}:${sec}`;
  }

  showOverlay(type) {
    const isWin = type === 'win';
    this.dom.overlayKicker.textContent = isWin ? 'MILESTONE FORGED' : 'NO MOVES LEFT';
    this.dom.overlayTitle.textContent = isWin ? `${this.game.target} 달성!` : '게임 종료';
    this.dom.overlayScore.textContent = this.game.score.toLocaleString();
    this.dom.overlayMax.textContent = String(this.game.getMaxTile());
    this.dom.overlayMoves.textContent = `${this.game.moves}수`;

    this.dom.overlayContinueBtn.hidden = !isWin;
    this.dom.overlay.classList.add('is-open');
    this.dom.overlay.setAttribute('aria-hidden', 'false');
  }

  hideOverlay() {
    this.dom.overlay.classList.remove('is-open');
    this.dom.overlay.setAttribute('aria-hidden', 'true');
  }

  async shareBoard() {
    const summary = this.game.buildShareSummary();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        this.showToast('보드 결과를 클립보드에 복사했어요');
        return;
      }
    } catch {
      // Fallback below
    }
    const ta = document.createElement('textarea');
    ta.value = summary;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast('보드 결과를 클립보드에 복사했어요');
    } catch {
      this.showToast('복사에 실패했어요');
    }
    document.body.removeChild(ta);
  }

  openStatsModal() {
    this.activeGalleryTab = this.game?.rules === 'fibonacci' ? 'fibonacci' : 'power2';
    this.renderStatsModal();
    this.dom.statsModal.classList.add('is-open');
    this.dom.statsModal.setAttribute('aria-hidden', 'false');
  }

  closeStatsModal() {
    this.dom.statsModal.classList.remove('is-open');
    this.dom.statsModal.setAttribute('aria-hidden', 'true');
  }

  renderStatsModal() {
    const stats = this.storage.getStats();
    const winRate = stats.gamesPlayed > 0
      ? Math.round((stats.wins / stats.gamesPlayed) * 100)
      : 0;

    this.dom.statGames.textContent = stats.gamesPlayed.toLocaleString();
    this.dom.statWinRate.textContent = `${winRate}%`;
    this.dom.statHighestTile.textContent = stats.highestTile.toLocaleString();
    this.dom.statBestCombo.textContent = `${stats.bestCombo}×`;
    this.dom.statTotalMerges.textContent = stats.totalMerges.toLocaleString();
    this.dom.statDailyCount.textContent = `${stats.dailyCleared.length}일`;

    this.dom.galleryTabs.forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.gallery === this.activeGalleryTab));
    });

    const isFib = this.activeGalleryTab === 'fibonacci';
    const tiers = isFib ? GALLERY_TIERS_FIB : GALLERY_TIERS_POWER2;
    const unlocked = new Set(isFib ? stats.unlockedFibTiles : stats.unlockedTiles);

    this.dom.tileGallery.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const tier of tiers) {
      const item = document.createElement('div');
      const isUnlocked = unlocked.has(tier);
      item.className = isUnlocked
        ? `gallery-item ${getTileStyleClass(tier, isFib ? 'fibonacci' : 'power2')}`
        : 'gallery-item is-locked';
      item.textContent = isUnlocked ? String(tier) : '?';
      item.title = isUnlocked ? `${tier} 타일 해금됨` : `${tier} 타일 미해금`;
      frag.appendChild(item);
    }
    this.dom.tileGallery.appendChild(frag);
  }

  showToast(message) {
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('is-visible');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.dom.toast.classList.remove('is-visible');
    }, 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Studio2048App();
});

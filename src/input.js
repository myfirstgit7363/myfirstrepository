/**
 * 2048 Studio — Unified Input Controller
 * Handles Keyboard (Arrows / WASD / HJKL / Shortcuts), Touch Swipes, and Mouse Drag Flicks.
 */

const KEY_TO_DIR = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  k: 'up',
  K: 'up',
  j: 'down',
  J: 'down',
  h: 'left',
  H: 'left',
  l: 'right',
  L: 'right',
};

export class InputController {
  constructor(boardEl, callbacks) {
    this.boardEl = boardEl;
    this.callbacks = callbacks;
    this.pointerStart = null;
    this.activePointerId = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    boardEl.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);
  }

  _onKeyDown(e) {
    if (this.callbacks.isModalOpen?.()) {
      if (e.key === 'Escape') {
        this.callbacks.onEscape?.();
      }
      return;
    }

    // Ignore when focused inside an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.callbacks.onUndo?.();
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const dir = KEY_TO_DIR[e.key];
    if (dir) {
      e.preventDefault();
      this.callbacks.onMove?.(dir);
      return;
    }

    const lower = e.key.toLowerCase();
    if (lower === 'z' || lower === 'u') {
      e.preventDefault();
      this.callbacks.onUndo?.();
    } else if (lower === 'm') {
      this.callbacks.onToggleSound?.();
    } else if (lower === 'r') {
      this.callbacks.onNewGame?.();
    }
  }

  _onPointerDown(e) {
    // Ignore clicks on overlay buttons inside the board
    if (e.target.closest('button')) return;
    if (this.callbacks.isModalOpen?.()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.activePointerId = e.pointerId;
    this.pointerStart = { x: e.clientX, y: e.clientY, handled: false };
  }

  _onPointerMove(e) {
    if (!this.pointerStart || e.pointerId !== this.activePointerId || this.pointerStart.handled) {
      return;
    }

    const dx = e.clientX - this.pointerStart.x;
    const dy = e.clientY - this.pointerStart.y;
    const threshold = 28;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    this.pointerStart.handled = true;
    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');

    this.callbacks.onMove?.(dir);
  }

  _onPointerUp(e) {
    if (e.pointerId !== this.activePointerId) return;
    this.pointerStart = null;
    this.activePointerId = null;
  }

  _onPointerCancel(e) {
    if (e.pointerId !== this.activePointerId) return;
    this.pointerStart = null;
    this.activePointerId = null;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.boardEl.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
  }
}

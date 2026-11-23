/**
 * 2048 Studio — High-Craft Tile & Particle Renderer
 * Uses GPU-accelerated translate3d positioning, true sliding merges,
 * ResizeObserver layout sync, and lightweight canvas milestone sparks.
 */

const FIB_STYLE_MAP = {
  1:    'tile-v-2',
  2:    'tile-v-4',
  3:    'tile-v-8',
  5:    'tile-v-16',
  8:    'tile-v-32',
  13:   'tile-v-64',
  21:   'tile-v-128',
  34:   'tile-v-256',
  55:   'tile-v-512',
  89:   'tile-f-89',
  144:  'tile-v-1024',
  233:  'tile-f-233',
  377:  'tile-f-377',
  610:  'tile-v-4096',
  987:  'tile-v-8192',
  1597: 'tile-f-1597',
  2584: 'tile-v-2048',
};

export function getTileStyleClass(value, rules = 'power2') {
  if (rules === 'fibonacci') {
    if (FIB_STYLE_MAP[value]) return FIB_STYLE_MAP[value];
    return value > 2584 ? 'tile-v-2048' : 'tile-v-2';
  }
  const capped = value >= 8192 ? 8192 : value;
  return `tile-v-${capped}`;
}

export class BoardRenderer {
  constructor({ stageEl, innerEl, gridBgEl, tileLayerEl, fxCanvasEl }) {
    this.stageEl = stageEl;
    this.innerEl = innerEl;
    this.gridBgEl = gridBgEl;
    this.tileLayerEl = tileLayerEl;
    this.fxCanvas = fxCanvasEl;
    this.fxCtx = fxCanvasEl.getContext('2d');

    this.size = 4;
    this.rules = 'power2';
    this.metrics = { cellSize: 100, gap: 11 };
    this.particles = [];
    this.rafId = null;
    this.cleanupTimer = null;
    this.lastRenderedGrid = null;

    this._resizeObserver = new ResizeObserver(() => {
      this._measure();
      this._resizeCanvas();
      if (this.lastRenderedGrid) {
        this.renderStatic(this.lastRenderedGrid);
      }
    });
    this._resizeObserver.observe(this.innerEl);
  }

  configureGrid(size, rules = 'power2') {
    this.size = size;
    this.rules = rules;
    this.gridBgEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    this.gridBgEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    this.gridBgEl.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      frag.appendChild(cell);
    }
    this.gridBgEl.appendChild(frag);
    this._measure();
    this._resizeCanvas();
  }

  _measure() {
    const style = getComputedStyle(this.gridBgEl);
    const gap = parseFloat(style.columnGap || style.gap) || 11;
    const width = this.innerEl.clientWidth || 444;
    const cellSize = (width - gap * (this.size - 1)) / this.size;
    this.metrics = { cellSize, gap, width };
  }

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.stageEl.getBoundingClientRect();
    this.fxCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.fxCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _cellCoords(row, col) {
    const { cellSize, gap } = this.metrics;
    return {
      x: col * (cellSize + gap),
      y: row * (cellSize + gap),
    };
  }

  _fontSizeFor(value) {
    const digits = String(value).length;
    const base = this.metrics.cellSize;
    if (digits <= 2) return Math.round(base * 0.44);
    if (digits === 3) return Math.round(base * 0.36);
    if (digits === 4) return Math.round(base * 0.29);
    return Math.round(base * 0.23);
  }

  _tileValueClass(value) {
    return getTileStyleClass(value, this.rules);
  }

  _createTileNode(tile, { row, col, zIndex = 2, animClass = '', noTransition = false }) {
    const slot = document.createElement('div');
    slot.className = `tile-slot${noTransition ? ' no-transition' : ''}`;
    slot.style.width = `${this.metrics.cellSize}px`;
    slot.style.height = `${this.metrics.cellSize}px`;
    slot.style.zIndex = String(zIndex);

    const pos = this._cellCoords(row, col);
    slot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;

    const body = document.createElement('div');
    body.className = `tile-body ${this._tileValueClass(tile.value)}${animClass ? ' ' + animClass : ''}`;
    body.style.fontSize = `${this._fontSizeFor(tile.value)}px`;
    body.textContent = String(tile.value);

    slot.appendChild(body);
    return slot;
  }

  /**
   * Render tiles immediately with no slide transition (used on load, undo, resize).
   */
  renderStatic(grid) {
    this.lastRenderedGrid = grid;
    this._measure();
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.tileLayerEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const tile = grid[r][c];
        if (!tile) continue;
        const node = this._createTileNode(tile, {
          row: tile.row,
          col: tile.col,
          zIndex: 2,
          animClass: tile.isNew ? 'is-new' : '',
          noTransition: true,
        });
        frag.appendChild(node);
      }
    }
    this.tileLayerEl.appendChild(frag);
  }

  /**
   * Render an animated turn: sliding tiles, merging source pairs, and spawned tile.
   */
  renderTurn(grid) {
    this.lastRenderedGrid = grid;
    this._measure();
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.tileLayerEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    const animatedNodes = [];
    const ghostNodes = [];

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const tile = grid[r][c];
        if (!tile) continue;

        if (tile.mergedFrom) {
          // Render the two colliding tiles sliding into the merge cell
          for (const src of tile.mergedFrom) {
            const ghost = this._createTileNode(src, {
              row: src.prevRow,
              col: src.prevCol,
              zIndex: 1,
              noTransition: true,
            });
            frag.appendChild(ghost);
            animatedNodes.push({ node: ghost, targetRow: tile.row, targetCol: tile.col });
            ghostNodes.push(ghost);
          }

          // Render the resulting merged tile popping on arrival
          const mergedNode = this._createTileNode(tile, {
            row: tile.row,
            col: tile.col,
            zIndex: 3,
            animClass: 'is-merged',
            noTransition: true,
          });
          frag.appendChild(mergedNode);
        } else if (tile.isNew) {
          const spawnNode = this._createTileNode(tile, {
            row: tile.row,
            col: tile.col,
            zIndex: 2,
            animClass: 'is-new',
            noTransition: true,
          });
          frag.appendChild(spawnNode);
        } else {
          const moved = tile.prevRow !== tile.row || tile.prevCol !== tile.col;
          const slideNode = this._createTileNode(tile, {
            row: moved ? tile.prevRow : tile.row,
            col: moved ? tile.prevCol : tile.col,
            zIndex: 2,
            noTransition: true,
          });
          frag.appendChild(slideNode);
          if (moved) {
            animatedNodes.push({ node: slideNode, targetRow: tile.row, targetCol: tile.col });
          }
        }
      }
    }

    this.tileLayerEl.appendChild(frag);

    if (animatedNodes.length > 0) {
      // Force initial position paint, then transition to target coordinates
      void this.tileLayerEl.offsetWidth;
      for (const item of animatedNodes) {
        item.node.classList.remove('no-transition');
        const dest = this._cellCoords(item.targetRow, item.targetCol);
        item.node.style.transform = `translate3d(${dest.x}px, ${dest.y}px, 0)`;
      }
    }

    if (ghostNodes.length > 0) {
      this.cleanupTimer = window.setTimeout(() => {
        for (const g of ghostNodes) {
          if (g.parentNode) g.parentNode.removeChild(g);
        }
        this.cleanupTimer = null;
      }, 170);
    }
  }

  /** Subtle tactile bump when direction is blocked */
  bump(direction) {
    const cls = `bump-${direction}`;
    this.stageEl.classList.remove('bump-left', 'bump-right', 'bump-up', 'bump-down');
    void this.stageEl.offsetWidth;
    this.stageEl.classList.add(cls);
  }

  /** Show a crisp floating +value badge above a merged cell */
  spawnCellPopup(row, col, value) {
    const pos = this._cellCoords(row, col);
    const el = document.createElement('div');
    el.className = 'cell-popup';
    el.textContent = `+${value}`;
    el.style.left = `${pos.x + this.metrics.cellSize / 2}px`;
    el.style.top = `${pos.y + this.metrics.cellSize * 0.35}px`;
    this.tileLayerEl.appendChild(el);
    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 660);
  }

  /** Emit refined geometric sparks at a milestone merge cell */
  burstAtCell(row, col, intensity = 1) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pad = parseFloat(getComputedStyle(this.stageEl).paddingLeft) || 12;
    const pos = this._cellCoords(row, col);
    const cx = pad + pos.x + this.metrics.cellSize / 2;
    const cy = pad + pos.y + this.metrics.cellSize / 2;

    const palette = ['#F2C96B', '#E2724B', '#2E8B6E', '#D9573B', '#FAF7F2'];
    const count = Math.min(28, Math.round(10 * intensity));

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = (1.6 + Math.random() * 2.8) * Math.sqrt(intensity);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.8,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.25,
        life: 1,
        decay: 0.022 + Math.random() * 0.014,
        color: palette[i % palette.length],
      });
    }

    this._startParticleLoop();
  }

  /** Celebratory burst across the board when forging 2048 */
  celebrateWin() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = this.stageEl.getBoundingClientRect();
    const palette = ['#F2C96B', '#E5B94C', '#E2724B', '#2E8B6E', '#FAF7F2'];

    for (let i = 0; i < 64; i++) {
      const x = rect.width * (0.15 + Math.random() * 0.7);
      const y = rect.height * (0.15 + Math.random() * 0.45);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 2.2 + Math.random() * 4.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.22,
        life: 1,
        decay: 0.011 + Math.random() * 0.008,
        color: palette[i % palette.length],
      });
    }
    this._startParticleLoop();
  }

  _startParticleLoop() {
    if (this.rafId !== null) return;
    const step = () => {
      const rect = this.stageEl.getBoundingClientRect();
      this.fxCtx.clearRect(0, 0, rect.width, rect.height);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.11; // soft gravity
        p.vx *= 0.985;
        p.rot += p.vRot;
        p.life -= p.decay;

        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }

        this.fxCtx.save();
        this.fxCtx.globalAlpha = Math.max(0, p.life);
        this.fxCtx.translate(p.x, p.y);
        this.fxCtx.rotate(p.rot);
        this.fxCtx.fillStyle = p.color;
        this.fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        this.fxCtx.restore();
      }

      if (this.particles.length > 0) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(step);
  }
}

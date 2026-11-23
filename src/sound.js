/**
 * 2048 Studio — Procedural Tactile Audio Synthesizer (Web Audio API)
 * Generates subtle ceramic tile slides, pentatonic harmonic merges, and fanfare.
 */

// Warm C-major pentatonic frequencies spanning 2 octaves
const PENTATONIC = [
  261.63, // C4  (4)
  293.66, // D4  (8)
  329.63, // E4  (16)
  392.00, // G4  (32)
  440.00, // A4  (64)
  523.25, // C5  (128)
  587.33, // D5  (256)
  659.25, // E5  (512)
  783.99, // G5  (1024)
  880.00, // A5  (2048)
  1046.50,// C6  (4096)
  1174.66,// D6  (8192)
];

export class SoundStudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
  }

  _ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
  }

  /** Soft ceramic slide tick */
  playSlide() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(112, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Subtle muted bump when blocked */
  playBump() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.05);

    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Harmonic marimba chime scaled by merged tile value & combo */
  playMerge(highestValue, combo = 1, rules = 'power2') {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    let tier;
    if (rules === 'fibonacci') {
      // Map Fibonacci sequence smoothly onto 0..11 pentatonic steps (2 -> 0, 2584 -> 10)
      tier = Math.max(0, Math.round(Math.log(Math.max(2, highestValue)) / Math.log(1.618) - 1.5) * 0.68);
      tier = Math.min(Math.round(tier), PENTATONIC.length - 1);
    } else {
      tier = Math.max(0, Math.round(Math.log2(highestValue)) - 2);
    }
    const baseFreq = PENTATONIC[Math.min(tier, PENTATONIC.length - 1)];
    const comboLift = 1 + Math.min(combo - 1, 5) * 0.015;
    const freq = baseFreq * comboLift;

    // Fundamental warm sine
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.11, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.24);

    // Soft octave overtone for ceramic sparkle on mid/high merges
    if (highestValue >= 21) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, now + 0.012);

      gain2.gain.setValueAtTime(0.001, now + 0.012);
      gain2.gain.linearRampToValueAtTime(0.042, now + 0.025);
      gain2.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.012);
      osc2.stop(now + 0.28);
    }
  }

  /** Gentle reverse click for Undo */
  playUndo() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Refined ascending chord for reaching 2048 */
  playWin() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.095, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }
}

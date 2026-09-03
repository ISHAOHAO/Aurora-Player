class DropMeter {
  constructor() { this.reset(); }
  reset() { this.last = null; this.start = 0; this.drops = 0; this.frames = 0; }
  sample(count, fps, active, now = Date.now()) {
    if (!active || !Number.isFinite(count) || !Number.isFinite(fps) || fps <= 0) { this.reset(); return null; }
    if (!this.last || count < this.last.count || now - this.last.time > 2000) {
      this.reset(); this.start = now; this.last = { count, time: now }; return null;
    }
    this.drops += count - this.last.count;
    this.frames += fps * Math.max(0, now - this.last.time) / 1000;
    this.last = { count, time: now };
    if (now - this.start < 5000) return null;
    const rate = this.frames > 0 ? this.drops / this.frames : 0;
    this.start = now; this.drops = 0; this.frames = 0;
    return rate;
  }
}
module.exports = { DropMeter };

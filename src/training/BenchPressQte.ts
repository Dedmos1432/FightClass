import { BENCH } from '../config/training';

/** Simulation time is advanced only while the workout is unpaused. */
export class BenchPressQte {
  progress = 0;
  completed = false;
  private elapsed = 0;
  private lastTap = Number.NEGATIVE_INFINITY;

  tap(): boolean {
    if (this.completed || this.elapsed - this.lastTap < BENCH.minTapIntervalMs) return false;
    this.lastTap = this.elapsed;
    this.progress = Math.min(1, this.progress + BENCH.tapGain);
    this.completed = this.progress >= 1;
    return true;
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    if (!this.completed) this.progress = Math.max(0, this.progress - BENCH.decayPerSecond * deltaMs / 1000);
  }

  reset(): void {
    this.progress = 0;
    this.completed = false;
    this.lastTap = Number.NEGATIVE_INFINITY;
  }
}

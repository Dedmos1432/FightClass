import Phaser from 'phaser';
import { BENCH } from '../config/training';
import { WORLD } from '../config/lobby';
import type { ExplorationPlayer } from '../characters/ExplorationPlayer';
import type { ExplorationView } from '../ui/ExplorationView';
import { BenchTrainingView, type BenchPhase } from '../ui/BenchTrainingView';
import { pressTexture } from '../assets/gymAssets';
import { BenchPressQte } from './BenchPressQte';

export class BenchTrainingController {
  private phase: BenchPhase = 'idle';
  private elapsed = 0;
  private reps = 0;
  private lift = 0;
  private rackFrom = 0;
  private prepareFrom = 0;
  private run: string | null = null;
  private after: (() => void) | null = null;
  private pausedByFocus = false;
  private uiElapsed = 0;
  private readonly qte = new BenchPressQte();
  private readonly events = new AbortController();
  private readonly empty: Phaser.GameObjects.Image;
  private readonly combined: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Ellipse;
  private readonly ui: BenchTrainingView;

  constructor(scene: Phaser.Scene, private readonly player: ExplorationPlayer, private readonly view: ExplorationView) {
    scene.add.ellipse(BENCH.x, WORLD.floorY - 1, 420, 28, 0x030603, 0.45).setDepth(3);
    this.marker = scene.add.ellipse(BENCH.x, WORLD.floorY + 5, 220, 25, 0xd8e391, 0.1).setDepth(3).setStrokeStyle(2, 0xd8e391, 0.7).setVisible(false);
    this.empty = scene.add.image(BENCH.x, WORLD.floorY, 'gym-bench').setOrigin(0.5, BENCH.footOrigin).setScale(BENCH.scale).setDepth(4);
    this.combined = scene.add.image(BENCH.x, WORLD.floorY, 'gym-prepare_00').setOrigin(0.5, BENCH.footOrigin).setScale(BENCH.scale).setDepth(6).setVisible(false);
    scene.add.text(BENCH.x, WORLD.floorY - 415, 'ЖИМ ЛЁЖА', { fontFamily: 'Consolas, monospace', fontSize: '22px', color: '#e1e8c4', backgroundColor: '#182016bb', padding: { x: 15, y: 9 } }).setOrigin(0.5).setDepth(2);
    this.ui = new BenchTrainingView(view, () => this.tap(), () => this.stop());
    document.addEventListener('keydown', this.onKey, { signal: this.events.signal });
    window.addEventListener('blur', () => { this.pausedByFocus = true; }, { signal: this.events.signal });
    window.addEventListener('focus', () => { this.pausedByFocus = false; }, { signal: this.events.signal });
  }

  get active(): boolean { return this.phase !== 'idle'; }
  get nearby(): boolean { return Math.abs(this.player.x - BENCH.x) <= BENCH.radius; }

  highlight(): void { this.marker.setVisible(this.nearby && !this.active); }

  tryStart(): void {
    if (this.active || !this.nearby || this.view.hasDialog) return;
    this.player.stop();
    if (!this.view.services.saves.training.tutorialSeen) {
      this.ui.showTutorial(() => { this.view.services.saves.markBenchTutorialSeen(); this.begin(); });
    } else this.begin();
  }

  update(deltaMs: number): void {
    this.highlight();
    if (!this.active) return;
    const paused = this.view.hasDialog || document.hidden || this.pausedByFocus;
    const delta = Math.min(deltaMs, 50);
    if (!paused) this.advance(delta);
    this.uiElapsed += delta;
    if (this.active && this.uiElapsed >= 60) {
      this.uiElapsed = 0;
      this.ui.update(this.phase, this.lift, this.reps, paused);
    }
  }

  stop(after?: () => void): void {
    if (!this.active) { after?.(); return; }
    if (after) this.after = after;
    if (this.phase === 'racking' || this.phase === 'getting-up' || this.phase === 'cancel-preparing') return;
    if (this.phase === 'approaching') { this.finish(); return; }
    if (this.phase === 'preparing') {
      this.prepareFrom = Math.min(24, Math.floor(this.elapsed / BENCH.prepareMs * 25));
      this.setPhase('cancel-preparing'); return;
    }
    this.rackFrom = this.lift;
    this.setPhase('racking');
  }

  destroy(): void {
    if (this.run) this.view.services.saves.finishBenchSession(this.run);
    this.events.abort(); this.ui.destroy();
  }

  private begin(): void {
    this.reps = 0; this.lift = 0; this.run = null; this.after = null;
    this.pausedByFocus = false;
    this.qte.reset(); this.ui.begin(); this.setPhase('approaching');
  }

  private advance(delta: number): void {
    this.elapsed += delta;
    this.qte.update(delta);
    switch (this.phase) {
      case 'approaching': {
        const distance = BENCH.x - this.player.x;
        this.player.update(Math.sign(distance), delta);
        if (Math.abs(distance) <= WORLD.speed * delta / 1000 + 1) {
          this.player.place(BENCH.x, 'left'); this.player.setVisible(false);
          this.empty.setVisible(false); this.combined.setVisible(true);
          this.run = this.view.services.saves.beginBenchSession();
          this.setPhase('preparing'); this.texture('gym-prepare_00');
        }
        break;
      }
      case 'preparing':
        this.texture(`gym-prepare_${String(Math.min(24, Math.floor(this.elapsed / BENCH.prepareMs * 25))).padStart(2, '0')}`);
        if (this.elapsed >= BENCH.prepareMs) this.setPhase('unracking');
        break;
      case 'cancel-preparing': {
        const t = Math.min(1, this.elapsed / Math.max(300, this.prepareFrom / 24 * BENCH.prepareMs));
        this.texture(`gym-prepare_${String(Math.round(this.prepareFrom * (1 - t))).padStart(2, '0')}`);
        if (t >= 1) this.finish();
        break;
      }
      case 'unracking': {
        const t = Math.min(1, this.elapsed / BENCH.unrackMs);
        this.lift = BENCH.rackFrame / 96 * (1 - t);
        this.texture(pressTexture(this.lift * 96));
        if (t >= 1) { this.lift = 0; this.qte.reset(); this.setPhase('pressing'); }
        break;
      }
      case 'pressing': {
        this.lift += (this.qte.progress - this.lift) * (1 - Math.exp(-delta / 70));
        if (this.qte.completed && this.lift >= 0.995) this.lift = 1;
        this.texture(pressTexture(this.lift * 96));
        if (this.lift === 1 && this.run) {
          this.reps++;
          this.view.services.saves.completeBenchRep(this.run, this.reps);
          this.view.refreshStats(); this.view.warnIfTemporary();
          this.view.services.audio.play('open'); this.setPhase('lowering');
        }
        break;
      }
      case 'lowering': {
        const t = Math.min(1, this.elapsed / BENCH.lowerMs);
        this.lift = 1 - t; this.texture(pressTexture(this.lift * 96));
        if (t >= 1) { this.qte.reset(); this.setPhase('pressing'); }
        break;
      }
      case 'racking': {
        const t = Math.min(1, this.elapsed / BENCH.rackMs);
        this.lift = this.rackFrom + (BENCH.rackFrame / 96 - this.rackFrom) * t;
        this.texture(pressTexture(this.lift * 96));
        if (t >= 1) { this.setPhase('getting-up'); this.texture('gym-get_up_00'); }
        break;
      }
      case 'getting-up':
        this.texture(`gym-get_up_${String(Math.min(22, Math.floor(this.elapsed / BENCH.getUpMs * 23))).padStart(2, '0')}`);
        if (this.elapsed >= BENCH.getUpMs) this.finish();
        break;
    }
  }

  private tap(): void {
    if (this.phase !== 'pressing' || this.view.hasDialog || document.hidden || this.pausedByFocus) return;
    this.qte.tap();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.active || this.view.hasDialog || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyE') { event.preventDefault(); this.tap(); }
    if (event.code === 'Escape') { event.preventDefault(); this.stop(); }
  };

  private setPhase(phase: BenchPhase): void {
    this.phase = phase; this.elapsed = 0;
    this.ui.update(this.phase, this.lift, this.reps, false);
  }

  private texture(key: string): void { if (this.combined.texture.key !== key) this.combined.setTexture(key); }

  private finish(): void {
    const approached = this.phase !== 'approaching';
    const facing = this.phase === 'cancel-preparing' ? 'left' : 'right';
    if (this.run) this.view.services.saves.finishBenchSession(this.run);
    this.run = null;
    this.phase = 'idle';
    this.combined.setVisible(false); this.empty.setVisible(true);
    if (approached) this.player.place(BENCH.x, facing);
    this.player.setVisible(true);
    this.view.refreshStats();
    const after = this.after; this.after = null;
    this.ui.end(this.reps, !after);
    this.view.focusWorld();
    after?.();
  }
}

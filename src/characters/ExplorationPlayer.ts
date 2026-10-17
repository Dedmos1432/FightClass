import Phaser from 'phaser';
import { WORLD } from '../config/lobby';

export type Facing = 'left' | 'right';

export class ExplorationPlayer {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private facing: Facing;
  private animation = '';

  constructor(scene: Phaser.Scene, x: number, facing: Facing) {
    this.facing = facing;
    this.shadow = scene.add.ellipse(x, WORLD.floorY - 1, 150, 23, 0x030603, 0.5).setDepth(4);
    this.sprite = scene.add.sprite(x, WORLD.floorY, `player-idle-${facing}-01`)
      .setScale(0.8).setDepth(5);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => this.alignFeet());
    this.play('idle');
    this.alignFeet();
  }

  get x(): number { return this.sprite.x; }
  get direction(): Facing { return this.facing; }
  get animationKey(): string { return this.animation; }

  update(direction: number, delta: number): void {
    const previous = this.sprite.x;
    if (direction !== 0) {
      this.facing = direction < 0 ? 'left' : 'right';
      this.sprite.x = Phaser.Math.Clamp(previous + direction * WORLD.speed * Math.min(delta, 50) / 1000, WORLD.minX, WORLD.maxX);
    }
    this.shadow.x = this.sprite.x;
    this.play(Math.abs(this.sprite.x - previous) > 0.001 ? 'walk' : 'idle');
  }

  stop(): void { this.play('idle'); }

  private play(state: 'idle' | 'walk'): void {
    const key = `player-${state}-${this.facing}`;
    if (key === this.animation) return;
    this.animation = key;
    this.sprite.play(key, true);
    this.alignFeet();
  }

  private alignFeet(): void {
    // Source canvases are all 256×448. Frame 01 has its sole one pixel higher.
    const footEdge = this.sprite.texture.key.endsWith('-01') ? 434 : 435;
    this.sprite.setOrigin(0.5, footEdge / 448);
  }
}

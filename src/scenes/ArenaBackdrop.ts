import Phaser from 'phaser';
import type { GameServices } from '../core/GameServices';

export class ArenaBackdrop {
  private readonly image: Phaser.GameObjects.Image;
  private readonly dust: Phaser.GameObjects.Rectangle[] = [];
  private elapsed = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly services: GameServices) {
    this.image = scene.add.image(0, 0, 'arena').setOrigin(0.5);
    for (let index = 0; index < 36; index++) {
      this.dust.push(scene.add.rectangle(0, 0, index % 4 === 0 ? 3 : 2, 2, 0xdce6ac, 0.18));
    }
    this.resize(scene.scale.gameSize);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    });
  }

  private resize(size: Phaser.Structs.Size): void {
    const scale = Math.max(size.width / this.image.width, size.height / this.image.height);
    this.image.setPosition(Math.floor(size.width / 2), Math.floor(size.height / 2)).setScale(scale);
  }

  private update(_time: number, delta: number): void {
    const enabled = this.services.settings.current.animatedBackground && !document.hidden;
    if (enabled) this.elapsed += Math.min(delta, 50) / 1000;
    const { width, height } = this.scene.scale;
    this.dust.forEach((particle, index) => {
      particle.setVisible(enabled);
      if (!enabled) return;
      const seedX = ((index * 719) % 997) / 997;
      const seedY = ((index * 337) % 541) / 541;
      const x = (seedX * width + Math.sin(this.elapsed * 0.15 + index) * 20 + this.elapsed * 3) % width;
      const y = ((seedY * height - this.elapsed * (5 + index % 6)) % height + height) % height;
      particle.setPosition(Math.round(x), Math.round(y));
      particle.setAlpha(0.08 + (Math.sin(this.elapsed + index) + 1) * 0.06);
    });
  }
}

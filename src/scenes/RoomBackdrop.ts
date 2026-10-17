import Phaser from 'phaser';
import { WORLD } from '../config/lobby';
import type { RoomId } from '../assets/explorationAssets';

/** Fit the room's vertical proportions to the fighter, with a fixed floor edge. */
export class RoomBackdrop {
  private readonly heightScale = 0.84;
  private readonly top = WORLD.height * (1 - this.heightScale);

  constructor(scene: Phaser.Scene, room: RoomId) {
    const key = `background-${room}`;
    // A dark ceiling behind the HUD avoids stretching the texture's top row.
    scene.add.rectangle(0, 0, WORLD.width, this.top, 0x10130f).setOrigin(0);
    scene.add.image(0, this.top, key, '__BASE').setOrigin(0)
      .setDisplaySize(WORLD.width, WORLD.height * this.heightScale);
  }

  wallY(originalY: number): number {
    return this.top + originalY * this.heightScale;
  }
}

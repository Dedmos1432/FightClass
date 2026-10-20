import Phaser from 'phaser';
import { combatManifest } from '../assets/combatAssets';
import { attackDuration, type Fighter } from '../combat/CombatWorld';
import type { Loadout } from '../combat/moves';
import { COMBAT, ATTACK_SLOTS } from '../config/combat';

export class CombatFighterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private clock = 0;
  constructor(scene: Phaser.Scene, private readonly f: Fighter, private readonly loadout: Loadout) {
    const key = combatManifest.characters[f.skin]['idle-right'][0];
    this.sprite = scene.add.sprite(f.x, COMBAT.floorY, combatManifest.frames[key].page, key).setDepth(6);
    this.shadow = scene.add.ellipse(f.x, COMBAT.floorY, 155, 22, 0x030603, 0.5).setDepth(4);
    this.update(0);
  }
  update(delta: number): void {
    this.clock += delta;
    const f = this.f;
    const action = f.action === 'attack' ? f.skin === 'player' ? this.loadout[f.slot] : `attack${f.slot}` : f.action;
    const clip = combatManifest.characters[f.skin][`${action}-${f.facing > 0 ? 'right' : 'left'}`];
    if (!clip) throw new Error(`Missing animation ${f.skin}/${action}`);
    let progress: number;
    if (f.action === 'attack') {
      const spec = ATTACK_SLOTS[f.slot], activeEnd = spec.startup + spec.active;
      progress = f.elapsed < spec.startup ? f.elapsed / spec.startup * 0.34
        : f.elapsed < activeEnd ? 0.34 + (f.elapsed - spec.startup) / spec.active * 0.28
        : 0.62 + (f.elapsed - activeEnd) / (attackDuration(f.slot) - activeEnd) * 0.38;
    } else if (f.action === 'ko') progress = Math.min(1, f.elapsed / 1100);
    else if (f.action === 'hit') progress = Math.min(1, f.elapsed / f.stun);
    else if (f.action === 'dodge') progress = Math.min(1, f.elapsed / COMBAT.dodgeDuration);
    else if (f.action === 'block') progress = 0.6;
    else progress = (this.clock % (clip.length * (f.action === 'idle' ? 125 : 85))) / (clip.length * (f.action === 'idle' ? 125 : 85));
    const key = clip[Math.min(clip.length - 1, Math.floor(progress * clip.length))], meta = combatManifest.frames[key];
    this.sprite.setTexture(meta.page, key).setOrigin(meta.ox, meta.oy).setPosition(f.x, COMBAT.floorY);
    this.shadow.x = f.x;
    this.sprite.setAlpha(f.action === 'dodge' && f.elapsed >= COMBAT.dodgeInvulnerableFrom && f.elapsed < COMBAT.dodgeInvulnerableTo ? 0.6 : 1);
  }
  destroy(): void { this.sprite.destroy(); this.shadow.destroy(); }
}

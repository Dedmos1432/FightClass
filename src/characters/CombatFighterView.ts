import Phaser from 'phaser';
import { combatManifest } from '../assets/combatAssets';
import { attackDuration, type Fighter } from '../combat/CombatWorld';
import type { Loadout } from '../combat/moves';
import { COMBAT, ATTACK_SLOTS } from '../config/combat';

export class CombatFighterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private clock = 0;
  private previousAction: Fighter['action'] | null = null;
  private guardReleaseMs = 0;
  private trailMs=0;
  constructor(private readonly scene: Phaser.Scene, private readonly f: Fighter, private readonly loadout: Loadout) {
    const key = combatManifest.characters[f.skin]['idle-right'][0];
    this.sprite = scene.add.sprite(f.x, COMBAT.floorY, combatManifest.frames[key].page, key).setDepth(6);
    this.shadow = scene.add.ellipse(f.x, COMBAT.floorY, 155, 22, 0x030603, 0.5).setDepth(4);
    this.update(0);
  }
  update(delta: number): void {
    const f = this.f;
    if(f.action!==this.previousAction) {
      const striding=(state: Fighter['action'] | null): boolean => state==='walk' || state==='retreat';
      if(!(striding(f.action) && striding(this.previousAction))) this.clock=0;
      this.guardReleaseMs=this.previousAction==='block' && f.action==='idle' ? 90 : 0;
      this.previousAction=f.action;
    }
    this.clock+=delta;
    if(f.action!=='idle') this.guardReleaseMs=0;
    else this.guardReleaseMs=Math.max(0,this.guardReleaseMs-delta);
    const action = this.guardReleaseMs>0 ? 'block' : f.action === 'attack' ? f.skin === 'player' ? this.loadout[f.slot] : `attack${f.slot}` : f.action;
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
    else if (this.guardReleaseMs>0) progress=.6*this.guardReleaseMs/90;
    else if (f.action === 'block') progress = .6*Math.min(1,this.clock/90);
    else progress = (this.clock % (clip.length * (f.action === 'idle' ? 125 : 85))) / (clip.length * (f.action === 'idle' ? 125 : 85));
    const key = clip[Math.min(clip.length - 1, Math.floor(progress * clip.length))], meta = combatManifest.frames[key];
    this.sprite.setTexture(meta.page, key).setOrigin(meta.ox, meta.oy).setPosition(f.x, COMBAT.floorY);
    this.shadow.x = f.x;
    const evading=f.action==='dodge' && f.elapsed>=COMBAT.dodgeInvulnerableFrom && f.elapsed<COMBAT.dodgeInvulnerableTo;
    const dodgeFade=evading ? Math.min(1,(f.elapsed-COMBAT.dodgeInvulnerableFrom)/35,(COMBAT.dodgeInvulnerableTo-f.elapsed)/35) : 0;
    this.sprite.setAlpha(1-dodgeFade*.25);
    if(f.action==='hit'&&f.elapsed<65)this.sprite.setTintFill(0xffdfc5);else this.sprite.clearTint();
    this.trailMs+=delta;
    if(evading&&delta>0&&this.trailMs>=90&&document.body.dataset.motion!=='false'){
      this.trailMs=0;
      const ghost=this.scene.add.image(f.x,COMBAT.floorY,meta.page,key).setOrigin(meta.ox,meta.oy).setTint(0x89aba0).setAlpha(.18).setDepth(5);
      this.scene.tweens.add({targets:ghost,alpha:0,duration:160,onComplete:()=>ghost.destroy()});
    }
  }
  destroy(): void { this.sprite.destroy(); this.shadow.destroy(); }
}

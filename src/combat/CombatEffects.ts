import type Phaser from 'phaser';
import { COMBAT } from '../config/combat';
import type { GameServices } from '../core/GameServices';
import type { CombatEvent } from './CombatWorld';

/** Small, bounded impact bursts; timing, hitboxes and damage stay in CombatWorld. */
export function combatEffect(scene:Phaser.Scene,services:GameServices,event:CombatEvent):void {
  const {target,source,damage,type}=event;
  services.audio.play(type);
  const x=target.x,y=COMBAT.floorY-235,color=damage>0?0xf2c1a0:type==='block'?0xd5e7b9:0xa5c6ba;
  const text=scene.add.text(x,COMBAT.floorY-315,damage>0?`−${damage}`:type==='block'?'БЛОК':'УКЛОНЕНИЕ',{
    fontFamily:'Golos Text, sans-serif',fontSize:damage>0?'30px':'20px',fontStyle:'bold',color:damage>0?'#f2c1a0':'#d5e7b9',stroke:'#17191a',strokeThickness:4,
  }).setOrigin(.5).setDepth(10);
  scene.tweens.add({targets:text,y:text.y-55,alpha:0,duration:580,onComplete:()=>text.destroy()});
  if(!services.settings.current.animatedBackground)return;
  const contact=x-source.facing*38;
  if(type!=='dodge') {
    for(let i=0;i<7;i++){
      const angle=(Math.PI*2*i/7)+Math.random()*.25,length=25+Math.random()*45;
      const spark=scene.add.rectangle(contact,y,4,i%2?4:9,color).setRotation(angle).setDepth(9);
      scene.tweens.add({targets:spark,x:contact+Math.cos(angle)*length,y:y+Math.sin(angle)*length,alpha:0,scale:.2,duration:180+Math.random()*100,onComplete:()=>spark.destroy()});
    }
    const ring=scene.add.circle(contact,y,16).setStrokeStyle(3,color,.7).setDepth(9);
    scene.tweens.add({targets:ring,scale:2.1,alpha:0,duration:170,onComplete:()=>ring.destroy()});
    if(damage>0)scene.cameras.main.shake(type==='guard-break'?100:55,.0015,false);
  }
}

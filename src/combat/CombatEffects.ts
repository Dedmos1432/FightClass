import type Phaser from 'phaser';
import { COMBAT } from '../config/combat';
import type { GameServices } from '../core/GameServices';
import { worldLettering } from '../ui/worldLettering';
import type { CombatEvent, Fighter } from './CombatWorld';

const damageText = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const comboLabels = new WeakMap<Fighter, Phaser.GameObjects.Text>();

/** Small, bounded impact bursts; timing, hitboxes and damage stay in CombatWorld. */
export function combatEffect(scene:Phaser.Scene,services:GameServices,event:CombatEvent):void {
  const {target,source,damage,type,combo,bonus}=event;
  services.audio.play(type);
  const x=target.x,y=COMBAT.floorY-235,color=damage>0?0xf2c1a0:type==='block'?0xd5e7b9:0xa5c6ba;
  const text=worldLettering(scene,x,COMBAT.floorY-315,damage>0?`−${damageText.format(damage)}`:type==='block'?'БЛОК':'УКЛОНЕНИЕ',{
    fontSize:damage>0?'36px':'26px',fontStyle:'italic bold',color:damage>0?'#f8d6be':'#d5e7b9',strokeThickness:5,
  }).setOrigin(.5).setDepth(10);
  scene.tweens.add({targets:text,y:text.y-55,alpha:0,duration:580,onComplete:()=>text.destroy()});
  if (bonus > 0) {
    const previous = comboLabels.get(source);
    if (previous) { scene.tweens.killTweensOf(previous); previous.destroy(); }
    const label=worldLettering(scene,source.x,COMBAT.floorY-110,`${combo} удара · +${bonus}%`,{
      fontSize:'36px',fontStyle:'italic bold',color:source.skin === 'player' ? '#fff1dd' : '#ffc6ac',
      backgroundColor:'#3b2017',padding:{x:13,y:4},strokeThickness:3,
    }).setOrigin(.5).setAngle(-4).setDepth(11);
    comboLabels.set(source,label);
    scene.tweens.add({targets:label,y:label.y-28,alpha:0,delay:420,duration:430,onComplete:()=>{
      comboLabels.delete(source); label.destroy();
    }});
  }
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

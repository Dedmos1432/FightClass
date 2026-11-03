import { test,expect } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { CAREER_ROSTER } from '../src/career/Roster';
import { BotBrain } from '../src/combat/BotBrain';
import { CombatWorld,enemyFighter,fighter } from '../src/combat/CombatWorld';
import { COMBAT } from '../src/config/combat';
import { trainingAttributes } from '../src/training/Progression';
import { damageFor,freshEndless } from '../src/combat/EndlessProgress';
import { roundOutcome } from '../src/combat/RoundRules';

const seeded=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
test('баланс: 108 полных раундов против всех карьерных ботов, три уровня тренировки, конечные ресурсы и работающая защита',()=>{
  // An identical AI controller stands in for the player to compare stat curves, not human win rates.
  const samples:{effort:number;opponent:string;victories:number;draws:number;meanSeconds:number}[]=[];
  let invalid=false,totalBlocks=0,totalDodges=0;
  for(const effort of [0,100,400])for(const opponent of CAREER_ROSTER){
    let victories=0,draws=0,elapsed=0;
    for(const seed of [11,92,641]){
      const stats=trainingAttributes(effort),damage=damageFor({...freshEndless(),totalWins:effort});
      const p=fighter({skin:'player',x:710,stamina:stats.stamina,maxHP:stats.maxHP,damage,speed:COMBAT.playerSpeed,canDodge:true,autoFace:false});
      const e=enemyFighter(opponent),world=new CombatWorld(p,e),reverse=new CombatWorld(e,p);
      const enemy=new BotBrain(opponent,seeded(seed)),controller=new BotBrain({...CAREER_ROSTER[2],canDodge:true},seeded(seed+1));
      let ms=0;
      for(;ms<COMBAT.roundDurationMs&&!world.over;ms+=16){
        enemy.update(world,16);controller.update(reverse,16);world.update(16);
        for(const event of world.events){if(event.type==='block')totalBlocks++;if(event.type==='dodge')totalDodges++;}
        for(const f of [p,e])if(![f.x,f.hp,f.stamina].every(Number.isFinite)||f.hp<0||f.hp>f.maxHP||f.stamina<0||f.stamina>f.maxStamina||f.x<COMBAT.minX||f.x>COMBAT.maxX)invalid=true;
      }
      const outcome=roundOutcome(Math.min(ms,COMBAT.roundDurationMs),p,e);expect(outcome).not.toBeNull();
      if(outcome==='player')victories++;if(outcome==='draw')draws++;elapsed+=ms;
    }
    samples.push({effort,opponent:opponent.name,victories,draws,meanSeconds:Math.round(elapsed/3/100)/10});
  }
  expect(invalid).toBe(false);expect(totalBlocks).toBeGreaterThan(0);expect(totalDodges).toBeGreaterThan(0);
  mkdirSync('.cache/stage6',{recursive:true});writeFileSync('.cache/stage6/balance.json',JSON.stringify({rounds:108,totalBlocks,totalDodges,samples},null,2));
  console.log('Training comparison:',[0,100,400].map(effort=>({effort,wins:samples.filter(s=>s.effort===effort).reduce((sum,s)=>sum+s.victories,0),rounds:36})));
});

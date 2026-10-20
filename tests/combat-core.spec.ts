import { test, expect } from '@playwright/test';
import { CombatWorld, fighter, attackDuration, enemyFighter } from '../src/combat/CombatWorld';
import { ATTACK_SLOTS, COMBAT, type AttackSlot } from '../src/config/combat';
import { MOVES, loadoutFor, defaultLoadout } from '../src/combat/moves';
import { STYLES } from '../src/config/styles';
import { ROSTER, opponentAt } from '../src/combat/Opponents';
import { BotBrain } from '../src/combat/BotBrain';
import { damageFor, freshEndless, rewardFor } from '../src/combat/EndlessProgress';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { StorageService, type StorageLike } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../src/assets/combatManifest.json', import.meta.url), 'utf8'));

const battle = (x=700,enemyX=920) => new CombatWorld(
  fighter({ skin:'player',x,maxHP:200,stamina:150,damage:17,speed:340,canDodge:true }),
  fighter({ skin:'kim',x:enemyX,maxHP:200,stamina:150,damage:17,speed:340,canDodge:false,facing:-1 }),
);
const advance = (world:CombatWorld, ms:number) => { for(let t=0;t<ms;t+=8) world.update(Math.min(8,ms-t)); };
class Memory implements StorageLike {
  values=new Map<string,string>(); getItem(k:string) { return this.values.get(k)??null; }
  setItem(k:string,v:string) { this.values.set(k,v); }
}
const newSave = () => { const storage=new Memory(), saves=new SaveService(new StorageService(storage)); saves.startNew(); return {saves,storage}; };

test('попадание только в активные кадры, один раз за атаку и в пределах hitbox',() => {
  const w=battle(); w.attack(w.player,0); advance(w,149); expect(w.enemy.hp).toBe(200);
  advance(w,2); expect(w.enemy.hp).toBe(183);
  advance(w,600); expect(w.enemy.hp).toBe(183);
  const far=battle(400,1300); far.attack(far.player,2); advance(far,1000); expect(far.enemy.hp).toBe(200);
});
test('все 12 анимаций и все слоты наносят только общий урон, стили не меняют параметры',() => {
  expect(MOVES).toHaveLength(12);
  expect(STYLES).toHaveLength(5);
  for(const style of STYLES.slice(0,4)) expect(loadoutFor(style.id,defaultLoadout())).toHaveLength(3);
  for(const move of MOVES) for(const slot of [0,1,2] as AttackSlot[]) {
    expect(manifest.characters.player[`${move.id}-right` as keyof typeof manifest.characters.player]).toBeDefined();
    const w=battle(); w.attack(w.player,slot); advance(w,1000);
    expect(w.enemy.hp,move.name).toBe(183);
  }
});
test('блок расходует выносливость и полностью защищает, истощённый блок пробивается',() => {
  const w=battle(); w.enemy.blocking=true; w.attack(w.player,0); advance(w,200);
  expect(w.enemy.hp).toBe(200); expect(w.enemy.stamina).toBeLessThan(145);
  const weak=battle(); weak.enemy.stamina=1; weak.enemy.blocking=true; weak.attack(weak.player,0); advance(weak,200);
  expect(weak.enemy.hp).toBe(183); expect(weak.enemy.action).toBe('hit'); expect(weak.enemy.stun).toBeGreaterThan(500);
});
test('уклонение даёт ограниченную неуязвимость и имеет цену; Kim никогда не уклоняется',() => {
  const w=battle(1550,1760); w.enemy.canDodge=true;
  expect(w.dodge(w.enemy)).toBe(true); expect(w.enemy.stamina).toBe(125);
  w.attack(w.player,0); advance(w,200); expect(w.enemy.hp).toBe(200);
  advance(w,400); w.attack(w.player,0); advance(w,220); expect(w.enemy.hp).toBe(183);
  const kim=battle(); expect(kim.dodge(kim.enemy)).toBe(false); expect(kim.enemy.stamina).toBe(150);
  const profile=opponentAt(0), brain=new BotBrain(profile,()=>0);
  kim.player.action='attack'; brain.update(kim,1000); expect(kim.enemy.action).not.toBe('dodge');
});
test('нехватка выносливости запрещает атаку и уклонение, оглушение запрещает действия',() => {
  const w=battle(); w.player.stamina=0;
  expect(w.attack(w.player,0)).toBe(false); expect(w.dodge(w.player)).toBe(false);
  advance(w,1000); expect(w.player.stamina).toBeGreaterThan(14);
  w.player.action='hit'; expect(w.attack(w.player,0)).toBe(false); expect(w.dodge(w.player)).toBe(false);
});
test('буфер позволяет последовательную комбинацию, четвёртый удар цепочки не принимается',() => {
  const w=battle(); w.attack(w.player,0); advance(w,attackDuration(0)-100);
  expect(w.attack(w.player,1)).toBe(true); advance(w,101); expect(w.player.slot).toBe(1); expect(w.player.combo).toBe(2);
  advance(w,attackDuration(1)-100); expect(w.attack(w.player,2)).toBe(true); advance(w,100);
  expect(w.player.combo).toBe(3); advance(w,attackDuration(2)-100);
  expect(w.attack(w.player,0)).toBe(false);
});
test('15 самостоятельных профилей используют три внешности, выбор стабилен при загрузке, сложность растёт с победами и временем',() => {
  expect(ROSTER).toHaveLength(15); expect(new Set(ROSTER.map(r=>r.id)).size).toBe(15);
  expect(new Set(ROSTER.map(r=>JSON.stringify([r.aggression,r.defense,r.preferredRange,r.dodgePreference,r.reserve]))).size).toBe(15);
  expect(new Set(ROSTER.map(r=>r.skin)).size).toBe(3);
  expect(opponentAt(3,'saved-run')).toEqual(opponentAt(3,'saved-run'));
  const first=opponentAt(0,'same'), longer=opponentAt(0,'same',900000);
  expect(longer.id).toBe(first.id); expect(longer.maxHP).toBeGreaterThan(first.maxHP);
  expect(longer.reactionMs).toBeLessThan(first.reactionMs); expect(longer.skill).toBeGreaterThan(first.skill);
  expect(opponentAt(150).damage).toBeGreaterThan(opponentAt(15).damage);
  for(let i=0;i<45;i++) if(opponentAt(i).skin==='kim') expect(opponentAt(i).canDodge).toBe(false);
});
test('награда с убывающей эффективностью без потолка, нулевая серия без награды',() => {
  const p=freshEndless(); expect(rewardFor(p,0)).toBe(0);
  expect(rewardFor(p,4)).toBeGreaterThan(rewardFor(p,1));
  expect(damageFor({...p,totalWins:10000})).toBeGreaterThan(damageFor({...p,totalWins:100}));
  expect(rewardFor({...p,totalWins:100},4)).toBeLessThan(rewardFor(p,4));
});
test('следующий противник получает полное HP, HP игрока не восстанавливается, награда только после поражения и один раз',() => {
  const {saves}=newSave(); const run=saves.beginEndless()!;
  const before=saves.stats.damage;
  saves.checkpointEndless(run.id,{...run,hp:37,stamina:42,enemyHP:0});
  const next=saves.advanceEndless(run.id)!;
  expect(next.hp).toBe(37); expect(next.stamina).toBe(42); expect(next.wins).toBe(1); expect(next.enemyHP).toBe(opponentAt(1,run.id).maxHP);
  expect(saves.stats.damage).toBe(before); expect(saves.finishEndless(run.id)).toBeNull();
  saves.checkpointEndless(run.id,{...next,hp:0});
  expect(saves.finishEndless(run.id)).toEqual({wins:1,gain:COMBAT.damageGrowth,damage:before+COMBAT.damageGrowth});
  expect(saves.finishEndless(run.id)).toBeNull(); expect(saves.endless.totalWins).toBe(1);
  expect(saves.beginEndless()!.wins).toBe(0); expect(saves.stats.damage).toBe(before+COMBAT.damageGrowth);
});
test('сохранение серии и свободного стиля переживает перезагрузку без повторной награды',() => {
  const {saves,storage}=newSave(); saves.updateFreestyle(['hook','teep','axe-kick']);
  const run=saves.beginEndless()!; saves.checkpointEndless(run.id,{...run,hp:61,enemyHP:24,stamina:32.7});
  const reloaded=new SaveService(new StorageService(storage));
  expect(reloaded.activeRun?.hp).toBe(61); expect(reloaded.activeRun?.enemyHP).toBe(24);
  expect(reloaded.freestyle).toEqual(['hook','teep','axe-kick']); expect(reloaded.stats.damage).toBe(10);
  expect(reloaded.beginEndless()!.id).toBe(run.id);
});
test('старые сохранения совместимы, недопустимые наборы и NaN состояния отвергаются',() => {
  const {saves,storage}=newSave(), legacy={...saves.current!};
  delete legacy.endless; delete legacy.freestyle;
  storage.setItem(GAME.storage.session,JSON.stringify(legacy));
  const old=new SaveService(new StorageService(storage)); expect(old.current).not.toBeNull(); expect(old.stats.damage).toBe(10);
  expect(old.updateFreestyle(['jab','jab','teep'])).toBe(false);
  const run=old.beginEndless()!; expect(old.checkpointEndless(run.id,{...run,hp:NaN})).toBe(false);
  expect(isSessionSave({...legacy,activeRun:{...run,enemyHP:-1}})).toBe(false);
});
test('атласы содержат все состояния и направления; отсутствие уклонения Kim явное',() => {
  for(const skin of ['player','kim','kwon','yeo'] as const) {
    const clips=manifest.characters[skin] as Record<string,string[]>;
    for(const state of ['idle','walk','retreat','block','hit','ko',...(skin==='kim'?[]:['dodge'])])
      for(const dir of ['left','right']) expect(clips[`${state}-${dir}`]?.length).toBeGreaterThan(1);
  }
  expect('dodge-right' in manifest.characters.kim).toBe(false);
  expect(ATTACK_SLOTS.every(s=>s.active>0)).toBe(true);
});



test('бойцы проходят друг через друга, поворачиваются и могут ударить сзади сквозь фронтальный блок',() => {
  const w=battle(700,850); w.enemy.autoFace=false; w.enemy.blocking=true;
  w.player.direction=1; advance(w,700); w.player.direction=0;
  expect(w.player.x).toBeGreaterThan(w.enemy.x+70); expect(w.enemy.x).toBe(850);
  expect(w.player.facing).toBe(-1); expect(w.enemy.facing).toBe(-1);
  expect(w.attack(w.player,0)).toBe(true); advance(w,180);
  expect(w.enemy.hp).toBe(183);
});
function thinking(w:CombatWorld,brain:BotBrain,ms:number):void {
  for(let t=0;t<ms;t+=8){brain.update(w,8);w.update(8);}
}
function tacticalWorld(profile:ReturnType<typeof opponentAt>):CombatWorld {
  const w=battle(); w.enemy=enemyFighter(profile); w.enemy.x=920; return w;
}
test('ИИ видит атаку с задержкой, умеет уклониться от медленного удара, Kim вместо этого блокирует',() => {
  for(const canDodge of [true,false]) {
    const profile={...opponentAt(canDodge?4:0),defense:1,dodgePreference:1,skill:.98,reactionMs:100,canDodge};
    const w=tacticalWorld(profile), brain=new BotBrain(profile,()=>0);
    w.attack(w.player,2); thinking(w,brain,80); expect(w.enemy.action).toBe('idle');
    thinking(w,brain,64); expect(w.enemy.action).toBe(canDodge?'dodge':'block');
    thinking(w,brain,250); expect(w.enemy.hp).toBe(w.enemy.maxHP);
  }
});
test('ИИ замечает восстановление после промаха и отвечает быстрым контрударом',() => {
  const profile={...opponentAt(3),counterPreference:1,skill:.98,reactionMs:100};
  const w=tacticalWorld(profile), brain=new BotBrain(profile,()=>0);
  w.player.action='attack';w.player.slot=0;w.player.elapsed=280;w.player.hitLanded=true;
  thinking(w,brain,144);expect(brain.state).toBe('counter');expect(w.enemy.action).toBe('attack');expect(w.enemy.slot).toBe(0);
});
test('ИИ отходит восстанавливать силы и запоминает повторяемый слот атаки',() => {
  const profile={...opponentAt(4),skill:.98,reactionMs:100};
  const tired=tacticalWorld(profile), brain=new BotBrain(profile,()=>0);
  tired.enemy.stamina=3;thinking(tired,brain,144);expect(brain.state).toBe('recover');expect(tired.enemy.direction).toBe(1);
  const w=tacticalWorld(profile), reader=new BotBrain(profile,()=>.99);
  for(let i=0;i<4;i++){
    w.player.action='attack';w.player.slot=2;w.player.elapsed=0;reader.update(w,140);
    w.player.action='idle';reader.update(w,200);
  }
  expect(reader.habits.favorite).toBe(2);expect(reader.habits.repetition).toBe(1);
});
test('разворот бота после прохода за спину занимает время реакции',() => {
  const profile={...opponentAt(0),reactionMs:220};const w=tacticalWorld(profile),brain=new BotBrain(profile,()=>.99);
  thinking(w,brain,300);expect(w.enemy.facing).toBe(-1);
  w.player.x=w.enemy.x+180;thinking(w,brain,100);expect(w.enemy.facing).toBe(-1);
  thinking(w,brain,280);expect(w.enemy.facing).toBe(1);
});
test('прибавка +6 урона теперь требует четыре победы, прогресс времени и профиль сохраняются',() => {
  expect(damageFor({...freshEndless(),totalWins:4})).toBe(16);
  const {saves,storage}=newSave();const run=saves.beginEndless()!;
  saves.checkpointEndless(run.id,{...run,elapsedMs:123456,enemyHP:0,hp:37});
  const next=saves.advanceEndless(run.id)!;expect(next.elapsedMs).toBe(123456);expect(next.roundStartedMs).toBe(123456);expect(next.hp).toBe(37);
  const restored=new SaveService(new StorageService(storage)).activeRun!;
  expect(opponentAt(restored.wins,restored.id,restored.roundStartedMs)).toEqual(opponentAt(next.wins,next.id,next.roundStartedMs));
});

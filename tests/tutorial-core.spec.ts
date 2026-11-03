import { test, expect } from '@playwright/test';
import { CombatTutorial } from '../src/tutorial/CombatTutorial';
import { TUTORIAL_STEPS } from '../src/tutorial/Progress';
import { attackDuration } from '../src/combat/CombatWorld';
import { COMBAT, type AttackSlot } from '../src/config/combat';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { StorageService, type StorageLike } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { CLUB_GUIDE_STEPS, clubGuideRoom, freshClubGuide, observedClubStep } from '../src/tutorial/ClubGuide';

class Memory implements StorageLike {
  data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}
}
const advance=(t:CombatTutorial,ms:number)=>{for(let i=0;i<ms;i+=8)t.update(Math.min(8,ms-i));};

test('новая игра начинает обучение, завершённые уроки восстанавливаются, старая версия сохранения продолжает лобби',()=>{
  const memory=new Memory(),saves=new SaveService(new StorageService(memory));saves.startNew();
  expect(saves.needsTutorial).toBe(true);expect(saves.tutorialStep).toBe('movement');
  expect(saves.advanceTutorial('block')).toBe(false);expect(saves.advanceTutorial('movement')).toBe(true);
  const restored=new SaveService(new StorageService(memory));expect(restored.tutorialStep).toBe('attacks');
  const legacy={...restored.current!};delete legacy.tutorial;
  delete legacy.clubGuide;
  memory.setItem(GAME.storage.session,JSON.stringify(legacy));
  const older=new SaveService(new StorageService(memory));expect(older.needsTutorial).toBe(false);expect(older.current?.id).toBe(saves.current?.id);
  expect(older.needsClubGuide).toBe(false);
});

test('экскурсия начинается после боя, сохраняет шаг и не открывает обучение старым завершённым сохранениям',()=>{
  const memory=new Memory(),saves=new SaveService(new StorageService(memory));saves.startNew();
  expect(saves.needsClubGuide).toBe(false);
  for(const step of TUTORIAL_STEPS.slice(0,-1))saves.advanceTutorial(step);
  expect(saves.needsClubGuide).toBe(true);expect(saves.clubGuide).toEqual(freshClubGuide());
  expect(saves.advanceClubGuide('press')).toBe(false);
  saves.advanceClubGuide('gym-door');expect(new SaveService(new StorageService(memory)).clubGuide.step).toBe('bench');
  const copy=saves.clubGuide;copy.step='complete';expect(saves.clubGuide.step).toBe('bench');
  const old={...saves.current!};delete old.clubGuide;memory.setItem(GAME.storage.session,JSON.stringify(old));
  expect(new SaveService(new StorageService(memory)).needsClubGuide).toBe(false);
});

test('экскурсия: реальные комнаты и повторение двигают задания, отменённый подход не засчитывается',()=>{
  let progress=freshClubGuide(7);
  expect(observedClubStep(progress,'dojo',false,7)).toBe('gym-door');
  progress={...progress,step:observedClubStep(progress,'gym',false,7)};expect(progress.step).toBe('bench');
  expect(observedClubStep(progress,'gym',false,7)).toBe('bench');
  progress={...progress,step:observedClubStep(progress,'gym',true,7)};expect(progress.step).toBe('press');
  expect(observedClubStep(progress,'gym',false,7)).toBe('press');
  progress={...progress,step:observedClubStep(progress,'gym',true,8)};expect(progress.step).toBe('gym-exit');
  expect(observedClubStep(progress,'gym',false,8)).toBe('gym-exit');
  progress={...progress,step:observedClubStep(progress,'lobby',false,8)};expect(progress.step).toBe('dojo-door');
  progress={...progress,step:observedClubStep(progress,'dojo',false,8)};expect(progress.step).toBe('dojo-start');
  expect(observedClubStep(progress,'dojo',false,8)).toBe('dojo-start');
});

test('повтор экскурсии учитывает прежние повторения, пропуск не меняет прокачку и сохранённые бои',()=>{
  const saves=new SaveService(new StorageService(null));saves.startNew();
  const id=saves.beginBenchSession()!;saves.completeBenchRep(id,1);saves.finishBenchSession(id);saves.beginEndless();
  const before=saves.current!;saves.beginTutorial();expect(saves.clubGuide.repsBefore).toBe(1);
  saves.skipTutorial();expect(saves.needsTutorial).toBe(false);expect(saves.needsClubGuide).toBe(false);
  for(const field of ['stats','training','endless','activeRun','career','player'] as const)expect(saves.current![field]).toEqual(before[field]);
  saves.beginTutorial();for(const step of TUTORIAL_STEPS.slice(0,-1))saves.advanceTutorial(step);
  for(const step of CLUB_GUIDE_STEPS.slice(0,-1))expect(saves.advanceClubGuide(step)).toBe(true);
  expect(saves.needsClubGuide).toBe(false);
});

test('экскурсия: схема отвергает повреждённые шаги и счётчики, продолжение выбирает нужную комнату',()=>{
  const saves=new SaveService(new StorageService(null));const save=saves.startNew();
  for(const clubGuide of [null,{},false,{step:'bad',repsBefore:0},{step:'bench',repsBefore:-1},{step:'bench',repsBefore:NaN},{step:'bench',repsBefore:1}])expect(isSessionSave({...save,clubGuide})).toBe(false);
  expect(clubGuideRoom('gym-door')).toBe('lobby');expect(clubGuideRoom('press')).toBe('gym');
  expect(clubGuideRoom('gym-exit')).toBe('gym');expect(clubGuideRoom('dojo-door')).toBe('lobby');expect(clubGuideRoom('dojo-start')).toBe('dojo');
});

test('завершение, пропуск и повтор обучения не меняют характеристики, тренировки, карьеру и незавершённую серию',()=>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.beginEndless();
  const before=saves.current!;
  for(const step of TUTORIAL_STEPS.slice(0,-1)) expect(saves.advanceTutorial(step)).toBe(true);
  expect(saves.needsTutorial).toBe(false);expect(saves.advanceTutorial('complete')).toBe(false);
  saves.beginTutorial();expect(saves.tutorialStep).toBe('movement');saves.skipTutorial();
  for(const field of ['id','stats','training','career','endless','activeRun','player'] as const)expect(saves.current![field]).toEqual(before[field]);
  saves.startNew();expect(saves.tutorialStep).toBe('movement');expect(saves.current!.activeRun).toBeUndefined();
});

test('неизвестные и повреждённые поля обучения отклоняются без ослабления схемы сохранения',()=>{
  const saves=new SaveService(new StorageService(null));const save=saves.startNew();
  for(const tutorial of [null,false,3,{},'unknown'])expect(isSessionSave({...save,tutorial})).toBe(false);
  for(const tutorial of TUTORIAL_STEPS)expect(isSessionSave({...save,tutorial})).toBe(true);
});

test('движение: нужны обе стороны и реальное перемещение, удержание блока не засчитывается',()=>{
  const t=new CombatTutorial('movement'),p=t.world.player;
  p.direction=-1;p.blocking=true;advance(t,500);expect(t.left).toBe(0);
  p.blocking=false;advance(t,300);expect(t.checks).toEqual([true,false]);
  p.direction=1;advance(t,300);expect(t.ready).toBe(true);
});

test('три удара: промахи не засчитываются, нужны настоящие попадания каждым слотом',()=>{
  const t=new CombatTutorial('attacks'),w=t.world;
  w.player.x=200;w.attack(w.player,0);advance(t,600);expect(t.strikes.size).toBe(0);
  w.player.x=780;
  for(const slot of [0,1,2] as AttackSlot[]) {expect(w.attack(w.player,slot)).toBe(true);advance(t,attackDuration(slot)+16);}
  expect(t.checks).toEqual([true,true,true]);expect(t.ready).toBe(true);
});

test('комбинация требует попадания продолжением в настоящее окно восстановления',()=>{
  const t=new CombatTutorial('combo'),w=t.world;
  w.attack(w.player,0);advance(t,100);expect(w.attack(w.player,1)).toBe(false);expect(t.ready).toBe(false);
  advance(t,attackDuration(0)-COMBAT.comboBufferMs-70);expect(w.attack(w.player,1)).toBe(true);
  advance(t,1200);expect(t.combo).toBe(true);
});

test('блок: нажатие без удара не засчитывается, учебный удар использует обычную защиту',()=>{
  const t=new CombatTutorial('block'),w=t.world;w.player.blocking=true;
  advance(t,500);expect(t.blocked).toBe(false);
  advance(t,1800);expect(t.blocked).toBe(true);expect(w.player.hp).toBe(100);
});

test('уклонение: требуется избежать реального удара в активное окно неуязвимости',()=>{
  const t=new CombatTutorial('dodge'),w=t.world;
  w.dodge(w.player);advance(t,600);expect(t.dodged).toBe(false);
  // Re-enter with identical placement: an early dodge cannot complete the lesson.
  t.enter('dodge');
  for(let i=0;i<2000 && !t.dodgeCue;i+=8)t.update(8);
  expect(t.dodgeCue).toBe(true);expect(w.dodge(w.player)).toBe(true);
  advance(t,600);expect(t.dodged).toBe(true);expect(w.player.hp).toBe(100);
});

test('выносливость: сначала тратится настоящий запас, затем требуется восстановить его до 80',()=>{
  const t=new CombatTutorial('stamina'),w=t.world;
  advance(t,1000);expect(t.recovered).toBe(false);
  for(let i=0;i<4;i++){expect(w.attack(w.player,2)).toBe(true);advance(t,attackDuration(2)+16);}
  expect(t.spent).toBe(true);expect(t.ready).toBe(false);
  advance(t,4000);expect(t.recovered).toBe(true);expect(t.ready).toBe(true);
});

test('переход сбрасывает учебные действия, а партнёр не атакует вне уроков защиты и не может завершить спарринг поражением',()=>{
  const t=new CombatTutorial('movement');advance(t,5000);expect(t.world.player.hp).toBe(100);
  t.enter('block');advance(t,90_000);expect(t.world.over).toBe(false);
  t.enter('club');expect(t.world.player.hp).toBe(100);expect(t.world.player.stamina).toBe(100);expect(t.checks).toEqual([]);
});

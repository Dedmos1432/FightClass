import { test, expect } from '@playwright/test';
import { CombatTutorial } from '../src/tutorial/CombatTutorial';
import { TutorialCoach } from '../src/tutorial/TutorialCoach';
import { TUTORIAL_STEPS } from '../src/tutorial/Progress';
import { attackDuration } from '../src/combat/CombatWorld';
import { ATTACK_SLOTS, COMBAT, type AttackSlot } from '../src/config/combat';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { StorageService, type StorageLike } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { CLUB_GUIDE_STEPS, clubGuideRoom, clubGuideTarget, clubGuideAllows, freshClubGuide, observedClubStep, type ClubGuideProgress } from '../src/tutorial/ClubGuide';

class Memory implements StorageLike {
  data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}
}
const advance=(t:CombatTutorial,ms:number)=>{for(let i=0;i<ms;i+=8)t.update(Math.min(8,ms-i));};

test('подсказка постепенно останавливает окно комбо и продолжает его после правильного удара', () => {
  const trainer = new CombatTutorial('combo');
  const coach = new TutorialCoach(trainer, false);
  const player = trainer.world.player;
  coach.attack(0);
  advance(trainer, attackDuration(0) - COMBAT.comboBufferMs);
  expect(coach.cue?.id).toBe('combo-follow');

  const tick = () => {
    const { timeScale } = coach.frame(20, 0, false, false);
    if (timeScale > 0) trainer.update(20 * timeScale);
    return timeScale;
  };
  const first = tick();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(1);
  for(let frame = 0; frame < 20; frame++) tick();
  const frozenAt = player.elapsed;
  coach.attack(0);
  expect(tick()).toBe(0);
  expect(player.elapsed).toBe(frozenAt);
  expect(player.buffered).toBeNull();

  coach.attack(1);
  expect(tick()).toBe(1);
  for(let frame = 0; frame < 25 && !trainer.combo; frame++) tick();
  expect(trainer.combo).toBe(true);
});

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
  saves.advanceClubGuide('style');expect(new SaveService(new StorageService(memory)).clubGuide.step).toBe('gym-door');
  saves.advanceClubGuide('gym-door');expect(new SaveService(new StorageService(memory)).clubGuide.step).toBe('bench');
  const copy=saves.clubGuide;copy.step='complete';expect(saves.clubGuide.step).toBe('bench');
  const old={...saves.current!};delete old.clubGuide;memory.setItem(GAME.storage.session,JSON.stringify(old));
  expect(new SaveService(new StorageService(memory)).needsClubGuide).toBe(false);
});

test('экскурсия: реальные комнаты и повторение двигают задания, отменённый подход не засчитывается',()=>{
  const start=freshClubGuide(7);
  expect(start.step).toBe('style');
  expect(observedClubStep(start,'gym',true,8)).toBe('style');
  let progress:ClubGuideProgress={...start,step:'gym-door'};
  expect(observedClubStep(progress,'dojo',false,7)).toBe('gym-door');
  progress={...progress,step:observedClubStep(progress,'gym',false,7)};expect(progress.step).toBe('bench');
  expect(observedClubStep(progress,'gym',false,7)).toBe('bench');
  progress={...progress,step:observedClubStep(progress,'gym',true,7)};expect(progress.step).toBe('press');
  expect(observedClubStep(progress,'gym',false,7)).toBe('press');
  progress={...progress,step:observedClubStep(progress,'gym',true,8)};expect(progress.step).toBe('gym-exit');
  expect(observedClubStep(progress,'gym',false,8)).toBe('gym-exit');
  progress={...progress,step:observedClubStep(progress,'lobby',false,8)};expect(progress.step).toBe('career-board');
  expect(observedClubStep(progress,'lobby',false,8)).toBe('career-board');
  progress={...progress,step:'career-review'};
  expect(observedClubStep(progress,'dojo',false,8)).toBe('career-review');
  progress={...progress,step:'dojo-door'};
  progress={...progress,step:observedClubStep(progress,'dojo',false,8)};expect(progress.step).toBe('dojo-start');
  expect(observedClubStep(progress,'dojo',false,8)).toBe('dojo-start');
});

test('экскурсия разрешает только текущее назначение: стиль, качалка, доска, зал',()=>{
  for(const room of ['lobby','gym','dojo'] as const){
    expect(clubGuideTarget('style',room)).toBe('style');
    for(const action of ['gym','board','dojo','bench','series'] as const)expect(clubGuideAllows('style',room,action)).toBe(false);
  }
  for(const step of ['gym-door','bench','press','gym-exit'] as const){
    expect(clubGuideAllows(step,'lobby','gym')).toBe(true);
    expect(clubGuideAllows(step,'lobby','board')).toBe(false);
    expect(clubGuideAllows(step,'lobby','dojo')).toBe(false);
  }
  for(const step of ['career-board','career-review'] as const){
    expect(clubGuideAllows(step,'lobby','board')).toBe(true);
    expect(clubGuideAllows(step,'lobby','gym')).toBe(false);
    expect(clubGuideAllows(step,'lobby','dojo')).toBe(false);
    expect(clubGuideAllows(step,'dojo','series')).toBe(false);
  }
  for(const step of ['dojo-door','dojo-start'] as const){
    expect(clubGuideAllows(step,'lobby','dojo')).toBe(true);
    expect(clubGuideAllows(step,'lobby','board')).toBe(false);
    expect(clubGuideAllows(step,'dojo','series')).toBe(true);
  }
  expect(clubGuideAllows('bench','gym','bench')).toBe(true);
  expect(clubGuideAllows('press','gym','bench')).toBe(true);
  expect(clubGuideAllows('gym-exit','gym','bench')).toBe(false);
});

test('выход и продолжение незавершённого жима не пропускают этапы, завершение снимает ограничения',()=>{
  const progress:ClubGuideProgress={step:'press',repsBefore:7};
  expect(observedClubStep(progress,'lobby',false,7)).toBe('press');
  expect(clubGuideTarget('press','lobby')).toBe('gym');
  for(const step of CLUB_GUIDE_STEPS)for(const room of ['lobby','gym','dojo'] as const){
    expect(clubGuideAllows(step,room,'exit')).toBe(true);
    expect(clubGuideAllows(step,room,'style')).toBe(true);
  }
  for(const room of ['lobby','gym','dojo'] as const)for(const action of ['gym','board','dojo','bench','series'] as const)
    expect(clubGuideAllows('complete',room,action)).toBe(true);
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
  expect(clubGuideRoom('style')).toBe('lobby');expect(clubGuideRoom('gym-door')).toBe('lobby');expect(clubGuideRoom('press')).toBe('gym');
  expect(clubGuideRoom('gym-exit')).toBe('gym');expect(clubGuideRoom('dojo-door')).toBe('lobby');expect(clubGuideRoom('dojo-start')).toBe('dojo');
  expect(clubGuideRoom('career-board')).toBe('lobby');expect(clubGuideRoom('career-review')).toBe('lobby');
});

test('карьерный урок сохраняет просмотр доски, не начинает матч и принимает прежние шаги экскурсии',()=>{
  const memory=new Memory(),saves=new SaveService(new StorageService(memory));saves.startNew();
  for(const step of TUTORIAL_STEPS.slice(0,-1))saves.advanceTutorial(step);
  for(const step of CLUB_GUIDE_STEPS){if(step==='career-board')break;saves.advanceClubGuide(step);}
  expect(saves.clubGuide.step).toBe('career-board');
  const before=saves.current!;
  expect(saves.advanceClubGuide('career-review')).toBe(false);
  saves.advanceClubGuide('career-board');
  const restored=new SaveService(new StorageService(memory));expect(restored.clubGuide.step).toBe('career-review');
  expect(restored.activeCareer).toBeNull();expect(restored.activeRun).toBeNull();
  restored.advanceClubGuide('career-review');expect(restored.clubGuide.step).toBe('dojo-door');
  for(const field of ['stats','training','career','endless'] as const)expect(restored.current![field]).toEqual(before[field]);
  for(const step of CLUB_GUIDE_STEPS){
    memory.setItem(GAME.storage.session,JSON.stringify({...before,clubGuide:{step,repsBefore:0}}));
    const older=new SaveService(new StorageService(memory));expect(older.loadIssue).toBeNull();expect(older.clubGuide.step).toBe(step);
  }
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

for (const [back, late] of [[-1,false],[1,false],[-1,true],[1,true]] as const) test(`уклонение: отход ${back===-1?'влево':'вправо'} ${late?'в конце':'в начале'} сигнала и рывок к партнёру`,()=>{
  const t=new CombatTutorial('dodge'),{world:w}=t,{player:p}=w;
  const forward=back===-1?1:-1;
  const setSide=()=>{ p.x=w.enemy.x+back*150; };
  setSide();
  expect(t.dodgePracticeDirection).toBe(back);
  expect(w.dodge(p,back)).toBe(true);
  advance(t,600);expect(t.checks).toEqual([false,false]);

  t.enter('dodge');setSide();
  for(let i=0;i<2000 && !t.dodgeCue;i+=8)t.update(8);
  if (late) {
    const lastCueMs = ATTACK_SLOTS[w.enemy.slot].startup - COMBAT.dodgeInvulnerableFrom - 1;
    advance(t,lastCueMs - w.enemy.elapsed);
  }
  expect(t.dodgeCue).toBe(true);expect(w.dodge(p,back)).toBe(true);
  advance(t,600);expect(t.checks).toEqual([true,false]);expect(p.hp).toBe(100);
  expect(w.enemy.hitLanded).toBe(true);
  expect(t.dodgePracticeDirection).toBe(forward);

  p.direction=forward;advance(t,64);p.direction=0;
  expect(t.ready).toBe(false);
  expect(w.dodge(p,forward)).toBe(true);
  advance(t,64);expect(t.checks).toEqual([true,true]);expect(t.ready).toBe(true);
});

test('отход по подсказке засчитывается, если герой вышел из зоны удара', () => {
  const t = new CombatTutorial('dodge');
  const { player, enemy } = t.world;
  enemy.x = player.x + 160;
  expect(t.world.attack(enemy, 2)).toBe(true);
  expect(t.dodgeCue).toBe(true);
  expect(t.world.dodge(player, -1)).toBe(true);
  advance(t, ATTACK_SLOTS[2].startup + ATTACK_SLOTS[2].active);
  expect(enemy.hitLanded).toBe(false);
  expect(player.hp).toBe(100);
  expect(t.checks).toEqual([true, false]);
});

test('уклонение до подсказки не засчитывает промах партнёра', () => {
  const t = new CombatTutorial('dodge');
  const { player, enemy } = t.world;
  enemy.x = player.x + 160;
  expect(t.dodgeCue).toBe(false);
  expect(t.world.dodge(player, -1)).toBe(true);
  t.update(8);
  expect(t.world.attack(enemy, 2)).toBe(true);
  advance(t, ATTACK_SLOTS[2].startup + ATTACK_SLOTS[2].active);
  expect(enemy.hitLanded).toBe(false);
  expect(player.hp).toBe(100);
  expect(t.checks).toEqual([false, false]);
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

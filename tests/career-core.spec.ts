import { test, expect } from '@playwright/test';
import { CAREER_ROSTER, careerOpponent } from '../src/career/Roster';
import { careerAvailable, careerClass, careerComplete, careerScore, careerWinsNeeded, careerRoundNumber, isCareerProgress, isCareerRun } from '../src/career/Progress';
import { settleCareerRound, winCareerMatch } from './helpers/career';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { StorageService, type StorageLike } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { COMBAT } from '../src/config/combat';

class Memory implements StorageLike {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key) ?? null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}
const setup=()=>{const memory=new Memory(),saves=new SaveService(new StorageService(memory));saves.startNew();return {memory,saves};};
const win=winCareerMatch;

test('карьера: точный порядок12, четыре на класс, шесть боссов и монотонная сложность',()=>{
  expect(CAREER_ROSTER.map(o=>o.id)).toEqual(['kim','kwon','yeo','shim','bang','jang','cha','young','sunny','lee','yang','maria']);
  for(const tier of [1,2,3]) expect(CAREER_ROSTER.filter(o=>o.tier===tier)).toHaveLength(4);
  expect(CAREER_ROSTER.filter(o=>o.boss).map(o=>o.id)).toEqual(['shim','young','sunny','lee','yang','maria']);
  expect(CAREER_ROSTER.filter(o=>!o.canDodge).map(o=>o.id)).toEqual(['kim']);
  expect(careerOpponent('jang')!.name).toBe('Jang Chun-soo');
  expect(careerOpponent('lee')!.name).toBe('Lee Ja-kyung');
  expect(careerOpponent('yang')!.name).toBe('Yang Ki-hoon');
  for(let i=1;i<CAREER_ROSTER.length;i++){
    expect(CAREER_ROSTER[i].maxHP).toBeGreaterThan(CAREER_ROSTER[i-1].maxHP);
    expect(CAREER_ROSTER[i].damage).toBeGreaterThan(CAREER_ROSTER[i-1].damage);
    expect(CAREER_ROSTER[i].skill).toBeGreaterThan(CAREER_ROSTER[i-1].skill);
    expect(CAREER_ROSTER[i].reactionMs).toBeLessThan(CAREER_ROSTER[i-1].reactionMs);
  }
});

test('карьера: старое сохранение не сбрасывает тренировки, бесконечный режим и стиль',()=>{
  const {memory,saves}=setup();
  saves.updateLobby({style:'muay-thai'});
  const bench=saves.beginBenchSession()!;
  for(let rep=1;rep<=5;rep++) saves.completeBenchRep(bench,rep);
  saves.finishBenchSession(bench);
  const endless=saves.beginEndless()!;
  const legacy={...saves.current!};delete legacy.career;delete legacy.activeCareer;
  memory.setItem(GAME.storage.session,JSON.stringify(legacy));
  const restored=new SaveService(new StorageService(memory));
  expect(restored.loadIssue).toBeNull();expect(restored.training.totalReps).toBe(5);
  expect(restored.activeRun!.id).toBe(endless.id);expect(restored.lobbyState.style).toBe('muay-thai');
  expect(restored.career.victories).toEqual([]);expect(restored.current!.currentClass).toBe(1);
});

test('карьера: доступен только следующий и побеждённые, попытка засчитывается один раз при старте',()=>{
  const {saves}=setup();
  expect(saves.beginCareer('maria')).toBeNull();expect(saves.beginCareer('missing')).toBeNull();
  const run=saves.beginCareer('kim')!;
  expect(saves.beginCareer('kim')).toEqual(run);
  expect(saves.career.records.kim.attempts).toBe(1);
  expect(saves.beginCareer('kwon')).toBeNull();
  expect(saves.finishCareer(run.id)).toBeNull();
  settleCareerRound(saves,'player');
  expect(saves.finishCareer(run.id)).toBeNull();
  expect(careerAvailable(saves.career,'kwon')).toBe(false);
  settleCareerRound(saves,'player'); saves.finishCareer(run.id);
  expect(careerAvailable(saves.career,'kwon')).toBe(true);
  expect(careerAvailable(saves.career,'yeo')).toBe(false);
});

test('карьера: поражение только после двух раундов, ничья продолжает матч, прошлые победы остаются',()=>{
  const {saves}=setup();win(saves,'kim');
  const run=saves.beginCareer('kwon')!;
  settleCareerRound(saves,'enemy');
  expect(saves.finishCareer(run.id)).toBeNull();
  settleCareerRound(saves,'enemy');
  expect(saves.finishCareer(run.id)).toMatchObject({outcome:'enemy',reason:'knockout',newVictory:false,newClass:1});
  expect(saves.career.victories).toEqual(['kim']);expect(saves.career.records.kwon.losses).toBe(1);
  const retry=saves.beginCareer('kwon')!;
  expect(retry.id).not.toBe(run.id);expect(retry.hp).toBe(retry.playerMaxHP);
  const draw=settleCareerRound(saves,'draw');
  expect(draw).toMatchObject({outcome:'draw',reason:'draw',matchOver:false,playerRounds:0,enemyRounds:0,drawnRounds:1});
  expect(saves.finishCareer(retry.id)).toBeNull();
  expect(saves.career.records.kwon).toEqual({attempts:2,wins:0,losses:1,draws:0});
  expect(saves.beginCareer('kwon')!.id).toBe(retry.id);
});

test('карьера: все12 побед открывают классы строго после четвёртого боя и завершают карьеру',()=>{
  const {saves,memory}=setup();const damage=saves.stats.damage;
  for(const opponent of CAREER_ROSTER){
    const result=win(saves,opponent.id);
    expect(result.newVictory).toBe(true);
    expect(saves.current!.currentClass).toBe(opponent.order<3 ? 1 : opponent.order<7 ? 2 : 3);
    expect(saves.stats.damage).toBe(damage);expect(saves.endless.totalWins).toBe(0);
    expect(isSessionSave(saves.current)).toBe(true);
  }
  expect(careerComplete(saves.career)).toBe(true);expect(saves.career.lastResult!.completed).toBe(true);
  expect(careerClass(saves.career)).toBe(3);
  expect(new SaveService(new StorageService(memory)).career).toEqual(saves.career);
});

test('карьера: повтор победы не дублирует разблокировку и результат нельзя начислить дважды',()=>{
  const {saves}=setup();win(saves,'kim');
  const run=saves.beginCareer('kim')!;
  expect(win(saves,'kim')).toMatchObject({newVictory:false,outcome:'player'});
  expect(saves.finishCareer(run.id)).toBeNull();expect(saves.career.victories).toEqual(['kim']);
  expect(saves.career.records.kim).toEqual({attempts:2,wins:2,losses:0,draws:0});
});

test('карьера: сохранённые HP, выносливость, позиции и90сек таймер переживают перезагрузку',()=>{
  const {saves,memory}=setup();const run=saves.beginCareer('kim')!;
  saves.checkpointCareer(run.id,{...run,hp:62,stamina:44.3,enemyHP:31,enemyStamina:27.1,playerX:600,enemyX:750,elapsedMs:23000});
  const restored=new SaveService(new StorageService(memory));
  expect(restored.activeCareer).toMatchObject({id:run.id,hp:62,stamina:44.3,enemyHP:31,enemyStamina:27.1,playerX:600,enemyX:750,elapsedMs:23000});
  expect(restored.beginCareer('kim')!.id).toBe(run.id);expect(restored.career.records.kim.attempts).toBe(1);
  restored.checkpointCareer(run.id,{...restored.activeCareer!,elapsedMs:COMBAT.roundDurationMs});
  restored.resolveCareerRound(run.id,1);
  expect(restored.finishCareer(run.id)).toBeNull();
  const second=restored.activeCareer!;
  restored.checkpointCareer(run.id,{...second,hp:90,enemyHP:10,elapsedMs:COMBAT.roundDurationMs},2);
  restored.resolveCareerRound(run.id,2);
  expect(restored.finishCareer(run.id)).toMatchObject({outcome:'player',reason:'timeout',playerRounds:2,enemyRounds:0});
});

test('карьера: снимок характеристик защищает текущий бой от изменения прокачки на паузе',()=>{
  const {saves}=setup();const run=saves.beginCareer('kim')!;
  const bench=saves.beginBenchSession()!;
  for(let rep=1;rep<=20;rep++) saves.completeBenchRep(bench,rep);
  expect(saves.stats.maxHP).toBeGreaterThan(run.playerMaxHP);
  expect(saves.activeCareer!.playerMaxHP).toBe(run.playerMaxHP);
  expect(saves.checkpointCareer(run.id,{...run,hp:run.playerMaxHP+1})).toBe(false);
});

test('карьера: неверные checkpoints и повреждённые схемы отвергаются, таймер не откатывается',()=>{
  const {saves}=setup();const run=saves.beginCareer('kim')!;
  for(const patch of [{hp:NaN},{enemyHP:Infinity},{stamina:-1},{elapsedMs:90001},{playerX:0},{enemyStamina:999}])
    expect(saves.checkpointCareer(run.id,{...run,...patch})).toBe(false);
  expect(saves.checkpointCareer('wrong',{...run})).toBe(false);
  saves.checkpointCareer(run.id,{...run,elapsedMs:12345});
  saves.checkpointCareer(run.id,{...run,elapsedMs:0});expect(saves.activeCareer!.elapsedMs).toBe(12345);
  expect(isCareerRun({...run,opponentId:'wrong'})).toBe(false);
  expect(isCareerProgress({victories:['maria'],records:{maria:{attempts:1,wins:1,losses:0,draws:0}}})).toBe(false);
  expect(isSessionSave({...saves.current,activeCareer:{...run,opponentId:'maria'}})).toBe(false);
  const result=win(saves,'kim');
  expect(isCareerProgress({...saves.career,lastResult:{...result,newClass:'1'}})).toBe(false);
  expect(isCareerProgress({...saves.career,lastResult:{...result,outcome:'draw'}})).toBe(false);
});

for(const id of ['kim','shim','young','maria']) for(const side of ['player','enemy'] as const) {
  test(`матч ${id}: ${side} должен выиграть ровно ${careerWinsNeeded(id)} раунда`,()=>{
    const {saves}=setup();
    for(const previous of CAREER_ROSTER.slice(0,careerOpponent(id)!.order)) win(saves,previous.id);
    const before=saves.career.victories.length,run=saves.beginCareer(id)!,target=careerWinsNeeded(id);
    const damage=saves.stats.damage;
    for(let i=1;i<=target;i++) {
      const result=settleCareerRound(saves,side);
      expect(result.matchOver).toBe(i===target);
      expect(side==='player'?result.playerRounds:result.enemyRounds).toBe(i);
      if(i<target) {
        expect(saves.finishCareer(run.id)).toBeNull();
        expect(saves.career.victories.length).toBe(before);
        expect(saves.activeCareer).toMatchObject({hp:run.playerMaxHP,stamina:run.playerMaxStamina,
          enemyHP:careerOpponent(id)!.maxHP,enemyStamina:careerOpponent(id)!.stamina,elapsedMs:0,
          playerX:COMBAT.playerStart,enemyX:COMBAT.enemyStart});
        expect(saves.career.records[id]).toEqual({attempts:1,wins:0,losses:0,draws:0});
      }
    }
    expect(saves.finishCareer(run.id)).toMatchObject({outcome:side,[side==='player'?'playerRounds':'enemyRounds']:target});
    expect(saves.career.victories.length).toBe(before+Number(side==='player' && before===careerOpponent(id)!.order));
    expect(saves.finishCareer(run.id)).toBeNull(); expect(saves.stats.damage).toBe(damage);
  });
}

test('смешанный счёт и ничьи сохраняются; повторный resolve и старый checkpoint не засчитывают раунд дважды',()=>{
  const {saves,memory}=setup(); const run=saves.beginCareer('kim')!;
  settleCareerRound(saves,'player');
  expect(saves.resolveCareerRound(run.id,1)).toBeNull();
  expect(saves.checkpointCareer(run.id,{...run,enemyHP:0},1)).toBe(false);
  settleCareerRound(saves,'draw'); settleCareerRound(saves,'enemy');
  const restored=new SaveService(new StorageService(memory));
  expect(careerScore(restored.activeCareer!)).toEqual({playerRounds:1,enemyRounds:1,drawnRounds:1});
  expect(careerRoundNumber(restored.activeCareer!)).toBe(4);
  settleCareerRound(restored,'player');
  expect(restored.finishCareer(run.id)).toMatchObject({outcome:'player',playerRounds:2,enemyRounds:1,drawnRounds:1});
  expect(restored.career.records.kim).toEqual({attempts:1,wins:1,losses:0,draws:0});
});

test('перезагрузка на границе и после решающего раунда не теряет счёт и не создаёт лишний раунд',()=>{
  const {saves,memory}=setup(); const run=saves.beginCareer('kim')!;
  saves.checkpointCareer(run.id,{...run,enemyHP:0});
  const beforeResolve=new SaveService(new StorageService(memory));
  beforeResolve.resolveCareerRound(run.id,1);
  const afterResolve=new SaveService(new StorageService(memory));
  expect(afterResolve.activeCareer).toMatchObject({playerRounds:1,enemyRounds:0,hp:100,elapsedMs:0});
  settleCareerRound(afterResolve,'player');
  const afterFinal=new SaveService(new StorageService(memory));
  expect(afterFinal.loadIssue).toBeNull(); expect(afterFinal.resolveCareerRound(run.id,2)).toBeNull();
  expect(afterFinal.finishCareer(run.id)).toMatchObject({outcome:'player',playerRounds:2});
  expect(new SaveService(new StorageService(memory)).career.records.kim.wins).toBe(1);
});

test('старые победы остаются; старый незавершённый матч получает счёт 0:0 без лечения и сброса времени',()=>{
  const {saves,memory}=setup(); win(saves,'kim'); const run=saves.beginCareer('kwon')!;
  saves.checkpointCareer(run.id,{...run,hp:40,enemyHP:50,elapsedMs:20000});
  const legacy=saves.current!;
  delete legacy.activeCareer!.playerRounds;delete legacy.activeCareer!.enemyRounds;delete legacy.activeCareer!.drawnRounds;
  delete legacy.career!.lastResult!.playerRounds;delete legacy.career!.lastResult!.enemyRounds;delete legacy.career!.lastResult!.drawnRounds;
  memory.setItem(GAME.storage.session,JSON.stringify(legacy));
  const restored=new SaveService(new StorageService(memory));
  expect(restored.loadIssue).toBeNull();expect(restored.career.victories).toEqual(['kim']);
  expect(restored.activeCareer).toMatchObject({hp:40,enemyHP:50,elapsedMs:20000,playerRounds:0,enemyRounds:0,drawnRounds:0});
  for(const score of [{playerRounds:2,enemyRounds:2,drawnRounds:0},{playerRounds:1,enemyRounds:undefined},{playerRounds:-1,enemyRounds:0,drawnRounds:0}])
    expect(isCareerRun({...run,...score})).toBe(false);
});

test('карьера: наружные копии не меняют состояние; endless и карьерный бой независимы',()=>{
  const {saves}=setup();const endless=saves.beginEndless()!;win(saves,'kim');
  const snapshot=saves.career;snapshot.victories.push('maria');snapshot.records.kim.wins=999;
  expect(saves.career.victories).toEqual(['kim']);expect(saves.career.records.kim.wins).toBe(1);
  expect(saves.activeRun!.id).toBe(endless.id);expect(saves.activeRun!.hp).toBe(endless.hp);
  const run=saves.beginCareer('kwon')!;Object.assign(run,{hp:0});
  expect(saves.activeCareer!.hp).toBe(saves.activeCareer!.playerMaxHP);
});

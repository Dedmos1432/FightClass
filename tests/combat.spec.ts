import { test, expect, type Page } from '@playwright/test';
import { GAME } from '../src/config/game';
import { COMBAT } from '../src/config/combat';
import { opponentAt, type EnemySkin } from '../src/combat/Opponents';
import type { ActiveRun } from '../src/combat/EndlessProgress';
import { MOVES } from '../src/combat/moves';
import { walkTo } from './helpers/walkTo';

const arena=(page:Page)=>page.locator('#combat-focus');
const room=(page:Page,name:string)=>expect(page.locator('#ui')).toHaveAttribute('data-screen',name);
async function seed(page:Page, run?:Partial<ActiveRun>, style='boxing'):Promise<void> {
  const runId=run?.id??'run-test';
  const enemy=opponentAt(run?.wins??0,runId,run?.roundStartedMs);
  const session={version:1,id:'combat-test',createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',location:'lobby',currentClass:1,
    player:{x:1468,facing:'right',style},stats:{maxHP:100,currentHP:100,stamina:100,currentStamina:100,damage:10},
    ...(run?{activeRun:{id:runId,wins:0,hp:100,stamina:100,enemyHP:enemy.maxHP,enemyStamina:enemy.stamina,playerX:COMBAT.playerStart,enemyX:COMBAT.enemyStart,...run}}:{})};
  await page.addInitScript(({key,session})=>{ if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(session)); },{key:GAME.storage.session,session});
  await page.goto('/');await page.locator('#continue-game').click();await room(page,'lobby');
}
async function enterDojo(page:Page):Promise<void> {
  await room(page,'lobby');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await expect(page.locator('#interact-object')).toBeVisible();
  await page.keyboard.press('e');await room(page,'dojo');await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
}
async function center(page:Page):Promise<void> {
  await walkTo(page,COMBAT.centerX);
  await expect(page.locator('#interact-object')).toContainText(/серию боёв/);
}
async function startFight(page:Page):Promise<void> {
  await enterDojo(page);await center(page);await page.keyboard.press('e');await room(page,'fight');
  await expect(arena(page)).toHaveAttribute('data-phase','fighting',{timeout:25000});
}
const save=async(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);

function runWithSkins(first:EnemySkin,next:EnemySkin):string {
  for(let i=0;i<10_000;i++) {
    const id=`expanded-endless-${i}`;
    if(opponentAt(0,id).skin===first && opponentAt(1,id).skin===next) return id;
  }
  throw new Error(`No test run for ${first} -> ${next}`);
}
async function seedSkinWave(page:Page,first:EnemySkin,next:EnemySkin):Promise<void> {
  const id=runWithSkins(first,next),enemy=opponentAt(0,id);
  await seed(page,{id,hp:37,enemyHP:enemy.maxHP*.1,elapsedMs:88_000,roundStartedMs:0,
    playerX:COMBAT.minX,enemyX:COMBAT.maxX});
}

for(const [skin,next] of [['bang','jang'],['jang','cha'],['cha','bang']] as const) {
  test(`бесконечный режим: модель ${skin}, следующая ${next}, подгрузка и перенос HP`,async({page})=>{
    const errors:string[]=[],pages=new Set<string>();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{
      const pageName=new URL(response.url()).pathname.match(/\/combat\/([^/]+)\.png$/)?.[1];
      if(pageName) { expect(response.ok(),pageName).toBe(true); pages.add(pageName); }
    });
    let release=()=>{};
    const gate=new Promise<void>(resolve=>{release=resolve;});
    // Exercise a slow connection as well as the ordinary between-round preload.
    if(skin==='jang') await page.route(`**/combat/${next}-*`,async route=>{await gate;await route.continue();});
    try {
      await seedSkinWave(page,skin,next); await startFight(page);
      await expect(arena(page)).toHaveAttribute('data-enemy-skin',skin);
      const id=runWithSkins(skin,next);
      await expect(page.locator('#enemy-name')).toHaveText(opponentAt(0,id).name);
      if(skin==='jang') {
        await expect(page.locator('#fight-announcement')).toHaveText('ПОДГОТОВКА СЛЕДУЮЩЕГО СОПЕРНИКА');
        await expect(arena(page)).toHaveAttribute('data-phase','intermission');
        await expect(arena(page)).toHaveAttribute('data-player-hp','37');
        await page.keyboard.press('Escape'); await expect(page.locator('#pause-exit')).toBeVisible();
        release();
        await page.locator('.combat-pause .dialog-done[data-close]').click();
      }
      await expect(arena(page)).toHaveAttribute('data-enemy-skin',next);
      await page.keyboard.press('Escape');
      await expect(arena(page)).toHaveAttribute('data-player-hp','37');
      await expect(arena(page)).toHaveAttribute('data-wins','1');
      const snapshot=await save(page);
      expect(snapshot.activeRun).toMatchObject({id,wins:1,hp:37,enemyHP:opponentAt(1,id,90_000).maxHP});
      expect(snapshot.stats.damage).toBe(10);
      expect([...pages].every(name=>name.startsWith('player-') || name.startsWith(`${skin}-`) || name.startsWith(`${next}-`))).toBe(true);
      expect([...pages].some(name=>name.startsWith(`${skin}-`))).toBe(true);
      expect([...pages].some(name=>name.startsWith(`${next}-`))).toBe(true);
      await page.screenshot({path:`.cache/endless-roster/${skin}-to-${next}.png`});
      expect(errors).toEqual([]);
    } finally { release(); }
  });
}

test('ошибка подгрузки следующей модели: повторная загрузка продолжает сохранённую волну без потери HP',async({page})=>{
  let fail=true;
  await page.route('**/combat/jang-*',route=>fail?route.abort('failed'):route.continue());
  await seedSkinWave(page,'bang','jang'); await startFight(page);
  await room(page,'load-error'); await expect(page.locator('#retry-combat')).toBeVisible();
  expect((await save(page)).activeRun).toMatchObject({wins:1,hp:37});
  fail=false; await page.locator('#retry-combat').click();
  await page.locator('#continue-game').click(); await startFight(page);
  await expect(arena(page)).toHaveAttribute('data-enemy-skin','jang');
  await expect(arena(page)).toHaveAttribute('data-wins','1');
  await expect(arena(page)).toHaveAttribute('data-player-hp','37');
});

test('только E в центре запускает бой; движение, атаки, блок, уклонение, пауза и продолжение',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page);await enterDojo(page);
  await page.keyboard.press('e');await room(page,'dojo');expect((await save(page)).activeRun).toBeUndefined();
  await center(page);await page.screenshot({path:'test-results/dojo-start-stage-4.png'});
  await page.keyboard.press('e');await room(page,'fight');await expect(arena(page)).toHaveAttribute('data-phase','fighting',{timeout:25000});
  const skin=await arena(page).getAttribute('data-enemy-skin');
  await expect(arena(page)).toHaveAttribute('data-enemy-can-dodge',String(skin!=='kim'));
  await expect(page.locator('#fight-round-label')).not.toContainText('/ 15');
  await page.keyboard.down('Space');await expect(arena(page)).toHaveAttribute('data-player-action','block');await page.keyboard.up('Space');
  await page.keyboard.press('Shift');await expect(arena(page)).toHaveAttribute('data-player-action','dodge');
  await page.waitForTimeout(500);await page.keyboard.press('q');await expect(arena(page)).toHaveAttribute('data-player-action','attack');
  await page.screenshot({path:'test-results/fight-stage-4.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
  const before=await arena(page).getAttribute('data-player-hp'), timeBefore=await arena(page).getAttribute('data-round-ms');await page.waitForTimeout(500);
  expect(await arena(page).getAttribute('data-player-hp')).toBe(before);
  expect(await arena(page).getAttribute('data-round-ms')).toBe(timeBefore);
  await page.getByRole('button',{name:'Сохранить и выйти в лобби'}).click();await room(page,'lobby');
  const id=(await save(page)).activeRun.id;
  await page.reload();await page.locator('#continue-game').click();await startFight(page);
  expect((await save(page)).activeRun.id).toBe(id);expect(errors).toEqual([]);
});

test('таймер, одно усиление +10%, уведомление, пауза и перезагрузка не обнуляют время и бонус',async({page})=>{
  const enemy=opponentAt(0,'run-test'), baseDamage=enemy.damage;
  await seed(page,{elapsedMs:14_000,roundStartedMs:0,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
  await startFight(page);
  await expect(arena(page)).toHaveAttribute('data-enemy-boosted','false');
  await expect(arena(page)).toHaveAttribute('data-enemy-damage',String(baseDamage));
  await page.keyboard.down('Space');
  await expect(page.locator('#fight-announcement')).toHaveText('ПРОТИВНИК СТАЛ СИЛЬНЕЕ');
  await expect(arena(page)).toHaveAttribute('data-enemy-damage',String(Math.round(baseDamage*1.1*100)/100));
  await expect(page.locator('#fight-pressure')).toContainText('УРОН +10% ДО КОНЦА БОЯ');
  await page.screenshot({path:'test-results/fight-timer-boost.png'});
  await expect(page.locator('#fight-announcement')).toBeEmpty();
  await page.keyboard.up('Space');await page.keyboard.press('Escape');
  const remaining=await arena(page).getAttribute('data-remaining-ms');
  await page.waitForTimeout(400);expect(await arena(page).getAttribute('data-remaining-ms')).toBe(remaining);
  await page.getByRole('button',{name:'Сохранить и выйти в лобби'}).click();await room(page,'lobby');
  const saved=await save(page), roundMs=saved.activeRun.elapsedMs-saved.activeRun.roundStartedMs;
  expect(roundMs).toBeGreaterThan(15_000);
  await page.reload();await page.locator('#continue-game').click();
  await enterDojo(page);await center(page);await page.keyboard.press('e');await room(page,'fight');
  await expect(arena(page)).toHaveAttribute('data-phase','countdown');
  await expect(arena(page)).toHaveAttribute('data-round-ms',String(roundMs));
  await expect(arena(page)).toHaveAttribute('data-enemy-boosted','true');
  await expect(arena(page)).toHaveAttribute('data-enemy-damage',String(Math.round(baseDamage*1.1*100)/100));
  await expect(arena(page)).toHaveAttribute('data-phase','fighting');await page.keyboard.down('Space');
  await expect.poll(async()=>Number(await arena(page).getAttribute('data-round-ms')),{timeout:20000}).toBeGreaterThan(30_100);
  await page.keyboard.up('Space');
  await expect(page.locator('#fight-announcement')).toBeEmpty();
  await expect(arena(page)).toHaveAttribute('data-enemy-damage',String(Math.round(baseDamage*1.1*100)/100));
});

for(const outcome of ['player','enemy','draw'] as const) {
  test(`90 секунд: ${outcome} — решение по проценту HP без фиктивного нокаута`,async({page})=>{
    const enemy=opponentAt(2,'run-test');
    const hp=outcome==='player'?80:50;
    await seed(page,{wins:2,hp,enemyHP:enemy.maxHP*(outcome==='player'?.2:outcome==='enemy'?.6:.5),
      elapsedMs:89_500,roundStartedMs:0,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
    await startFight(page);await expect(page.locator('#fight-timer')).toHaveText('00:01');
    if(outcome==='player') {
      await expect(page.locator('#fight-announcement')).toHaveText('ВРЕМЯ · ПОБЕДА ПО HP');
      await expect(arena(page)).toHaveAttribute('data-wins','3');
      await expect(arena(page)).toHaveAttribute('data-phase','countdown');
      await expect(page.locator('#fight-timer')).toHaveText('01:30');
      await expect(arena(page)).toHaveAttribute('data-enemy-boosted','false');
      const saved=await save(page);expect(saved.activeRun.hp).toBe(hp);expect(saved.activeRun.roundStartedMs).toBe(90_000);
      expect(saved.stats.damage).toBe(10);expect(saved.activeRun.wins).toBe(3);
    } else {
      await expect(page.locator('#result-return')).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText(outcome==='draw'?'ничья':'больше HP в процентах');
      await expect(page.locator('#fight-timer')).toHaveText('00:00');
      const saved=await save(page);expect(saved.activeRun).toBeUndefined();expect(saved.stats.currentHP).toBe(hp);
      expect(saved.endless).toMatchObject({totalWins:2,runs:1,lastWins:2});expect(saved.stats.damage).toBe(14);
      await page.screenshot({path:`test-results/fight-timeout-${outcome}.png`});
      await page.locator('#result-return').click();await room(page,'lobby');
      await page.reload();await page.locator('#continue-game').click();
      expect((await save(page)).endless.runs).toBe(1);expect((await save(page)).stats.damage).toBe(14);
    }
  });
}

test('победа заменяет бота, не лечит игрока и не выдаёт награду до поражения',async({page})=>{
  await seed(page,{hp:37,enemyHP:1,playerX:800,enemyX:1010});
  await startFight(page);
  for(let i=0;i<16;i++){
    if(Number(await arena(page).getAttribute('data-wins'))>0) break;
    await page.keyboard.press(['q','w','e'][i%3]);await page.waitForTimeout(190);
  }
  await expect(arena(page)).toHaveAttribute('data-wins','1');
  const hpAfter=Number(await arena(page).getAttribute('data-player-hp'));expect(hpAfter).toBeGreaterThan(0);expect(hpAfter).toBeLessThanOrEqual(37);
  const snapshot=await save(page);expect(snapshot.stats.damage).toBe(10);expect(snapshot.activeRun.hp).toBe(hpAfter);
  await expect(arena(page)).toHaveAttribute('data-phase','countdown',{timeout:8000});
  const next=opponentAt(1,snapshot.activeRun.id,snapshot.activeRun.roundStartedMs);
  await expect(arena(page)).toHaveAttribute('data-enemy-variant',next.id);
  expect(Number(await arena(page).getAttribute('data-player-hp'))).toBe(hpAfter);
  expect((await save(page)).activeRun.enemyHP).toBe(next.maxHP);
  await page.screenshot({path:'test-results/fight-next-opponent.png'});
});

test('поражение начисляет постоянный урон один раз, возвращение и перезагрузка сохраняют результат',async({page})=>{
  await seed(page,{wins:2,hp:1,playerX:800,enemyX:1000});await startFight(page);
  await expect(page.locator('#result-return')).toBeVisible({timeout:25000});
  expect((await save(page)).activeRun).toBeUndefined();
  expect((await save(page)).endless).toMatchObject({totalWins:2,bestStreak:2,runs:1,lastWins:2});
  expect((await save(page)).stats.damage).toBe(14);
  await page.screenshot({path:'test-results/fight-result-stage-4.png'});
  await page.locator('#result-return').click();await room(page,'lobby');
  await expect(page.locator('#damage-value')).toHaveText('14');
  await page.reload();await page.locator('#continue-game').click();
  expect((await save(page)).endless.totalWins).toBe(2);await expect(page.locator('#damage-value')).toHaveText('14');
});

test('конструктор сохраняет три выбранных приёма, меняет дубликаты местами и использует их в бою',async({page})=>{
  await seed(page);
  const before=await page.locator('.stat-meter, .damage-stat').allTextContents();
  await page.locator('#choose-style').click();await page.locator('input[value="freestyle"]').check();
  await expect(page.locator('#custom-slot-0 option')).toHaveCount(12);
  await page.locator('#custom-slot-0').selectOption('spinning-back-kick');
  await page.locator('#custom-slot-1').selectOption('hook');await page.locator('#custom-slot-2').selectOption('axe-kick');
  expect(await page.locator('.stat-meter, .damage-stat').allTextContents()).toEqual(before);
  await page.locator('#custom-slot-1').selectOption('spinning-back-kick');
  expect((await save(page)).freestyle).toEqual(['hook','spinning-back-kick','axe-kick']);
  await page.screenshot({path:'test-results/freestyle-stage-4.png'});
  await page.getByRole('button',{name:'Готово'}).click();await startFight(page);
  await expect(page.locator('.attack-legend')).toContainText('Hook');
  await expect(page.locator('.attack-legend')).toContainText('Spinning Back Kick');
  await expect(page.locator('.attack-legend')).toContainText('Axe Kick');
  expect(MOVES).toHaveLength(12);
});


test('проход за спину включает левые и правые анимации и не застревает на противнике',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await seed(page,{hp:100,enemyHP:55,playerX:800,enemyX:950});await startFight(page);
  await page.keyboard.down('d');
  try { await expect.poll(async()=>Number(await arena(page).getAttribute('data-player-x'))-Number(await arena(page).getAttribute('data-enemy-x')),{intervals:[25],timeout:7000}).toBeGreaterThan(80); }
  finally { await page.keyboard.up('d'); }
  await expect(arena(page)).toHaveAttribute('data-player-facing','-1');
  await page.screenshot({path:'test-results/fight-behind-enemy.png'});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Сохранить и выйти в лобби'}).click();
  await page.reload();await page.locator('#continue-game').click();
  await enterDojo(page);await center(page);await page.keyboard.press('e');await room(page,'fight');
  await expect(arena(page)).toHaveAttribute('data-phase','countdown');
  await expect(arena(page)).toHaveAttribute('data-player-facing','-1');
  await expect(arena(page)).toHaveAttribute('data-phase','fighting');
  await page.keyboard.down('a');
  try { await expect.poll(async()=>Number(await arena(page).getAttribute('data-player-x'))-Number(await arena(page).getAttribute('data-enemy-x')),{intervals:[25],timeout:7000}).toBeLessThan(-80); }
  finally { await page.keyboard.up('a'); }
  await expect(arena(page)).toHaveAttribute('data-player-facing','1');expect(errors).toEqual([]);
});

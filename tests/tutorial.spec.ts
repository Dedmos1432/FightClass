import { test, expect, type Page } from '@playwright/test';
import { GAME } from '../src/config/game';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { TUTORIAL_STEPS, type PracticeStep } from '../src/tutorial/Progress';
import { CLUB_GUIDE_STEPS, type ClubGuideStep } from '../src/tutorial/ClubGuide';
import { walkTo } from './helpers/walkTo';
import { BENCH } from '../src/config/training';
import { COMBAT } from '../src/config/combat';

const arena=(page:Page)=>page.locator('#tutorial-focus');
const step=(page:Page,value:PracticeStep)=>expect(arena(page)).toHaveAttribute('data-step',value);
const card=(page:Page)=>page.locator('#tutorial-card');
const cue=(page:Page,id:string)=>expect(card(page)).toHaveAttribute('data-cue',id);
const frozen=(page:Page)=>expect(arena(page)).toHaveAttribute('data-time-scale','0');
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
async function seeded(page:Page,current:PracticeStep):Promise<void> {
  const saves=new SaveService(new StorageService(null));saves.startNew();
  for(const next of TUTORIAL_STEPS) {if(next===current)break;saves.advanceTutorial(next);}
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();await step(page,current);
}
async function walk(page:Page,key:string,direction:'left'|'right',check:number):Promise<void> {
  await cue(page,`move-${direction}`);
  await page.keyboard.down(key);
  try{await expect(page.locator(`[data-check="${check}"]`)).toHaveAttribute('data-done','true');}
  finally{await page.keyboard.up(key);}
}

test('новая игра: визуальное обучение останавливает спарринг и проверяет движение, атаки и защиту',async({page})=>{
  test.setTimeout(120_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#start-game').click();await step(page,'movement');
  await cue(page,'move-left');await expect(card(page).locator('kbd')).toHaveText(['A','←']);await frozen(page);
  const startX=await arena(page).getAttribute('data-player-x');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(160);await page.keyboard.up('ArrowRight');
  await frozen(page);expect(await arena(page).getAttribute('data-player-x')).toBe(startX);
  await walk(page,'a','left',0);await walk(page,'d','right',1);await step(page,'attacks');
  await cue(page,'strike-1');
  for(const key of ['j','k','l'])await page.keyboard.press(key);
  await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  await expect(page.locator('[data-check][data-done="true"]')).toHaveCount(0);
  await page.screenshot({path:'.cache/tutorial/attacks-desktop.png'});
  for(const [index,key] of ['q','w','e'].entries()) {
    await cue(page,`strike-${index+1}`);
    await page.keyboard.press(key);await expect(page.locator(`[data-check="${index}"]`)).toHaveAttribute('data-done','true');
  }
  await step(page,'combo');await cue(page,'combo-start');await page.keyboard.press('q');
  await cue(page,'combo-follow');await frozen(page);
  await page.keyboard.press('q');await frozen(page);await cue(page,'combo-follow');
  await page.keyboard.press('w');
  await step(page,'block');await cue(page,'guard');await frozen(page);
  const slowing=page.waitForFunction(()=>{
    const state=document.querySelector<HTMLElement>('#tutorial-focus')!.dataset;
    const scale=Number(state.timeScale);
    return state.step==='dodge'&&scale>0&&scale<1;
  });
  await page.keyboard.down('Space');
  try{await step(page,'dodge');}finally{await page.keyboard.up('Space');}
  await slowing;
  await cue(page,'evade');await frozen(page);
  const windup=await arena(page).getAttribute('data-enemy-ms');
  await page.waitForTimeout(180);expect(await arena(page).getAttribute('data-enemy-ms')).toBe(windup);
  await expect(arena(page)).toHaveAttribute('data-enemy-action','attack');
  await page.keyboard.down('Shift');
  try {
    await expect(arena(page)).toHaveAttribute('data-player-action','idle');
    await page.keyboard.press('ArrowLeft');
  } finally { await page.keyboard.up('Shift'); }
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  await cue(page,'advance');await expect(card(page).locator('kbd').first()).toHaveText(/shift/i);
  await page.keyboard.down('d');
  try { await page.keyboard.press('Shift'); } finally { await page.keyboard.up('d'); }
  await expect(page.locator('[data-check="1"]')).toHaveAttribute('data-done','true');
  await step(page,'stamina');
  for(let i=0;i<8;i++){
    if(await page.locator('[data-check="0"]').getAttribute('data-done')==='true')break;
    await cue(page,'spend');
    await page.keyboard.press('e');await expect(arena(page)).toHaveAttribute('data-player-action','attack');
    await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  }
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await cue(page,'recover');await step(page,'club');await cue(page,'finish');
  await page.locator('#tutorial-finish').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  const value=await saved(page);expect(value.tutorial).toBe('complete');
  expect(value.stats).toMatchObject({maxHP:100,currentHP:100,stamina:100,damage:10});
  expect(value.training.totalReps).toBe(0);expect(value.career.victories).toEqual([]);expect(value.endless.totalWins).toBe(0);
  expect(value.activeRun).toBeUndefined();expect(value.activeCareer).toBeUndefined();expect(errors).toEqual([]);
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','style');
  await page.locator('#choose-style').click();await expect(page.locator('#style-guide')).toBeVisible();
  await page.locator('input[name="style"][value="mma"]').check();await page.locator('#styles-done').click();
  await expect(page.locator('#current-style')).toHaveText('ММА');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
  await page.screenshot({path:'.cache/club-guide/lobby.png'});
  await walkTo(page,457);await page.keyboard.press('e');await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','bench');
  await walkTo(page,BENCH.x);await page.keyboard.press('e');await page.locator('#bench-tutorial-start').click();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase','pressing');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','press');
  for(let i=0;i<16 && (await saved(page)).training.totalReps<1;i++){await page.keyboard.press('e');await page.waitForTimeout(150);}
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-exit');
  await expect(page.locator('#hp-value')).toHaveText('102');await expect(page.locator('#damage-value')).toHaveText('10');
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:/Подход завершён/})).toBeVisible();
  await page.getByRole('button',{name:/Вернуться к тренировкам/}).click();await page.keyboard.press('Escape');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','career-board');
  await walkTo(page,965);await page.keyboard.press('e');
  await expect(page.locator('#career-guide')).toBeVisible();
  expect((await saved(page)).clubGuide.step).toBe('career-review');
  await page.locator('[data-opponent="shim"]').click();await expect(page.locator('#career-start')).toBeDisabled();
  await expect(page.locator('#opponent-profile')).toContainText('ДО 3 ПОБЕД');
  await page.locator('[data-opponent="kim"]').click();await expect(page.locator('#career-start')).toBeEnabled();
  await expect(page.locator('#opponent-profile')).toContainText('ДО 2 ПОБЕД');
  await page.screenshot({path:'.cache/club-guide/career.png'});
  await page.locator('#career-guide-done').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-door');
  await walkTo(page,1468);await page.keyboard.press('e');await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-start');
  await expect(page.locator('#club-guide')).toContainText('без восстановления HP');
  await expect(page.locator('#club-guide')).toContainText('награда к урону');
  await page.screenshot({path:'.cache/club-guide/dojo.png'});
  await walkTo(page,COMBAT.centerX);await page.keyboard.press('e');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  expect((await saved(page)).clubGuide.step).toBe('complete');
  expect((await saved(page)).stats.damage).toBe(10);expect((await saved(page)).activeRun).toBeDefined();
  await page.keyboard.press('Escape');await page.locator('#pause-exit').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');await expect(page.locator('#club-guide')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('сенсорный урок уклонения',()=>{
  test.use({hasTouch:true,viewport:{width:844,height:390}});
  test('стрелка и кнопка уклонения выполняют оба задания разными пальцами',async({page,context})=>{
    await seeded(page,'dodge');
    const point=async(code:string,id:number)=>{
      const box=(await page.locator(`[data-touch="${code}"]`).boundingBox())!;
      return {x:box.x+box.width/2,y:box.y+box.height/2,id};
    };
    const cdp=await context.newCDPSession(page);
    const highlight=(code:string)=>page.locator(`[data-touch="${code}"][data-tutorial-highlight]`);
    await cue(page,'evade');await frozen(page);
    await expect(card(page).locator('kbd')).toHaveCount(0);
    await expect(highlight('ShiftLeft')).toBeVisible();await expect(highlight('KeyA')).toBeVisible();
    await expect(highlight('KeyD')).toHaveCount(0);
    const dodge=await point('ShiftLeft',1),back=await point('KeyA',2),forward=await point('KeyD',2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dodge]});
    try {
      await expect(arena(page)).toHaveAttribute('data-player-action','idle');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dodge,back]});
    } finally { await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
    await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
    await expect(arena(page)).toHaveAttribute('data-player-action','idle');
    await cue(page,'advance');await expect(highlight('KeyD')).toBeVisible();await expect(highlight('KeyA')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[forward]});
    try { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dodge,forward]}); }
    finally { await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
    await expect(page.locator('[data-check="1"]')).toHaveAttribute('data-done','true');
    await step(page,'stamina');
  });
});

async function guideSave(page:Page,current:ClubGuideStep):Promise<void> {
  const saves=new SaveService(new StorageService(null));saves.startNew();
  for(const step of TUTORIAL_STEPS.slice(0,-1))saves.advanceTutorial(step);
  for(const step of CLUB_GUIDE_STEPS){if(step===current)break;saves.advanceClubGuide(step);}
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step',current);
}

for(const device of [
  {name:'клавиатура',touch:false,width:1440,height:900},
  {name:'телефон вертикально',touch:true,width:320,height:568},
  {name:'телефон горизонтально',touch:true,width:844,height:390},
])test.describe(`порядок экскурсии: ${device.name}`,()=>{
  test.use({hasTouch:device.touch,viewport:{width:device.width,height:device.height}});
  test('E ведёт к стилю, неверные двери и карьера ждут своего шага, пропуск возвращает свободу',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const action=async()=>{if(device.touch)await page.locator('[data-touch="KeyE"]').tap();else await page.keyboard.press('e');};
    await guideSave(page,'style');const before=await saved(page);
    await expect(page.locator('#choose-style')).toBeFocused();
    await expect(page.locator('#interact-object')).toContainText('Выбрать боевой стиль');
    await action();await expect(page.locator('.styles-dialog')).toBeVisible();
    await expect(page.locator('.career-ranking')).toHaveCount(0);
    await page.getByRole('button',{name:'Закрыть выбор стиля',exact:true}).click();
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','style');
    await action();await page.locator('input[name="style"][value="mma"]').check();await page.locator('#styles-done').click();
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
    await expect(page.locator('#interact-object')).toBeHidden();
    await action();await expect(page.locator('.career-ranking')).toHaveCount(0);
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
    await walkTo(page,1468);await action();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
    await page.screenshot({path:`.cache/club-guide/order-${device.width}.png`});
    await walkTo(page,457);await action();await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','bench');
    if(device.touch)await page.locator('[data-touch="Escape"]').tap();else await page.keyboard.press('Escape');
    await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
    await expect(page.locator('#club-guide')).toHaveAttribute('data-step','bench');
    await walkTo(page,965);await action();await expect(page.locator('.career-ranking')).toHaveCount(0);
    await page.locator('#club-guide-skip').click();
    await expect(page.locator('#interact-object')).toContainText('Открыть доску');
    await action();await expect(page.locator('.career-ranking')).toBeVisible();
    const after=await saved(page);expect(after.clubGuide.step).toBe('complete');expect(after.player.style).toBe('mma');
    for(const field of ['id','stats','training','career','endless','activeRun','activeCareer'])expect(after[field]).toEqual(before[field]);
    expect(errors).toEqual([]);
  });
});

test('выбор стиля в обучении: закрытие и перезагрузка сохраняют урок, готово продолжает экскурсию',async({page})=>{
  await guideSave(page,'style');const before=await saved(page);
  await expect(page.locator('#club-guide')).toContainText('Техника');
  await expect(page.locator('#choose-style')).toHaveCSS('outline-style','solid');
  await page.locator('#choose-style').click();await expect(page.locator('#style-guide')).toBeVisible();
  await expect(page.locator('#club-guide')).toBeHidden();
  await page.locator('input[name="style"][value="freestyle"]').check();
  await page.locator('#custom-slot-0').selectOption('hook');
  await page.keyboard.press('Escape');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','style');
  await page.reload();await page.locator('#continue-game').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','style');
  await expect(page.locator('#current-style')).toHaveText('Свободный стиль');
  await page.locator('#choose-style').click();await expect(page.locator('#custom-slot-0')).toHaveValue('hook');
  await page.locator('#styles-done').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
  await expect(page.locator('#world-focus')).toBeFocused();
  await expect(page.locator('#choose-style')).toHaveCSS('outline-style','none');
  const after=await saved(page);
  for(const field of ['stats','training','career','endless','activeRun','activeCareer'])expect(after[field]).toEqual(before[field]);
  await page.locator('#choose-style').click();await expect(page.locator('#style-guide')).toHaveCount(0);
  await page.locator('#styles-done').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
});

for(const [width,height] of [[320,568],[844,390]])test(`обучение выбору стиля: кнопка и пояснения доступны ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await guideSave(page,'style');
  await expect(page.locator('#choose-style')).toBeInViewport();
  await page.screenshot({path:`.cache/club-guide/style-${width}.png`});
  await page.locator('#choose-style').click();await expect(page.locator('#style-guide')).toBeVisible();
  await page.locator('input[name="style"][value="muay-thai"]').check();
  await page.locator('#styles-done').scrollIntoViewIfNeeded();await expect(page.locator('#styles-done')).toBeInViewport();
  expect(await page.locator('.styles-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`.cache/club-guide/style-dialog-${width}.png`});
  await page.locator('#styles-done').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','gym-door');
  await expect(page.locator('#current-style')).toHaveText('Муай-тай');
});

test('карьерная экскурсия: закрытие и перезагрузка сохраняют урок, завершение не создаёт бой',async({page})=>{
  await guideSave(page,'career-board');const before=await saved(page);
  await page.keyboard.press('e');await expect(page.locator('#career-guide')).toBeVisible();
  await expect(page.locator('#club-guide')).toBeHidden();
  await expect(page.locator('#career-guide')).toContainText('в 2 раундах');
  await expect(page.locator('#career-guide')).toContainText('босса — в 3');
  await page.locator('[data-tier="3"]').click();await expect(page.locator('.opponent-row[data-boss="true"]')).toHaveCount(4);
  await expect(page.locator('#career-start')).toBeDisabled();
  await page.keyboard.press('Escape');await expect(page.locator('#club-guide')).toHaveAttribute('data-step','career-review');
  await expect(page.locator('#club-guide-number')).toContainText('7 ИЗ 9');
  await page.reload();await page.locator('#continue-game').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','career-review');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);await page.keyboard.press('e');
  await expect(page.locator('#career-guide')).toBeVisible();await page.locator('#career-guide-done').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-door');
  await expect(page.locator('#club-guide-number')).toContainText('8 ИЗ 9');
  const after=await saved(page);
  for(const field of ['stats','training','career','endless','activeRun','activeCareer'])expect(after[field]).toEqual(before[field]);
  await page.keyboard.press('e');await expect(page.locator('.career-ranking')).toHaveCount(0);
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-door');
});

test('карьерная экскурсия позволяет начать настоящий матч и продолжить маршрут после выхода',async({page})=>{
  await guideSave(page,'career-board');await page.keyboard.press('e');await page.locator('#career-start').click();
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  expect((await saved(page)).clubGuide.step).toBe('dojo-door');expect((await saved(page)).activeCareer.opponentId).toBe('kim');
  await page.keyboard.press('Escape');await page.locator('#pause-exit').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-door');
});

for(const [width,height] of [[320,568],[844,390]])test(`карьерная экскурсия: карточки и кнопка доступны ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await guideSave(page,'career-board');await page.keyboard.press('e');
  await expect(page.locator('#career-guide')).toBeVisible();
  await page.locator('#career-guide-done').scrollIntoViewIfNeeded();await expect(page.locator('#career-guide-done')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.career-ranking').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`.cache/club-guide/career-${width}.png`});
  await page.locator('[data-opponent="kim"]').click();await expect(page.locator('#career-start')).toBeEnabled();
  await page.locator('#career-guide-done').click();await expect(page.locator('#club-guide')).toHaveAttribute('data-step','dojo-door');
});

test('экскурсия сохраняется после отмены подхода и перезапуска, пропуск не выдаёт улучшений',async({page})=>{
  await guideSave(page,'press');await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await walkTo(page,BENCH.x);await page.keyboard.press('e');await page.locator('#bench-tutorial-start').click();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase','preparing');await page.keyboard.press('Escape');
  await expect(page.getByRole('heading',{name:/Подход завершён/})).toBeVisible();
  await page.reload();await page.locator('#continue-game').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step','press');
  expect((await saved(page)).training.totalReps).toBe(0);
  await page.locator('#club-guide-skip').click();await expect(page.locator('#club-guide')).not.toBeVisible();
  const value=await saved(page);expect(value.stats).toMatchObject({maxHP:100,stamina:100,damage:10});
  await page.reload();await page.locator('#continue-game').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await expect(page.locator('#club-guide')).toHaveCount(0);
});

for(const [width,height] of [[320,568],[844,390]])test(`экскурсия: панель, выход и взаимодействие доступны ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await guideSave(page,'gym-door');
  await expect(page.locator('#world-focus')).toBeVisible();
  await page.locator('#club-guide-skip').scrollIntoViewIfNeeded();await expect(page.locator('#club-guide-skip')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.cache/club-guide/lobby-${width}.png`});
  await page.locator('#club-guide-skip').click();await expect(page.locator('#club-guide')).not.toBeVisible();
});

test('пауза, сохранение урока, продолжение после перезагрузки, пропуск и повтор из лобби',async({page})=>{
  await seeded(page,'attacks');const before=await saved(page);
  await page.keyboard.press('Escape');await expect(page.locator('.tutorial-pause')).toBeVisible();
  await page.keyboard.press('q');await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  await page.locator('#tutorial-menu').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','menu');
  await page.reload();await page.locator('#continue-game').click();await step(page,'attacks');
  await page.locator('#tutorial-skip').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await page.locator('#lobby-tutorial').click();await step(page,'movement');
  await page.locator('#tutorial-skip').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  const value=await saved(page);expect(value.id).toBe(before.id);expect(value.stats).toEqual(before.stats);
  await page.locator('#back-menu').click();await page.locator('#continue-game').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await page.locator('#back-menu').click();await page.locator('#start-game').click();await page.locator('#confirm-new').click();
  await step(page,'movement');expect((await saved(page)).id).not.toBe(before.id);
});

for(const [width,height] of [[390,844],[844,390]]) {
  test(`обучение: подсказки и выход доступны ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await seeded(page,'club');
    await expect(page.locator('#tutorial-skip')).toBeInViewport();
    await page.locator('#tutorial-finish').scrollIntoViewIfNeeded();await expect(page.locator('#tutorial-finish')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.cache/tutorial/club-${width}x${height}.png`});
    await page.locator('#tutorial-finish').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  });
}

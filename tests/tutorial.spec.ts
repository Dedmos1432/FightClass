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
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
async function seeded(page:Page,current:PracticeStep):Promise<void> {
  const saves=new SaveService(new StorageService(null));saves.startNew();
  for(const next of TUTORIAL_STEPS) {if(next===current)break;saves.advanceTutorial(next);}
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();await step(page,current);
}
async function walk(page:Page,key:string,check:number):Promise<void> {
  await page.keyboard.down(key);
  try{await expect(page.locator(`[data-check="${check}"]`)).toHaveAttribute('data-done','true');}
  finally{await page.keyboard.up(key);}
}

test('новая игра: полное практическое обучение Q/W/E, комбинации, блока, уклонения и выносливости',async({page})=>{
  test.setTimeout(120_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#start-game').click();await step(page,'movement');
  await walk(page,'a',0);await walk(page,'d',1);await step(page,'attacks');
  for(const key of ['j','k','l'])await page.keyboard.press(key);
  await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  await expect(page.locator('[data-check][data-done="true"]')).toHaveCount(0);
  await page.screenshot({path:'.cache/tutorial/attacks-desktop.png'});
  for(const [index,key] of ['q','w','e'].entries()) {
    await page.keyboard.press(key);await expect(page.locator(`[data-check="${index}"]`)).toHaveAttribute('data-done','true');
    if(index<2)await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  }
  await step(page,'combo');await page.keyboard.press('q');
  await expect.poll(()=>arena(page).getAttribute('data-combo-cue'),{intervals:[15]}).toBe('true');await page.keyboard.press('w');
  await step(page,'block');await page.keyboard.down('Space');
  try{await step(page,'dodge');}finally{await page.keyboard.up('Space');}
  await expect.poll(()=>arena(page).getAttribute('data-dodge-cue'),{intervals:[15]}).toBe('true');await page.keyboard.press('Shift');
  await step(page,'stamina');
  for(let i=0;i<8;i++){
    if(await page.locator('[data-check="0"]').getAttribute('data-done')==='true')break;
    await page.keyboard.press('e');await expect(arena(page)).toHaveAttribute('data-player-action','attack');
    await expect(arena(page)).toHaveAttribute('data-player-action','idle');
  }
  await expect(page.locator('[data-check="0"]')).toHaveAttribute('data-done','true');
  await step(page,'club');await expect(page.locator('#tutorial-club')).toContainText('HP между противниками не восстанавливается');
  await page.locator('#tutorial-finish').click();await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  const value=await saved(page);expect(value.tutorial).toBe('complete');
  expect(value.stats).toMatchObject({maxHP:100,currentHP:100,stamina:100,damage:10});
  expect(value.training.totalReps).toBe(0);expect(value.career.victories).toEqual([]);expect(value.endless.totalWins).toBe(0);
  expect(value.activeRun).toBeUndefined();expect(value.activeCareer).toBeUndefined();expect(errors).toEqual([]);
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

async function guideSave(page:Page,current:ClubGuideStep):Promise<void> {
  const saves=new SaveService(new StorageService(null));saves.startNew();
  for(const step of TUTORIAL_STEPS.slice(0,-1))saves.advanceTutorial(step);
  for(const step of CLUB_GUIDE_STEPS){if(step===current)break;saves.advanceClubGuide(step);}
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();
  await expect(page.locator('#club-guide')).toHaveAttribute('data-step',current);
}

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

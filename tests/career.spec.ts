import { test, expect, type Page } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { GAME } from '../src/config/game';
import { COMBAT } from '../src/config/combat';
import { CAREER_ROSTER } from '../src/career/Roster';
import { careerWinsNeeded, type CareerCheckpoint } from '../src/career/Progress';
import { settleCareerRound, winCareerMatch } from './helpers/career';
import { combatPagesFor } from '../src/assets/combatAssets';
import type { EnemySkin } from '../src/combat/Opponents';
import { walkTo } from './helpers/walkTo';

function session(order=0, checkpoint?: Partial<CareerCheckpoint>, side:'player'|'enemy'|null='player', priorRounds?:number) {
  const saves=new SaveService(new StorageService(null));
  saves.startNew();saves.skipTutorial();
  for(const opponent of CAREER_ROSTER.slice(0,order)) {
    winCareerMatch(saves,opponent.id);
  }
  if(checkpoint) {
    saves.beginCareer(CAREER_ROSTER[order].id);
    if(side) for(let i=0;i<(priorRounds ?? careerWinsNeeded(CAREER_ROSTER[order].id)-1);i++) settleCareerRound(saves,side);
    const run=saves.activeCareer!;
    saves.checkpointCareer(run.id,{...run,...checkpoint});
  }
  return saves.current!;
}
async function seed(page:Page,order=0,checkpoint?:Partial<CareerCheckpoint>,side:'player'|'enemy'|null='player',priorRounds?:number) {
  await page.addInitScript(({key,value})=>{
    if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(value));
  },{key:GAME.storage.session,value:session(order,checkpoint,side,priorRounds)});
  await page.goto('/'); await page.locator('#continue-game').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
}
async function board(page:Page) {
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.keyboard.press('e'); await expect(page.locator('.career-ranking')).toBeVisible();
}
async function fight(page:Page,waitForFighting=true) {
  await board(page); await page.locator('#career-start').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','career-fight');
  if(waitForFighting) await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
}
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
const gpuSnapshot=(page:Page)=>page.evaluate(()=>(window as unknown as {__careerGpu():{live:number;deleted:number}}).__careerGpu());

test('карьерная доска: четыре на класс, имена, боссы, замки и работающие портреты',async({page})=>{
  await seed(page); await board(page);
  for(const tier of [1,2,3]) {
    await page.locator(`[data-tier="${tier}"]`).click();
    const roster=CAREER_ROSTER.filter(o=>o.tier===tier);
    await expect(page.locator('.opponent-row')).toHaveCount(4);
    expect(await page.locator('.opponent-row > span').allTextContents()).toEqual(roster.map(o=>`${o.name}${o.boss?'БОСС · ':''}${({boxing:'Бокс',mma:'ММА',taekwondo:'Тхэквондо','muay-thai':'Муай-тай',freestyle:'Свободный стиль'})[o.style]}`));
    for(const opponent of roster) {
      await page.locator(`[data-opponent="${opponent.id}"]`).click();
      await expect(page.locator('#opponent-profile h3')).toHaveText(opponent.name);
      await expect(page.locator('#career-start'))[opponent.order===0?'toBeEnabled':'toBeDisabled']();
      await expect.poll(()=>page.locator('.career-portrait img').evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
    }
    await page.screenshot({path:`.cache/stage5/board-class-${tier}.png`});
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  expect((await saved(page)).career.victories).toEqual([]);
});

for(const opponent of CAREER_ROSTER) test(`карьерная арена: ${opponent.name}, спрайты и атака без ошибок`,async({page})=>{
  const errors:string[]=[],failed:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    await seed(page,opponent.order,{playerX:700,enemyX:1300});
    await fight(page);
    await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-skin',opponent.skin);
    await expect(page.locator('#enemy-name')).toHaveText(opponent.name);
    await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-can-dodge',String(opponent.canDodge));
    await page.keyboard.press('q');
    await expect(page.locator('#combat-focus')).toHaveAttribute('data-player-action','attack');
    await page.screenshot({path:`.cache/stage5/arena-${opponent.id}.png`});
    await page.keyboard.press('Escape');
    await page.locator('#pause-exit').click();
    await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});

test('карьера: таймаут-победа открывает следующего, не даёт урон и переживает перезагрузку',async({page})=>{
  await seed(page,3,{elapsedMs:89_800,hp:80,enemyHP:25,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
  await fight(page,false);
  await expect(page.locator('#career-result-board')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Победа',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Открыт класс 02');
  const result=await saved(page);
  expect(result.currentClass).toBe(2); expect(result.career.victories).toEqual(['kim','kwon','yeo','shim']);
  expect(result.stats.damage).toBe(10); expect(result.activeCareer).toBeUndefined();
  await page.screenshot({path:'.cache/stage5/result-class-unlock.png'});
  await page.locator('#career-result-board').click();
  await expect(page.locator('#opponent-profile h3')).toHaveText('Bang Jung-eum');
  await expect(page.locator('#career-start')).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(page.locator('.fighter-class > b')).toHaveText('02');
  await page.reload(); await page.locator('#continue-game').click(); await board(page);
  await expect(page.locator('.rank-class-badge > b')).toHaveText('02');
  await page.locator('[data-tier="1"]').click(); await expect(page.locator('.opponent-row[data-status="ПОБЕЖДЁН"]')).toHaveCount(4);
});

  test('карьера: поражение по раундам, повтор с полным здоровьем без потери прошлых побед',async({page})=>{
    await seed(page,1,{elapsedMs:89_800,hp:30,enemyHP:92,playerX:COMBAT.minX,enemyX:COMBAT.maxX},'enemy');
    await fight(page,false);
    await expect(page.locator('#career-result-retry')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Поражение',exact:true})).toBeVisible();
    const before=await saved(page);
    expect(before.career.victories).toEqual(['kim']); expect(before.career.records.kwon.losses).toBe(1);
    await expect(page.locator('.career-final-score strong')).toHaveText('0 : 2');
    await page.locator('#career-result-retry').click();
    await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','countdown');
    await expect(page.locator('#fight-timer')).toHaveText('01:30');
    expect((await saved(page)).activeCareer.hp).toBe(100);
    expect((await saved(page)).career.records.kwon.attempts).toBe(2);
    await expect(page.locator('#fight-wins')).toHaveText('0 : 0');
  });

test('карьера: пауза, сохранение и продолжение HP/таймера без усиления15сек',async({page})=>{
  await seed(page,0,{elapsedMs:16_000,hp:72,stamina:45,enemyHP:60,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
  await fight(page);
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-boosted','false');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-damage','8');
  await expect(page.locator('#fight-pressure')).not.toContainText('УСИЛЕН');
  await page.keyboard.press('Escape');
  const time=await page.locator('#combat-focus').getAttribute('data-round-ms');
  await page.waitForTimeout(300);
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-round-ms',time!);
  await page.locator('#pause-exit').click();
  const run=(await saved(page)).activeCareer;
  await page.reload(); await page.locator('#continue-game').click(); await board(page);
  await expect(page.locator('#career-resume')).toBeVisible();
  await page.locator('#career-resume').click();
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','countdown');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-round-ms',String(run.elapsedMs));
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-player-hp',String(run.hp));
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-hp',String(run.enemyHP));
  expect((await saved(page)).activeCareer.id).toBe(run.id);
  expect((await saved(page)).career.records.kim.attempts).toBe(1);
});

test('карьера: нокаут атакой записывает победу, нокаут от бота записывает поражение',async({page})=>{
  await seed(page,0,{hp:100,enemyHP:1,enemyStamina:0,playerX:800,enemyX:1020});
  await fight(page);
  await page.keyboard.press('q');
  await expect(page.locator('#career-result-board')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Победа',exact:true})).toBeVisible();
  expect((await saved(page)).career.lastResult).toMatchObject({outcome:'player',reason:'knockout'});
  await page.locator('#career-result-board').click();
  await page.keyboard.press('Escape');
  // Seed after navigation: the old scene saves on pagehide and would overwrite
  // an in-page localStorage replacement during reload.
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{
    key:GAME.storage.session,value:session(0,{hp:1,playerX:800,enemyX:1020},'enemy'),
  });
  await page.reload(); await page.locator('#continue-game').click();
  await fight(page);
  await expect(page.locator('#career-result-retry')).toBeVisible({timeout:30_000});
  await expect(page.getByRole('heading',{name:'Поражение',exact:true})).toBeVisible();
  expect((await saved(page)).career.lastResult).toMatchObject({outcome:'enemy',reason:'knockout'});
});

test('карьера: финальная победа завершает все12, доска остаётся и любой бой можно повторить',async({page})=>{
  await seed(page,11,{elapsedMs:89_800,hp:100,enemyHP:40,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
  await fight(page,false); await expect(page.locator('#career-result-board')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Карьера высшего класса завершена');
  await page.locator('#career-result-board').click();
  await expect(page.locator('.career-board-intro')).toContainText('Карьера пройдена');
  await expect(page.locator('.career-total > b')).toHaveText('12 / 12');
  await page.locator('[data-tier="1"]').click(); await page.locator('[data-opponent="kim"]').click();
  await expect(page.locator('#career-start')).toHaveText(/Повторить бой/);
  await expect(page.locator('#career-start')).toBeEnabled();
  await page.screenshot({path:'.cache/stage5/career-complete.png'});
  await page.keyboard.press('Escape'); await page.locator('#back-menu').click();
  await expect(page.locator('.record-heading > b')).toHaveText('КЛАСС III');
  await page.screenshot({path:'.cache/stage5/menu-class-three.png'});
});

test('смена карьерных соперников и режимов освобождает прежние боевые текстуры без перезагрузки',async({page})=>{
  test.setTimeout(90_000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  // Instrument only this isolated test context, using public WebGL methods.
  // No production debug API or Phaser internals are required.
  await page.addInitScript(()=>{
    const live=new Set<WebGLTexture>(); let deleted=0;
    for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
      if(!type) continue;
      const create=type.prototype.createTexture,remove=type.prototype.deleteTexture;
      type.prototype.createTexture=function(){const texture=create.call(this); if(texture) live.add(texture); return texture;};
      type.prototype.deleteTexture=function(texture){if(texture && live.delete(texture)) deleted++; remove.call(this,texture);};
    }
    Object.assign(window,{__careerGpu:()=>({live:live.size,deleted})});
  });
  await seed(page,3,{elapsedMs:89_800,hp:100,enemyHP:10,playerX:COMBAT.minX,enemyX:COMBAT.maxX});
  await fight(page,false); await expect(page.locator('#career-result-board')).toBeVisible();
  const shim=await gpuSnapshot(page);
  expect(shim.live).toBeGreaterThan(0);
  await page.locator('#career-result-board').click(); await page.locator('#career-start').click();
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-skin','bang');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  await page.keyboard.press('Escape'); await page.locator('#pause-exit').click();
  const bang=await gpuSnapshot(page);
  expect(bang.deleted).toBeGreaterThanOrEqual(shim.deleted+combatPagesFor(['shim']).length);
  await walkTo(page,1468); await expect(page.locator('#interact-object')).toContainText('Войти в зал единоборств'); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await walkTo(page,COMBAT.centerX); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  const endlessSkin=await page.locator('#combat-focus').getAttribute('data-enemy-skin') as EnemySkin;
  await page.keyboard.press('Escape'); await page.locator('#pause-exit').click();
  const endless=await gpuSnapshot(page);
  await walkTo(page,COMBAT.centerX); await board(page); await page.locator('#career-resume').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','career-fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  await page.keyboard.press('Escape'); await page.waitForTimeout(750);
  const resumed=await gpuSnapshot(page);
  expect(resumed.deleted).toBeGreaterThanOrEqual(endless.deleted+(endlessSkin==='bang'?0:combatPagesFor([endlessSkin]).length));
  // The dojo background is newly cached; canvas text may transiently use two textures.
  expect(resumed.live).toBeLessThanOrEqual(bang.live+3);
  expect(endless.live-resumed.live).toBeGreaterThanOrEqual(combatPagesFor(['player',endlessSkin]).length-combatPagesFor(['player','bang']).length-2);
  console.info('GPU lifecycle', {shim,bang,endless,resumed});
  expect((await saved(page)).activeRun).toBeDefined(); expect(errors).toEqual([]);
});

for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]) {
  test(`карьерный рейтинг и HUD помещаются ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height}); await seed(page); await board(page);
    await expect(page.locator('.career-ranking')).toBeVisible();
    const layout=await page.locator('.career-ranking').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width+1);
    await page.locator('#career-start').scrollIntoViewIfNeeded();
    await expect(page.locator('#career-start')).toBeInViewport();
    await page.screenshot({path:`.cache/stage5/board-${width}x${height}.png`});
    await page.locator('#career-start').click();
    await expect(page.locator('#ui')).toHaveAttribute('data-screen','career-fight');
    await expect(page.locator('#fight-pause')).toBeInViewport();
    await page.keyboard.press('Escape'); await expect(page.locator('#pause-exit')).toBeVisible();
    await page.screenshot({path:`.cache/stage5/pause-${width}x${height}.png`});
  });
}

for(const order of [0,3]) for(const side of ['player','enemy'] as const) {
  test(`раунды: ${CAREER_ROSTER[order].name}, ${side}, матч продолжается до нужного счёта и сохраняется`,async({page})=>{
    const opponent=CAREER_ROSTER[order],needed=careerWinsNeeded(opponent.id);
    await seed(page,order,{elapsedMs:89_800,hp:side==='player'?90:10,
      enemyHP:side==='player'?opponent.maxHP*.1:opponent.maxHP,playerX:COMBAT.minX,enemyX:COMBAT.maxX},side,needed-2);
    await fight(page,false);
    const arena=page.locator('#combat-focus');
    await expect(arena).toHaveAttribute(`data-${side==='player'?'player':'enemy'}-rounds`,String(needed-1));
    await expect(page.locator('#career-result-board')).toHaveCount(0);
    await expect(arena).toHaveAttribute('data-round-number',String(needed));
    await expect(arena).toHaveAttribute('data-phase','countdown');
    await page.keyboard.press('Escape');
    await expect(page.locator('#fight-timer')).toHaveText('01:30');
    await expect(page.locator('#fight-record')).toHaveText(`ДО ${needed} ПОБЕД`);
    await expect(arena).toHaveAttribute('data-player-hp','100');
    await expect(arena).toHaveAttribute('data-enemy-hp',String(opponent.maxHP));
    await expect(page.locator(`#${side==='player'?'player':'enemy'}-round-marks i[data-won="true"]`)).toHaveCount(needed-1);
    const snapshot=await saved(page);
    expect(snapshot.career.records[opponent.id]).toEqual({attempts:1,wins:0,losses:0,draws:0});
    expect(snapshot.career.victories).toHaveLength(order);
    await page.screenshot({path:`.cache/stage5/rounds-${opponent.id}-${side}.png`});
    await page.locator('#pause-exit').click();
    await page.reload();await page.locator('#continue-game').click();await board(page);
    await page.locator('#career-resume').click();
    await expect(arena).toHaveAttribute('data-round-number',String(needed));
    await expect(arena).toHaveAttribute(`data-${side==='player'?'player':'enemy'}-rounds`,String(needed-1));
    expect((await saved(page)).activeCareer.id).toBe(snapshot.activeCareer.id);
  });
}

test('раунды: ничья повторяет раунд без изменения счёта, без поражения и без новой попытки',async({page})=>{
  await seed(page,0,{elapsedMs:89_800,hp:100,enemyHP:80,playerX:COMBAT.minX,enemyX:COMBAT.maxX},null);
  await fight(page,false);
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-drawn-rounds','1');
  await expect(page.locator('#fight-wins')).toHaveText('0 : 0');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-round-number','2');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','countdown');
  const snapshot=await saved(page);
  expect(snapshot.activeCareer).toMatchObject({drawnRounds:1,hp:100,enemyHP:80,elapsedMs:0});
  expect(snapshot.career.records.kim).toEqual({attempts:1,wins:0,losses:0,draws:0});
  await expect(page.locator('#career-result-retry')).toHaveCount(0);
});

test('раунды: загрузка после решающего раунда завершает матч ровно один раз',async({page})=>{
  await seed(page,0,{enemyHP:0},'player',2);
  await fight(page,false);
  await expect(page.locator('#career-result-board')).toBeVisible();
  await expect(page.locator('.career-final-score strong')).toHaveText('2 : 0');
  expect((await saved(page)).career.records.kim).toEqual({attempts:1,wins:1,losses:0,draws:0});
  expect((await saved(page)).activeCareer).toBeUndefined();
  await page.locator('#career-result-board').click();await page.keyboard.press('Escape');
  await page.reload();await page.locator('#continue-game').click();
  expect((await saved(page)).career.records.kim.wins).toBe(1);
});

import { skipTutorial } from './helpers/tutorial';
import { test, expect } from '@playwright/test';
import { GAME } from '../src/config/game';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { winCareerMatch } from './helpers/career';
import { walkTo } from './helpers/walkTo';

test('доска подсвечивается зелёным только рядом с персонажем, независимо от обучения',async({page})=>{
  await page.goto('/');await page.locator('#start-game').click();await skipTutorial(page);
  const countGreen=async()=>{
    const {width,height}=page.viewportSize()!,zoom=Math.min(width/1920,height/1080);
    const screenshot=await page.screenshot({clip:{x:(width-1920*zoom)/2+696*zoom,y:(height-1080*zoom)/2+427*zoom,width:538*zoom,height:220*zoom}});
    return page.evaluate(async encoded=>{
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let green=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>115&&pixels[i+1]>pixels[i]*1.35&&pixels[i+1]>pixels[i+2]*1.15)green++;
      return green;
    },screenshot.toString('base64'));
  };
  await walkTo(page,457);const far=await countGreen();
  await walkTo(page,965);await expect(page.locator('#interact-object')).toContainText('Открыть доску');
  const near=await countGreen();expect(near).toBeGreaterThan(far+300);
  await page.screenshot({path:'.cache/club-guide/board-highlight.png'});
  await walkTo(page,1468);expect(await countGreen()).toBeLessThan(near-300);
});

test('доска использует текстуру, вложенные фотографии выбирают профиль, классы не меняют прогресс',async({page,request})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('#start-game').click();await skipTutorial(page);
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.keyboard.press('e');
  const dialog=page.locator('.career-ranking');
  await expect(dialog).toBeVisible();
  for(const text of ['ЗАПИСЬ НА ПОДПОЛЬНЫЕ БОИ','БОЙ ЗА ПРАВО ПОДНЯТЬСЯ ВЫШЕ','Четыре соперника в каждом классе.','Прокачка HP и выносливости — в качалке.'])await expect(dialog).not.toContainText(text);
  await expect(dialog.locator('.opponent-fairness')).toHaveCount(0);
  const texture=await dialog.evaluate(el=>getComputedStyle(el).getPropertyValue('--career-board-texture'));
  expect(texture).toContain('career-board');
  const url=texture.match(/url\(["']?([^"')]+)["']?\)/)![1];
  const response=await request.get(url);
  expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/webp');
  await expect(dialog.locator('.board-row-photo img')).toHaveCount(4);
  await dialog.locator('[data-opponent="shim"] .board-row-photo img').click();
  await expect(dialog.locator('#opponent-profile h3')).toHaveText('Shim Ha-min');
  await expect(dialog.locator('.opponent-fairness')).toHaveCount(0);
  await expect(dialog.locator('.career-match-format')).toContainText('ДО 3 ПОБЕД');
  await expect(dialog.locator('#career-start')).toBeDisabled();
  await dialog.locator('[data-tier="3"]').click();
  await expect(dialog.locator('.opponent-row[data-boss="true"]')).toHaveCount(4);
  await dialog.locator('[data-tier="1"]').click();
  await dialog.locator('[data-opponent="kim"] .board-row-photo img').click();
  await expect(dialog.locator('#career-start')).toBeEnabled();
  await expect(dialog.locator('.career-match-format')).toContainText('ДО 2 ПОБЕД');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
  expect(saved.career.victories).toEqual([]);
  await page.screenshot({path:'.cache/board-refresh/board-desktop.png'});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  expect(errors).toEqual([]);
});

for(const width of [1440,320])test(`максимальные характеристики без полосок во всех комнатах ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:900});
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();
  const value={...saves.current!,stats:{...saves.stats,currentHP:37,currentStamina:42}};
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:GAME.storage.session,value});
  await page.goto('/');await page.locator('#continue-game').click();
  const check=async()=>{
    const hud=page.locator('.world-hud');
    await expect(hud.locator('#hp-value')).toHaveText('100');await expect(hud.locator('#stamina-value')).toHaveText('100');
    await expect(hud.locator('#damage-value')).toHaveText('10');await expect(hud.locator('.fighter-class > b')).toHaveText('01');
    await expect(hud.locator('#choose-style')).toBeVisible();await expect(hud.locator('[role="progressbar"], .meter-track')).toHaveCount(0);
    await expect(hud).not.toContainText('37');await expect(hud).not.toContainText('42');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  };
  await check();await expect(page.locator('.location-heading')).not.toContainText('МЕЖДУ БОЯМИ');
  await page.screenshot({path:`.cache/ui-cleanup/lobby-${width}.png`});
  for(const [room,x] of [['gym',457],['dojo',1468]] as const){
    await walkTo(page,x);await page.keyboard.press('e');await expect(page.locator('#ui')).toHaveAttribute('data-screen',room);
    await check();await page.keyboard.press('Escape');await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  }
});

test('доска сохраняет маршрут продолжения: другая карточка заблокирована, баннер продолжает исходный матч',async({page})=>{
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();winCareerMatch(saves,'kim');
  const run=saves.beginCareer('kwon')!;
  saves.checkpointCareer(run.id,{...run,hp:63,enemyHP:45,elapsedMs:15_000});
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);await page.keyboard.press('e');
  await expect(page.locator('.career-pending')).toContainText('Kwon Tae-young');
  await page.locator('[data-opponent="kim"] .board-row-photo img').click();
  await expect(page.locator('#career-start')).toBeDisabled();
  await page.locator('#career-resume').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','career-fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-enemy-skin','kwon');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-player-hp','63');
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session)).activeCareer.id).toBe(run.id);
});

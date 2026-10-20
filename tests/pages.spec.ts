import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME } from '../src/config/game';
import { WORLD } from '../src/config/lobby';

const manifest = JSON.parse(readFileSync(new URL('../src/assets/combatManifest.json', import.meta.url), 'utf8')) as { pages: string[] };

test('GitHub Pages: меню, комнаты, бой и все атласы доступны под /FightClass/', async ({ page, request }) => {
  const errors: string[] = [], failed: string[] = [], paths: string[] = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    const url = new URL(response.url());
    if (url.protocol === 'http:' && url.origin === 'http://127.0.0.1:4174') {
      paths.push(url.pathname);
      if (response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`);
    }
  });
  await page.goto('./');
  await expect(page).toHaveTitle('Fight Class');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','menu');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');

  // Exercise both rooms using actual movement and E, so every room loader runs.
  const x=async()=>Number(await page.locator('#world-focus').getAttribute('data-player-x'));
  async function walk(target:number):Promise<void> {
    const right=await x()<target;
    await page.keyboard.down(right?'d':'a');
    try {
      await expect.poll(x,{intervals:[25],timeout:15000})[right?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](target+(right?-40:40));
    } finally { await page.keyboard.up(right?'d':'a'); }
  }
  await walk(457); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await walk(1468); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await walk(WORLD.width/2); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting',{timeout:25000});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:'test-results/pages/fight-pages.png'});
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
  expect(saved.activeRun).toBeDefined();

  for(const atlas of manifest.pages) {
    for(const extension of ['json','png']) {
      const response=await request.get(`combat/${atlas}.${extension}`);
      expect(response.status(),`${atlas}.${extension}`).toBe(200);
      expect(response.headers()['content-type']).toContain(extension==='json'?'application/json':'image/png');
    }
  }
  expect(paths.length).toBeGreaterThan(20);
  expect(paths.filter(path=>!path.startsWith('/FightClass/'))).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

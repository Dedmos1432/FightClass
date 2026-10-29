import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME } from '../src/config/game';
import { WORLD } from '../src/config/lobby';
import { walkTo } from './helpers/walkTo';

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
  await walkTo(page,457); await expect(page.locator('#interact-object')).toContainText('Войти в тренажёрный зал'); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','gym');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','lobby');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await walkTo(page,1468); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await walkTo(page,WORLD.width/2); await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting',{timeout:25000});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:'test-results/pages/fight-pages.png'});
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),GAME.storage.session);
  expect(saved.activeRun).toBeDefined();

  await page.locator('#pause-exit').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await walkTo(page,WORLD.width/2); await page.keyboard.press('e');
  await expect(page.locator('.opponent-row')).toHaveCount(4);
  await page.locator('#career-start').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','career-fight');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
  await expect(page.locator('#enemy-name')).toHaveText('Kim Dong-won');
  await page.screenshot({path:'.cache/stage5/career-pages.png'});
  await page.keyboard.press('Escape');

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

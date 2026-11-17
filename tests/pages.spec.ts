import { skipTutorial } from './helpers/tutorial';
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { GAME } from '../src/config/game';
import { WORLD } from '../src/config/lobby';
import { walkTo } from './helpers/walkTo';

const manifest = JSON.parse(readFileSync(new URL('../src/assets/deliveryManifest.json', import.meta.url), 'utf8')) as { pages: Record<string,{image:string;data:string}> };
const builtFiles=readdirSync(new URL('../dist/assets/',import.meta.url));
const builtCode=builtFiles.filter(name=>/^index-.*\.js$/.test(name)).map(name=>readFileSync(new URL(`../dist/assets/${name}`,import.meta.url),'utf8')).join('\n');

test('GitHub Pages: меню, комнаты, бой и все атласы доступны под /FightClass/', async ({ page, request }) => {
  expect(existsSync(new URL('../dist/combat/',import.meta.url)),'authoring combat PNGs must not ship').toBe(false);
  expect(builtFiles.filter(name=>/\.(png|ttf)$/.test(name)),'runtime should use delivery images and WOFF2 fonts').toEqual([]);
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
  await page.locator('#start-game').click();await skipTutorial(page);
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

  for(const atlas of Object.values(manifest.pages)) {
    for(const file of [atlas.image,atlas.data]) {
      const extension=file.endsWith('.json') ? '.json' : '.webp';
      const prefix=basename(file,extension)+'-';
      const built=builtFiles.find(name=>name.startsWith(prefix)&&name.endsWith(extension));
      if(!built&&extension==='.json') {
        // Vite embeds small atlas metadata as a data URL to avoid another request.
        const inline='data:application/json;base64,'+readFileSync(new URL(`../assets/delivery/${file}`,import.meta.url)).toString('base64');
        expect(builtCode,`inlined atlas metadata ${file}`).toContain(inline);
        continue;
      }
      expect(built,`hashed delivery asset ${file}`).toBeDefined();
      const response=await request.get(`assets/${built}`);
      expect(response.status(),file).toBe(200);
      expect(response.headers()['content-type']).toContain(extension==='.json'?'application/json':'image/webp');
    }
  }
  expect(paths.length).toBeGreaterThan(20);
  expect(paths.filter(path=>!path.startsWith('/FightClass/'))).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

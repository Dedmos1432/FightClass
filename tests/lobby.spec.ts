import { test, expect, type Page } from '@playwright/test';
import { GAME } from '../src/config/game';
import { WORLD, LOBBY_OBJECTS } from '../src/config/lobby';
import { STYLES } from '../src/config/styles';

const region = (page: Page) => page.locator('#world-focus');
const x = async (page: Page): Promise<number> => Number(await region(page).getAttribute('data-player-x'));
const location = (page: Page, name: string) => expect(page.locator('#ui')).toHaveAttribute('data-screen', name);

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#start-game').click();
  await location(page, 'lobby');
  await expect(region(page)).toHaveAttribute('data-player-x', /\d+/);
}

async function walkTo(page: Page, target: number): Promise<void> {
  const initial = await x(page);
  const right = initial < target;
  const key = right ? 'd' : 'a';
  await page.keyboard.down(key);
  try {
    await expect.poll(() => x(page), { intervals: [25], timeout: 12000 })[right ? 'toBeGreaterThanOrEqual' : 'toBeLessThanOrEqual'](target + (right ? -45 : 45));
  } finally { await page.keyboard.up(key); }
  await expect(region(page)).toHaveAttribute('data-animation', /idle/);
  expect(Math.abs(await x(page) - target)).toBeLessThan(WORLD.interactionRadius);
}

test('Idle и Walk, разворот и постоянная линия стоп', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-right');
  await page.keyboard.down('d');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-walk-right');
  await expect.poll(() => x(page)).toBeGreaterThan(WORLD.spawnX + 80);
  await expect(region(page)).toHaveAttribute('data-foot-y', String(WORLD.floorY));
  await page.screenshot({ path: 'test-results/lobby-walk.png' });
  await page.keyboard.up('d');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-right');
  const before = await x(page);
  await page.keyboard.down('ArrowLeft');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-walk-left');
  await expect.poll(() => x(page)).toBeLessThan(before - 60);
  await page.keyboard.up('ArrowLeft');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-left');
  await expect(region(page)).toHaveAttribute('data-foot-y', String(WORLD.floorY));
  expect(errors).toEqual([]);
});

test('две двери ведут в разные комнаты, E у выхода возвращает в то же лобби', async ({ page }) => {
  await start(page);
  for (const room of ['gym', 'dojo'] as const) {
    const door = LOBBY_OBJECTS.find((object) => object.id === room)!;
    await walkTo(page, door.x);
    await expect(page.locator('#interact-object')).toContainText(door.action);
    await page.keyboard.press('e');
    await location(page, room);
    await expect(region(page)).toHaveAttribute('data-player-x', /\d+/);
    await expect.poll(async () => Math.round((await page.locator('.brand').boundingBox())!.y)).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: `test-results/${room}.png` });
    await walkTo(page, 160);
    await expect(page.locator('#interact-object')).toContainText('Вернуться в лобби');
    await page.keyboard.press('e');
    await location(page, 'lobby');
    await expect(region(page)).toHaveAttribute('data-player-x', /\d+/);
    expect(Math.abs(await x(page) - door.x)).toBeLessThan(WORLD.interactionRadius);
  }
  await page.screenshot({ path: 'test-results/lobby-stage-2.png' });
});

test('доска открывает рейтинг, просмотр классов работает и останавливает движение', async ({ page }) => {
  await start(page);
  await page.keyboard.press('e');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.opponent-row')).toHaveCount(3);
  await expect(dialog.locator('#opponent-profile')).toContainText('Илья');
  const position = await x(page);
  await page.keyboard.down('a');
  // Observe several frames: an open dialog must prevent movement.
  await page.waitForTimeout(250);
  await page.keyboard.up('a');
  expect(await x(page)).toBe(position);
  await dialog.locator('[data-tier="3"]').click();
  await expect(dialog.locator('#opponent-profile')).toContainText('Роман');
  await dialog.locator('[data-opponent="nik"]').click();
  await expect(dialog.locator('#opponent-profile')).toContainText('Свободный стиль');
  await expect(dialog.locator('#class-unlock')).toContainText('Высший класс');
  await expect(dialog.getByRole('button', { name: /Начать бой/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ranking-stage-2.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await location(page, 'lobby');
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('пять стилей сохраняются и не изменяют характеристики', async ({ page }) => {
  await start(page);
  const before = await page.locator('.stat-meter, .damage-stat').allTextContents();
  await page.locator('#choose-style').click();
  await expect(page.locator('input[name="style"]')).toHaveCount(5);
  for (const style of STYLES) {
    await page.locator(`input[value="${style.id}"]`).check();
    await expect(page.locator('#current-style')).toHaveText(style.name);
    expect(await page.locator('.stat-meter, .damage-stat').allTextContents()).toEqual(before);
  }
  await page.screenshot({ path: 'test-results/styles-stage-2.png' });
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.locator('#back-menu').click();
  await page.reload();
  await page.locator('#continue-game').click();
  await location(page, 'lobby');
  await expect(page.locator('#current-style')).toHaveText('Свободный стиль');
});

test('границы комнаты, противоположные клавиши и отсутствие взаимодействия вдали', async ({ page }) => {
  await start(page);
  await page.keyboard.down('a');
  await expect.poll(() => x(page), { intervals: [50], timeout: 10000 }).toBe(WORLD.minX);
  await page.keyboard.up('a');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-left');
  await expect(page.locator('#interact-object')).toBeHidden();
  await page.keyboard.press('e');
  await location(page, 'lobby');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.down('a');
  await page.keyboard.down('d');
  await page.waitForTimeout(200);
  expect(await x(page)).toBe(WORLD.minX);
  await page.keyboard.up('a');
  await expect.poll(() => x(page), { intervals: [100], timeout: 10000 }).toBe(WORLD.maxX);
  await page.keyboard.up('d');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-right');
});

test('позиция сохраняется, изменение окна и потеря фокуса не сдвигают персонажа', async ({ page }) => {
  await start(page);
  await walkTo(page, 1200);
  const position = await x(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await expect(region(page)).toHaveAttribute('data-foot-y', String(WORLD.floorY));
  expect(await x(page)).toBe(position);
  await page.keyboard.down('a');
  await expect(region(page)).toHaveAttribute('data-animation', 'player-walk-left');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(region(page)).toHaveAttribute('data-animation', 'player-idle-left');
  await page.keyboard.up('a');
  const savedPosition = await x(page);
  await page.locator('#back-menu').click();
  await page.reload();
  await page.locator('#continue-game').click();
  await location(page, 'lobby');
  await expect.poll(() => x(page)).toBeCloseTo(savedPosition, 0);
});

test('сохранение этапа 1 продолжается без сброса', async ({ page }) => {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({ version: 1, id: 'stage-one-player', createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z', location: 'lobby', currentClass: 1 }));
  }, GAME.storage.session);
  await page.goto('/');
  await page.locator('#continue-game').click();
  await location(page, 'lobby');
  await expect.poll(() => x(page)).toBe(WORLD.spawnX);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).id, GAME.storage.session)).toBe('stage-one-player');
});

test('ошибка загрузки лобби позволяет повторить загрузку и продолжить сохранение', async ({ page }) => {
  const background = /\/lobby(?:-[^/]+)?\.png$/;
  await page.route(background, (route) => route.abort());
  await page.goto('/');
  await page.locator('#start-game').click();
  await expect(page.getByRole('heading', { name: 'Не удалось загрузить локацию' })).toBeVisible();
  await page.unroute(background);
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await page.locator('#continue-game').click();
  await location(page, 'lobby');
});

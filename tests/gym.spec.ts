import { test, expect, type Page } from '@playwright/test';
import { GAME } from '../src/config/game';
import { BENCH } from '../src/config/training';
import { LOBBY_OBJECTS } from '../src/config/lobby';

const region = (page: Page) => page.locator('#world-focus');
const position = async (page: Page) => Number(await region(page).getAttribute('data-player-x'));
const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GAME.storage.session);

async function walk(page: Page, target: number): Promise<void> {
  await expect(region(page)).toHaveAttribute('data-player-x', /\d+/);
  const right = await position(page) < target;
  const key = right ? 'd' : 'a';
  await page.keyboard.down(key);
  try { await expect.poll(() => position(page), { intervals: [25], timeout: 12000 })[right ? 'toBeGreaterThanOrEqual' : 'toBeLessThanOrEqual'](target + (right ? -40 : 40)); }
  finally { await page.keyboard.up(key); }
  await expect(region(page)).toHaveAttribute('data-animation', /idle/);
}

async function enterGym(page: Page, fresh = true): Promise<void> {
  await page.goto('/');
  await page.locator(fresh ? '#start-game' : '#continue-game').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'lobby');
  await walk(page, LOBBY_OBJECTS.find((object) => object.id === 'gym')!.x);
  await page.keyboard.press('e');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'gym');
  await walk(page, BENCH.x);
}

async function begin(page: Page, tutorial = true): Promise<void> {
  await page.keyboard.press('e');
  if (tutorial) {
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#bench-tutorial-start').click();
  }
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase', 'pressing');
}

async function repetitions(page: Page, count: number): Promise<void> {
  const deadline = Date.now() + 12000;
  while (Number(await page.locator('#bench-reps').textContent()) < count && Date.now() < deadline) {
    await page.keyboard.press('e');
    // Intentional input cadence for the QTE, rather than a readiness wait.
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => Number(await page.locator('#bench-reps').textContent())).toBe(count);
}

test('первое обучение, полноценный жим, награда, подъём и сохранение в лобби', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await enterGym(page);
  await page.screenshot({ path: 'test-results/gym-bench.png' });
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: /Сильнее с каждым/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/gym-tutorial.png' });
  await page.locator('#bench-tutorial-start').click();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase', 'pressing');
  await repetitions(page, 2);
  await expect(page.locator('.hp-meter .meter-track')).toHaveAttribute('aria-valuemax', '102');
  await expect(page.locator('.stamina-meter .meter-track')).toHaveAttribute('aria-valuemax', '102');
  await expect(page.locator('#damage-value')).toHaveText('10');
  await page.screenshot({ path: 'test-results/gym-qte.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /Подход завершён/ })).toBeVisible();
  await expect(page.locator('#ui')).not.toHaveAttribute('data-training', 'active');
  await page.screenshot({ path: 'test-results/gym-result.png' });
  await page.getByRole('button', { name: /Вернуться к тренировкам/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'lobby');
  const checkpoint = await saved(page);
  expect(checkpoint.training.totalReps).toBe(2);
  expect(checkpoint.training.bestSession).toBe(2);
  await page.locator('#back-menu').click();
  await page.reload(); await page.locator('#continue-game').click();
  await expect(page.locator('.hp-meter .meter-track')).toHaveAttribute('aria-valuemax', '102');
  expect((await saved(page)).training.totalReps).toBe(2);
  const trainedStats = (await saved(page)).stats;
  await page.locator('#choose-style').click();
  await page.locator('input[value="mma"]').check();
  expect((await saved(page)).stats).toEqual(trainedStats);
  await page.getByRole('button', { name: 'Готово' }).click();
  expect(errors).toEqual([]);
});

test('отмена обучения не скрывает его навсегда, отмена подготовки не даёт награду', async ({ page }) => {
  await enterGym(page);
  await page.keyboard.press('e'); await page.keyboard.press('Escape');
  expect((await saved(page)).training.tutorialSeen).toBe(false);
  await page.keyboard.press('e');
  await page.locator('#bench-tutorial-start').click();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-phase', 'preparing');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /Подход завершён/ })).toBeVisible();
  expect((await saved(page)).training.totalReps).toBe(0);
  expect((await saved(page)).stats.maxHP).toBe(100);
  await page.getByRole('button', { name: /Вернуться к тренировкам/ }).click();
  await begin(page, false);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /Подход завершён/ })).toBeVisible();
  expect((await saved(page)).training.sessions).toBe(2);
});

test('удержание E не выполняет повторение, движение блокируется, помощь ставит жим на паузу', async ({ page }) => {
  await enterGym(page); await begin(page);
  const x = await position(page);
  await page.keyboard.down('e');
  for (let index = 0; index < 8; index++) { await page.keyboard.down('e'); await page.waitForTimeout(70); }
  await page.keyboard.up('e');
  await expect(page.locator('#bench-reps')).toHaveText('00');
  await page.keyboard.down('a'); await page.waitForTimeout(200); await page.keyboard.up('a');
  expect(await position(page)).toBe(x);
  await page.getByRole('button', { name: 'Обучение жиму' }).click();
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-paused', 'true');
  const progress = await page.locator('.bench-progress').getAttribute('aria-valuenow');
  await page.waitForTimeout(350);
  await expect(page.locator('.bench-progress')).toHaveAttribute('aria-valuenow', progress!);
  await page.keyboard.press('Escape');
  await expect(page.locator('#bench-workout')).toHaveAttribute('data-paused', 'false');
  await repetitions(page, 1);
});

test('перезагрузка посреди подхода сохраняет полные повторения и флаг обучения', async ({ page }) => {
  await enterGym(page); await begin(page); await repetitions(page, 1);
  await page.reload(); await page.locator('#continue-game').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'lobby');
  expect((await saved(page)).training.totalReps).toBe(1);
  expect((await saved(page)).stats.maxHP).toBe(102);
  await walk(page, LOBBY_OBJECTS.find((object) => object.id === 'gym')!.x);
  await page.keyboard.press('e'); await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'gym');
  await walk(page, BENCH.x); await begin(page, false);
  await expect(page.locator('#bench-reps')).toHaveText('00');
  expect((await saved(page)).training.totalReps).toBe(1);
});

test('выход в меню во время жима корректно завершает анимацию без повторного начисления', async ({ page }) => {
  await enterGym(page); await begin(page); await repetitions(page, 1);
  await page.locator('#back-menu').click();
  await expect(page.locator('#ui')).toHaveAttribute('data-screen', 'menu');
  expect((await saved(page)).training.totalReps).toBe(1);
  await page.locator('#continue-game').click();
  await expect(page.locator('#damage-value')).toHaveText('10');
  expect((await saved(page)).training.totalReps).toBe(1);
});

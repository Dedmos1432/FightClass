import { test, expect, type Page } from '@playwright/test';
import { GAME } from '../src/config/game';

const screen = (page: Page) => page.locator('#ui');

async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect(screen(page)).toHaveAttribute('data-screen', 'menu');
}

test('меню запускается без ошибок, продолжение недоступно до сохранения', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openMenu(page);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: /Начать игру/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Продолжить/ })).toBeDisabled();
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  expect(errors).toEqual([]);
});

test('новая игра, возврат, перезагрузка и продолжение сохраняют одну сессию', async ({ page }) => {
  await openMenu(page);
  await page.locator('#start-game').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  await expect(page.locator('#save-status')).toContainText('на этом устройстве');
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GAME.storage.session);
  expect(session.currentClass).toBe(1);
  await page.locator('#back-menu').click();
  await expect(page.locator('#continue-game')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#continue-game')).toBeEnabled();
  await page.locator('#continue-game').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).id, GAME.storage.session)).toBe(session.id);
  await page.screenshot({ path: 'test-results/lobby-entry.png' });
  await page.keyboard.press('Escape');
  await expect(screen(page)).toHaveAttribute('data-screen', 'menu');
});

test('замена сохранения требует подтверждения, отмена сохраняет прежнюю игру', async ({ page }) => {
  await openMenu(page);
  await page.locator('#start-game').click();
  await page.locator('#back-menu').click();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).id, GAME.storage.session);
  await page.locator('#start-game').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).id, GAME.storage.session)).toBe(id);
  await page.locator('#start-game').click();
  await page.locator('#confirm-new').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).id, GAME.storage.session)).not.toBe(id);
});

test('настройки применяются и восстанавливаются после перезагрузки', async ({ page }) => {
  await openMenu(page);
  await page.locator('#settings').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#volume').evaluate((element: HTMLInputElement) => {
    element.value = '27';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#volume-value')).toHaveText('27%');
  await page.locator('#sound-enabled').uncheck();
  await page.locator('#motion-enabled').uncheck();
  await expect(page.locator('body')).toHaveAttribute('data-motion', 'false');
  await page.screenshot({ path: 'test-results/settings-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#settings')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeVisible();
  await page.locator('#settings').click();
  await expect(page.locator('#volume')).toHaveValue('27');
  await expect(page.locator('#sound-enabled')).not.toBeChecked();
  await expect(page.locator('#motion-enabled')).not.toBeChecked();
});

test('Escape закрывает настройки в лобби, повторный Escape возвращает в меню', async ({ page }) => {
  await openMenu(page);
  await page.locator('#start-game').click();
  await page.locator('#lobby-settings').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  await page.keyboard.press('Escape');
  await expect(screen(page)).toHaveAttribute('data-screen', 'menu');
});

test('клавиатура запускает игру, многократные переходы не дублируют обработчики', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openMenu(page);
  await expect(page.locator('#start-game')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  for (let count = 0; count < 4; count++) {
    await page.locator('#back-menu').click();
    await page.locator('#continue-game').click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  }
  await page.locator('#back-menu').click();
  await page.getByRole('button', { name: 'Выключить звук' }).click();
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('повреждённое сохранение объясняется и не мешает новой игре', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken'), GAME.storage.session);
  await openMenu(page);
  await expect(page.locator('#continue-game')).toBeDisabled();
  await expect(page.locator('#toast')).toContainText('повреждено');
  await page.locator('#start-game').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  await expect(page.locator('#toast')).not.toHaveClass('visible');
});

test('запрет хранилища не ломает меню и честно отмечает временное сохранение', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await openMenu(page);
  await page.locator('#start-game').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
  await expect(page.locator('#save-status')).toContainText('до перезагрузки');
  await page.locator('#back-menu').click();
  await expect(page.locator('#continue-game')).toBeEnabled();
});

test('ошибка загрузки фона показывает рабочую кнопку повтора', async ({ page }) => {
  // Match the actual texture, not Vite's .png?import JavaScript module.
  await page.route(/\.png$/, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Не удалось загрузить фон' })).toBeVisible();
  await page.unroute(/\.png$/);
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'menu');
});

test('полноэкранный режим включается и выключается кнопкой', async ({ page }) => {
  await openMenu(page);
  test.skip(!await page.evaluate(() => document.fullscreenEnabled), 'Fullscreen is unavailable in this browser.');
  await page.getByRole('button', { name: 'Полный экран', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Выйти из полного экрана' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`меню и настройки доступны при ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMenu(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#settings').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Готово' }).click();
    if (viewport.width === 390) await page.screenshot({ path: 'test-results/menu-mobile.png', fullPage: true });
    await page.locator('#start-game').click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'lobby');
    await page.locator('#back-menu').click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'menu');
  });
}

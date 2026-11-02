import { test, expect, type Page } from '@playwright/test';
import { SaveService } from '../src/services/SaveService';
import { StorageService } from '../src/services/StorageService';
import { COMBAT, ATTACK_SLOTS } from '../src/config/combat';
import { attackDuration } from '../src/combat/CombatWorld';
import { GAME } from '../src/config/game';
import { walkTo } from './helpers/walkTo';

async function start(page:Page,stamina=40):Promise<void> {
  const saves=new SaveService(new StorageService(null));saves.startNew();saves.skipTutorial();saves.updateLobby({x:1468});
  const run=saves.beginEndless()!;
  saves.checkpointEndless(run.id,{...run,playerX:COMBAT.minX,enemyX:COMBAT.maxX,stamina});
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:GAME.storage.session,value:saves.current});
  await page.goto('/');await page.locator('#continue-game').click();
  await expect(page.locator('#world-focus')).toHaveAttribute('data-player-x',/\d+/);
  await page.keyboard.press('e');await expect(page.locator('#ui')).toHaveAttribute('data-screen','dojo');
  await walkTo(page,COMBAT.centerX);await page.keyboard.press('e');
  await expect(page.locator('#combat-focus')).toHaveAttribute('data-phase','fighting');
}
async function bufferWindow(page:Page):Promise<void> {
  await expect.poll(async()=>page.locator('#combat-focus').evaluate(el=>{
    return {action:el.getAttribute('data-player-action'),ms:Number(el.getAttribute('data-action-ms'))};
  }).then(s=>s.action==='attack' && s.ms>=attackDuration(0)-COMBAT.comboBufferMs+25 && s.ms<attackDuration(0)-45),{intervals:[15],timeout:2500}).toBe(true);
}
test('реальные клавиши: удержанный блок медленно восстанавливает силы, удар тратит уменьшенную стоимость',async({page})=>{
  await start(page);const arena=page.locator('#combat-focus');
  await page.keyboard.down('Space');await expect(arena).toHaveAttribute('data-player-action','block');
  const before=Number(await arena.getAttribute('data-stamina'));
  await page.waitForTimeout(1100);
  const restored=Number(await arena.getAttribute('data-stamina'));
  expect(restored-before).toBeGreaterThanOrEqual(4);expect(restored-before).toBeLessThanOrEqual(7);
  await page.keyboard.up('Space');const ready=Number(await arena.getAttribute('data-stamina'));
  await page.keyboard.press('q');await expect(arena).toHaveAttribute('data-player-action','attack');
  const spent=ready-Number(await arena.getAttribute('data-stamina'));
  expect(spent).toBeGreaterThanOrEqual(ATTACK_SLOTS[0].stamina-1);expect(spent).toBeLessThanOrEqual(ATTACK_SLOTS[0].stamina);
});
test('короткая команда связывает удары, а пауза очищает очередь вместо отложенной атаки',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page,90);const arena=page.locator('#combat-focus');
  await page.keyboard.press('q');await expect(arena).toHaveAttribute('data-player-action','attack');
  await bufferWindow(page);await page.keyboard.press('w');
  await expect(arena).toHaveAttribute('data-slot','1');await expect(arena).toHaveAttribute('data-combo','2');
  await expect(arena).toHaveAttribute('data-player-action','idle');
  await page.keyboard.press('q');await bufferWindow(page);await page.keyboard.press('w');
  await expect(arena).toHaveAttribute('data-buffered-slot','1');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
  await expect(arena).toHaveAttribute('data-buffered-slot','');
  await page.waitForTimeout(350);await page.locator('.combat-pause .dialog-done[data-close]').click();
  await expect(arena).toHaveAttribute('data-player-action','idle');
  await expect(arena).toHaveAttribute('data-slot','0');expect(errors).toEqual([]);
});

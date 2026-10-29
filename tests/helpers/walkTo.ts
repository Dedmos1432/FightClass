import { expect, type Page } from '@playwright/test';

/** Drive real keys and correct overshoot if a busy browser delays key release. */
export async function walkTo(page: Page, target: number): Promise<void> {
  const player=page.locator('#world-focus');
  const position=async()=>Number(await player.getAttribute('data-player-x'));
  await expect(player).toHaveAttribute('data-player-x',/\d+/);
  for(let attempt=0;attempt<5;attempt++) {
    const current=await position();
    if(Math.abs(current-target)<=75) break;
    const right=current<target,key=right?'d':'a';
    await page.keyboard.down(key);
    try {
      await expect.poll(position,{intervals:[25],timeout:12_000})[right?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](target+(right?-55:55));
    } finally { await page.keyboard.up(key); }
    await expect(player).toHaveAttribute('data-animation',/idle/);
  }
  expect(Math.abs(await position()-target)).toBeLessThanOrEqual(100);
}

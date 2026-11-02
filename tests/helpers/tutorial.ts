import { expect, type Page } from '@playwright/test';

/** Older feature scenarios opt out through the real onboarding UI. */
export async function skipTutorial(page:Page):Promise<void> {
  await expect(page.locator('#ui')).toHaveAttribute('data-screen','tutorial',{timeout:25_000});
  await page.locator('#tutorial-skip').click();
}

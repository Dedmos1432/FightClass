import type Phaser from 'phaser';
import rawManifest from './combatManifest.json' with { type: 'json' };
import type { FighterSkin } from '../combat/Opponents';

interface FrameMeta { page: string; ox: number; oy: number }
export const combatManifest = rawManifest as {
  pages: string[]; frames: Record<string, FrameMeta>;
  characters: Record<FighterSkin, Record<string, string[]>>;
};
export const ENDLESS_COMBAT_SKINS = ['player', 'kim', 'kwon', 'yeo'] as const;

/** A career bout only needs its two fighters, not the entire twelve-person roster. */
export function combatPagesFor(skins: readonly FighterSkin[]): string[] {
  const wanted = new Set(skins);
  return combatManifest.pages.filter(page => wanted.has(page.replace(/-\d+$/, '') as FighterSkin));
}

/** Call during the next combat scene's preload, after the prior scene has shut down.
 * Phaser textures outlive scenes: remove unused atlases to release their GPU memory.
 * Only manifest-owned combat pages are eligible; room and exploration assets survive.
 */
export function prepareCombatTextures(
  textures: { exists(key: string): boolean; remove(key: string): unknown },
  skins: readonly FighterSkin[],
): string[] {
  const pages = combatPagesFor(skins), wanted = new Set(pages);
  for (const page of combatManifest.pages) {
    if (!wanted.has(page) && textures.exists(page)) textures.remove(page);
  }
  return pages;
}

export function preloadCombat(scene: Phaser.Scene, skins: readonly FighterSkin[] = ENDLESS_COMBAT_SKINS): void {
  const ui = document.querySelector<HTMLElement>('#ui')!;
  ui.dataset.screen = 'loading';
  ui.innerHTML = '<div class="loading-screen"><p>FIGHT CLASS</p><progress aria-label="Загрузка бойцов" max="1" value="0"></progress><small>ПОДГОТОВКА К ПОЕДИНКУ</small></div>';
  const progress = (value: number): void => { ui.querySelector('progress')?.setAttribute('value', String(value)); };
  const failure = (): void => {
    ui.dataset.screen = 'load-error';
    ui.innerHTML = '<div class="loading-screen"><h1>Не удалось загрузить бойцов</h1><p>Прогресс сохранён.</p><button class="button primary" id="retry-combat">Повторить загрузку</button></div>';
    ui.querySelector('#retry-combat')?.addEventListener('click', () => window.location.reload());
  };
  scene.load.on('progress', progress); scene.load.once('loaderror', failure);
  scene.events.once('shutdown', () => { scene.load.off('progress', progress); scene.load.off('loaderror', failure); });
  for (const page of prepareCombatTextures(scene.textures, skins)) {
    if (!scene.textures.exists(page)) scene.load.atlas(page, `${import.meta.env.BASE_URL}combat/${page}.png`, `${import.meta.env.BASE_URL}combat/${page}.json`);
  }
}

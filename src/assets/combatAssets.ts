import type Phaser from 'phaser';
import rawManifest from './combatManifest.json';
import type { FighterSkin } from '../combat/Opponents';

interface FrameMeta { page: string; ox: number; oy: number }
export const combatManifest = rawManifest as {
  pages: string[]; frames: Record<string, FrameMeta>;
  characters: Record<FighterSkin, Record<string, string[]>>;
};
export function preloadCombat(scene: Phaser.Scene): void {
  const ui = document.querySelector<HTMLElement>('#ui')!;
  ui.dataset.screen = 'loading';
  ui.innerHTML = '<div class="loading-screen"><p>FIGHT CLASS</p><progress aria-label="Загрузка бойцов" max="1" value="0"></progress><small>ПОДГОТОВКА К ПОЕДИНКУ</small></div>';
  const progress = (value: number): void => { ui.querySelector('progress')?.setAttribute('value', String(value)); };
  const failure = (): void => {
    ui.dataset.screen = 'load-error';
    ui.innerHTML = '<div class="loading-screen"><h1>Не удалось загрузить бойцов</h1><p>Серия сохранена.</p><button class="button primary" id="retry-combat">Повторить загрузку</button></div>';
    ui.querySelector('#retry-combat')?.addEventListener('click', () => window.location.reload());
  };
  scene.load.on('progress', progress); scene.load.once('loaderror', failure);
  scene.events.once('shutdown', () => { scene.load.off('progress', progress); scene.load.off('loaderror', failure); });
  for (const page of combatManifest.pages) {
    if (!scene.textures.exists(page)) scene.load.atlas(page, `${import.meta.env.BASE_URL}combat/${page}.png`, `${import.meta.env.BASE_URL}combat/${page}.json`);
  }
}

import type Phaser from 'phaser';
import arenaUrl from '../../assets/optimized/arena.webp?url';

export const CAREER_ARENA_KEY = 'career-underground-arena';

export function preloadCareerArena(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CAREER_ARENA_KEY)) {
    scene.load.image({ key: CAREER_ARENA_KEY, url: arenaUrl, xhrSettings: { responseType: 'blob', timeout: 20000 } });
  }
}

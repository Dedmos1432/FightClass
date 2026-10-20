import Phaser from 'phaser';
import benchUrl from '../../resourse/assets/gym/bench_press_front_scaled.png?url';

// Every second press frame still gives 49 lift poses, with less texture memory.
const frames = import.meta.glob<string>([
  '../../resourse/assets/gym/with_bench/*.png',
  '../../resourse/assets/gym/get_up/*.png',
  '../../resourse/assets/gym/press/press_*[02468].png',
], { eager: true, query: '?url', import: 'default' });

export function preloadGym(scene: Phaser.Scene): void {
  if (!scene.textures.exists('gym-bench')) scene.load.image({ key: 'gym-bench', url: benchUrl, xhrSettings: { responseType: 'blob', timeout: 20000 } });
  for (const [path, url] of Object.entries(frames)) {
    const file = path.split('/').at(-1)!.replace('.png', '');
    const key = `gym-${file}`;
    if (!scene.textures.exists(key)) scene.load.image({ key, url, xhrSettings: { responseType: 'blob', timeout: 20000 } });
  }
}

export function pressTexture(frame: number): string {
  const sampled = Math.max(0, Math.min(96, Math.round(frame / 2) * 2));
  return `gym-press_${String(sampled).padStart(3, '0')}`;
}

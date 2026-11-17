import Phaser from 'phaser';
import { queueGroup } from './deliveryAssets';

export function preloadGym(scene: Phaser.Scene): void {
  queueGroup(scene, 'gym');
}

export function pressTexture(frame: number): string {
  const sampled = Math.max(0, Math.min(96, Math.round(frame / 2) * 2));
  return `gym-press_${String(sampled).padStart(3, '0')}`;
}

import rawManifest from './deliveryManifest.json' with { type: 'json' };

interface DeliveryManifest {
  groups: { exploration: string[]; gym: string[] };
  frames: Record<string, string>;
  pages: Record<string, { image: string; data: string }>;
  portraits: Record<string, string>;
}
interface AtlasLoader {
  textures: { exists(key: string): boolean };
  load: { atlas(key: string, image: string, data: string): unknown };
}
export const deliveryManifest = rawManifest as DeliveryManifest;
let urls: Record<string, string> | undefined;

/** Vite emits only the delivery assets, with content hashes and the configured base. */
export function imageURL(path: string): string {
  // Pure Node asset checks use source paths; browsers always use Vite's emitted URLs.
  if (import.meta.env?.BASE_URL === undefined) return `/assets/delivery/${path}`;
  urls ??= import.meta.glob<string>('../../assets/delivery/{combat,exploration,gym,portraits}/**/*.{webp,json}', {
    eager: true, query: '?url', import: 'default',
  });
  const url = urls[`../../assets/delivery/${path}`];
  if (!url) throw new Error(`Missing delivery asset ${path}`);
  return url;
}

export function textureRef(frame: string): { key: string; frame: string } {
  const key = deliveryManifest.frames[frame];
  if (!key) throw new Error(`Missing delivery frame ${frame}`);
  return { key, frame };
}

export function queueDeliveryAtlases(scene: AtlasLoader, pages: readonly string[]): boolean {
  let queued = false;
  for (const key of pages) {
    if (scene.textures.exists(key)) continue;
    const page = deliveryManifest.pages[key];
    if (!page) throw new Error(`Missing delivery atlas ${key}`);
    scene.load.atlas(key, imageURL(page.image), imageURL(page.data));
    queued = true;
  }
  return queued;
}

export function queueGroup(scene: AtlasLoader, group: keyof DeliveryManifest['groups']): boolean {
  return queueDeliveryAtlases(scene, deliveryManifest.groups[group]);
}

export function portraitURL(skin: string): string {
  const path = deliveryManifest.portraits[skin];
  if (!path) throw new Error(`Missing portrait ${skin}`);
  return imageURL(path);
}

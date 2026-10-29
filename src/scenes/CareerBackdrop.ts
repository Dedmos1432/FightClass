import Phaser from 'phaser';
import { CAREER_ARENA_KEY } from '../assets/careerAssets';
import { WORLD } from '../config/lobby';

type Point = { x: number; y: number };

/** A perspective octagon with a matte canvas, rear cage and open spectator-side view.
 * The fighting line at y=910 lies inside the canvas over the entire combat width.
 * Geometry is drawn once; it does not add per-frame texture work or physics bodies.
 */
export class CareerBackdrop {
  constructor(scene: Phaser.Scene) {
    const top = WORLD.height * .16;
    scene.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x101214).setOrigin(0);
    scene.add.image(0, top, CAREER_ARENA_KEY).setOrigin(0).setDisplaySize(WORLD.width, WORLD.height - top);
    const g = scene.add.graphics().setDepth(2);
    const floor: Point[] = [
      { x: 390, y: 740 }, { x: 1530, y: 740 }, { x: 1810, y: 820 }, { x: 1810, y: 975 },
      { x: 1530, y: 1055 }, { x: 390, y: 1055 }, { x: 110, y: 975 }, { x: 110, y: 820 },
    ];
    const underlay = floor.map(p => ({ x: p.x, y: p.y + 15 }));
    g.fillStyle(0x080a0b, .7).fillPoints(underlay, true);
    g.fillStyle(0x68665e).fillPoints(floor, true);
    g.lineStyle(11, 0x242829).strokePoints(floor, true);
    g.lineStyle(3, 0xafa796, .6).strokePoints(floor, true);

    // Seeded scuffs and weave make the mat read as worn fabric, rather than a UI panel.
    const polygon = new Phaser.Geom.Polygon(floor);
    let seed = 137;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 2700; i++) {
      const x = 100 + random() * 1720, y = 735 + random() * 325;
      if (!Phaser.Geom.Polygon.Contains(polygon, x, y)) continue;
      g.fillStyle(i % 3 ? 0xccc4b2 : 0x252927, i % 3 ? .07 : .13);
      g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2 + Math.floor(random() * 7), 2);
    }
    const inner = floor.map(p => ({ x: 960 + (p.x - 960) * .91, y: 895 + (p.y - 895) * .87 }));
    g.lineStyle(3, 0xc9bfaa, .33).strokePoints(inner, true);
    g.lineStyle(4, 0xc9bfaa, .3).strokeEllipse(960, 895, 325, 110);
    g.lineStyle(3, 0x383b37, .35).lineBetween(960, 753, 960, 1043);
    g.fillStyle(0x9c3d33, .8).fillTriangle(330, 835, 380, 815, 380, 850);
    g.fillStyle(0xcac1af, .65).fillTriangle(1590, 835, 1540, 815, 1540, 850);

    // The rear panels sit behind the fighters; the front has only a low padded lip,
    // keeping attack silhouettes and feet readable in this side-view game.
    for (const [a, b] of [[floor[7], floor[0]], [floor[0], floor[1]], [floor[1], floor[2]]]) this.fence(g, a, b);
    for (const p of [floor[7], floor[0], floor[1], floor[2]]) {
      g.lineStyle(12, 0x11191c).lineBetween(p.x, p.y - 236, p.x, p.y + 2);
      g.lineStyle(3, 0x8c8b80, .6).lineBetween(p.x - 3, p.y - 230, p.x - 3, p.y);
      g.fillStyle(p.x < 960 ? 0x82372f : 0x464d4b).fillRect(p.x - 10, p.y - 208, 20, 80);
    }
    g.lineStyle(12, 0x1b2123).lineBetween(110, 975, 390, 1055).lineBetween(390, 1055, 1530, 1055).lineBetween(1530, 1055, 1810, 975);
    g.lineStyle(2, 0xaaa18e, .45).lineBetween(390, 1049, 1530, 1049);
    scene.add.text(960, 874, 'FIGHT CLASS', {
      fontFamily: 'Oswald, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#c5bba6',
    }).setOrigin(.5).setScale(1, .42).setAlpha(.32).setDepth(3);
  }

  private fence(g: Phaser.GameObjects.Graphics, a: Point, b: Point): void {
    const height = 230, width = Math.hypot(b.x - a.x, b.y - a.y);
    const point = (x: number, y: number): Point => ({ x: a.x + (b.x - a.x) * x / width, y: a.y + (b.y - a.y) * x / width - height + y });
    g.fillStyle(0x080e10, .15).fillPoints([a, b, { x: b.x, y: b.y - height }, { x: a.x, y: a.y - height }], true);
    g.lineStyle(1, 0xa39e8a, .21);
    for (let d = -height; d <= width; d += 25) {
      const start = point(Math.max(0, d), Math.max(0, -d));
      const end = point(Math.min(width, d + height), Math.min(height, width - d));
      g.lineBetween(start.x, start.y, end.x, end.y);
      const reflectedStart = point(Math.max(0, d), height - Math.max(0, -d));
      const reflectedEnd = point(Math.min(width, d + height), height - Math.min(height, width - d));
      g.lineBetween(reflectedStart.x, reflectedStart.y, reflectedEnd.x, reflectedEnd.y);
    }
    g.lineStyle(9, 0x1c2528).lineBetween(a.x, a.y - height, b.x, b.y - height);
    g.lineStyle(2, 0xa69d87, .55).lineBetween(a.x, a.y - height - 3, b.x, b.y - height - 3);
    g.lineStyle(5, 0x1c2528).lineBetween(a.x, a.y, b.x, b.y);
  }
}

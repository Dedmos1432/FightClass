import type Phaser from 'phaser';

let fontReady: Promise<FontFace[]> | undefined;

/** Canvas labels use the same bundled type as the UI and are redrawn if it loads late. */
export function worldLettering(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
  const label = scene.add.text(x, y, text, {
    fontFamily: 'Oswald, Arial Narrow, sans-serif',
    fontStyle: 'bold',
    color: '#f1e7d5',
    stroke: '#171311',
    strokeThickness: 2,
    ...style,
  });
  fontReady ??= document.fonts.load('700 20px Oswald', 'Fight Class · БОЙ').catch(() => []);
  void fontReady.then(fonts => { if (fonts.length && label.active) label.updateText(); });
  return label;
}

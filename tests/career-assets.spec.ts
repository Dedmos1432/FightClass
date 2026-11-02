import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { combatManifest, combatPagesFor, prepareCombatTextures, queueCombatAtlases, ENDLESS_COMBAT_SKINS } from '../src/assets/combatAssets';
import { ENEMY_SKINS, type FighterSkin } from '../src/combat/Opponents';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}
interface Atlas {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number } };
}
const asset = (page: string, extension: string) => new URL(`../public/combat/${page}.${extension}`, import.meta.url);

test('каждый карьерный боец имеет собственные атаки и общие анимации в обоих направлениях; Kim без уклонения', () => {
  expect(ENEMY_SKINS).toEqual(['kim','kwon','yeo','shim','bang','jang','cha','young','sunny','lee','yang','maria']);
  for (const skin of ENEMY_SKINS) {
    const clips = combatManifest.characters[skin];
    for (const action of ['idle','walk','retreat','block','hit','ko','attack0','attack1','attack2', ...(skin === 'kim' ? [] : ['dodge'])]) {
      for (const direction of ['left','right']) {
        const keys = clips[`${action}-${direction}`];
        expect(keys?.length, `${skin}/${action}/${direction}`).toBeGreaterThan(1);
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of keys) {
          expect(key.startsWith(`${skin}:${action}:${direction}:`), key).toBe(true);
          expect(combatManifest.frames[key], key).toBeDefined();
          expect(combatManifest.frames[key].page.startsWith(`${skin}-`), key).toBe(true);
        }
      }
    }
    if (skin === 'kim') {
      expect(clips['dodge-left']).toBeUndefined();
      expect(clips['dodge-right']).toBeUndefined();
    }
  }
});

test('все страницы PNG/JSON существуют, размеры совпадают, кадры не выходят за текстуру и имеют конечные опорные точки', () => {
  const pages = combatManifest.pages;
  expect(new Set(pages).size).toBe(pages.length);
  const referenced = new Set<string>();
  for (const clips of Object.values(combatManifest.characters)) {
    for (const keys of Object.values(clips)) for (const key of keys) referenced.add(key);
  }
  expect([...referenced].sort()).toEqual(Object.keys(combatManifest.frames).sort());
  const packed = new Set<string>();
  for (const page of pages) {
    const atlas = JSON.parse(readFileSync(asset(page, 'json'), 'utf8')) as Atlas;
    const png = readFileSync(asset(page, 'png'));
    expect(png.subarray(0, 8).toString('hex'), page).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    expect(atlas.meta.image).toBe(`${page}.png`);
    expect(atlas.meta.size).toEqual({ w: width, h: height });
    expect(Object.keys(atlas.frames).length).toBeGreaterThan(0);
    for (const [key, record] of Object.entries(atlas.frames)) {
      assert(!packed.has(key), `duplicate frame ${key}`);
      packed.add(key);
      const frame = record.frame, origin = combatManifest.frames[key];
      assert(origin, `missing frame metadata ${key}`);
      assert.equal(origin.page, page, key);
      assert(Number.isFinite(origin.ox) && Number.isFinite(origin.oy), `non-finite origin ${key}`);
      for (const dimension of [frame.x, frame.y, frame.w, frame.h]) assert(Number.isInteger(dimension), `non-integer packing ${key}`);
      assert(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0, `invalid frame rectangle ${key}`);
      assert(frame.x + frame.w <= width && frame.y + frame.h <= height, `frame outside texture ${key}`);
      assert.deepEqual(record.sourceSize, { w: frame.w, h: frame.h }, `trimmed dimensions ${key}`);
    }
  }
  expect([...packed].sort()).toEqual([...referenced].sort());
});

test('бой загружает только двух участников; каталог бесконечного режима включает шесть моделей без боссов', () => {
  for (const skin of ENEMY_SKINS) {
    const wanted: FighterSkin[] = ['player', skin];
    const pages = combatPagesFor(wanted);
    expect(pages).toEqual(combatPagesFor([...wanted, skin, 'player']));
    expect(new Set(pages).size).toBe(pages.length);
    const expected = new Set<string>();
    for (const fighter of wanted) for (const keys of Object.values(combatManifest.characters[fighter])) {
      for (const key of keys) expected.add(combatManifest.frames[key].page);
    }
    expect([...pages].sort()).toEqual([...expected].sort());
    for (const page of pages) expect(wanted.includes(page.replace(/-\d+$/, '') as FighterSkin), page).toBe(true);
  }
  const endless = combatPagesFor(ENDLESS_COMBAT_SKINS);
  expect(endless).toHaveLength(29);
  expect(endless.every(page => /^(player|kim|kwon|yeo|bang|jang|cha)-\d+$/.test(page))).toBe(true);
  expect(combatPagesFor([])).toEqual([]);
});

test('смена карьерных боёв освобождает старые атласы, сохраняет общие страницы и чужие текстуры без роста кеша', () => {
  const foreign = ['background-lobby','player-idle-right-01','bench-press','__WHITE'];
  const resident = new Set([...combatManifest.pages, ...foreign]);
  const removed: string[] = [];
  const textures = {
    exists: (key: string) => resident.has(key),
    remove: (key: string) => { assert(resident.has(key), `attempt to remove missing ${key}`); removed.push(key); resident.delete(key); },
  };
  const enterMatch = (skins: readonly FighterSkin[]): void => {
    const wanted = prepareCombatTextures(textures, skins);
    expect(wanted).toEqual(combatPagesFor(skins));
    // Simulate the loader completing the new pages after old scene objects were destroyed.
    for (const page of wanted) resident.add(page);
    expect([...resident].sort()).toEqual([...wanted, ...foreign].sort());
    const after = [...resident], removals = removed.length;
    expect(prepareCombatTextures(textures, skins)).toEqual(wanted);
    expect([...resident]).toEqual(after);
    expect(removed).toHaveLength(removals);
  };
  enterMatch(['player','kim']);
  for (const skin of ['shim','maria','kim','yang','maria'] as const) enterMatch(['player',skin]);
  for(const skin of ENDLESS_COMBAT_SKINS) if(skin!=='player') {
    enterMatch(['player',skin]);
    expect(resident.size).toBe(combatPagesFor(['player',skin]).length + foreign.length);
  }
  expect(removed.some(key => key.startsWith('maria-'))).toBe(true);
  expect(removed.some(key => key.startsWith('player-'))).toBe(false);
  expect(removed.some(key => foreign.includes(key))).toBe(false);
});

test('предзагрузка следующей волны добавляет только недостающие страницы и сохраняет текущую анимацию до смены бойцов', () => {
  const resident=new Set(combatPagesFor(['player','bang']));
  const queued: string[]=[];
  const loader={
    textures:{exists:(key:string)=>resident.has(key)},
    load:{atlas:(key:string,png:string,json:string)=>{
      expect(png).toBe(`/combat/${key}.png`); expect(json).toBe(`/combat/${key}.json`);
      queued.push(key);
    }},
  };
  expect(queueCombatAtlases(loader,['player','bang'])).toBe(false);
  expect(queued).toEqual([]);
  expect(queueCombatAtlases(loader,['player','jang'])).toBe(true);
  expect(queued).toEqual(combatPagesFor(['jang']));
  expect(resident.size).toBe(combatPagesFor(['player','bang']).length);
  for(const page of queued) resident.add(page);
  const textures={exists:(key:string)=>resident.has(key),remove:(key:string)=>resident.delete(key)};
  prepareCombatTextures(textures,['player','jang']);
  expect([...resident].sort()).toEqual(combatPagesFor(['player','jang']).sort());
  expect(queueCombatAtlases(loader,['player','jang'])).toBe(false);
});

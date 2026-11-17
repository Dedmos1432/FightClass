import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Rect { x:number; y:number; w:number; h:number }
interface AtlasFrame { frame:Rect; rotated:boolean; sourceSize:{w:number;h:number}; spriteSourceSize:Rect; trimmed:boolean }
interface Atlas { frames:Record<string,AtlasFrame>;meta:{image:string;size:{w:number;h:number}} }
interface DeliveryManifest {
  groups:{exploration:string[];gym:string[]};
  frames:Record<string,string>;
  pages:Record<string,{image:string;data:string}>;
  portraits:Record<string,string>;
}
const root=fileURLToPath(new URL('../',import.meta.url));
const deliveryRoot=join(root,'assets/delivery');
const json=<T>(path:string):T=>JSON.parse(readFileSync(path,'utf8')) as T;
const manifest=()=>json<DeliveryManifest>(join(root,'src/assets/deliveryManifest.json'));
const local=(path:string):string=>{
  const target=resolve(deliveryRoot,path);
  assert(target.startsWith(deliveryRoot+sep),`delivery path escapes asset directory: ${path}`);
  return target;
};
function losslessWebp(path:string):{w:number;h:number} {
  const bytes=readFileSync(path);
  assert.equal(bytes.toString('ascii',0,4),'RIFF',path);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',path);
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,`truncated WebP: ${path}`);
  for(let offset=12;offset+8<=bytes.length;){
    const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);
    assert(offset+8+size<=bytes.length,`invalid chunk: ${path}`);
    assert.notEqual(type,'VP8 ',`lossy WebP is forbidden: ${path}`);
    if(type==='VP8L'){
      assert.equal(bytes[offset+8],0x2f,`invalid lossless header: ${path}`);
      const bits=bytes.readUInt32LE(offset+9);
      return {w:(bits&0x3fff)+1,h:((bits>>>14)&0x3fff)+1};
    }
    offset+=8+size+(size%2);
  }
  throw new Error(`No lossless image chunk: ${path}`);
}
function pngSize(path:string):{w:number;h:number} {
  const bytes=readFileSync(path);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',path);
  return {w:bytes.readUInt32BE(16),h:bytes.readUInt32BE(20)};
}
function explorationSources():Map<string,string> {
  const sources=new Map<string,string>();
  for(const state of ['idle','walk'])for(const direction of ['left','right'])for(let frame=1;frame<=8;frame++){
    const index=String(frame).padStart(2,'0');
    sources.set(`player-${state}-${direction}-${index}`,join(root,`resourse/player/${state}/${state}_${direction}/${state}_${direction}_${index}.png`));
  }
  return sources;
}
function gymSources():Map<string,string> {
  const sources=new Map([['gym-bench',join(root,'resourse/assets/gym/bench_press_front_scaled.png')]]);
  for(const directory of ['with_bench','get_up','press']){
    const folder=join(root,'resourse/assets/gym',directory);
    for(const file of readdirSync(folder).filter(file=>file.endsWith('.png'))){
      if(directory==='press' && Number(file.match(/\d+/)?.[0])%2!==0)continue;
      sources.set(`gym-${file.replace('.png','')}`,join(folder,file));
    }
  }
  return sources;
}

test('delivery: каждая страница lossless WebP корректна, кадры остаются внутри атласов до 2048px',()=>{
  const delivery=manifest(),seen=new Set<string>();
  for(const [page,paths] of Object.entries(delivery.pages)){
    const dimensions=losslessWebp(local(paths.image));
    const atlas=json<Atlas>(local(paths.data));
    expect(atlas.meta.size,page).toEqual(dimensions);
    expect(atlas.meta.image,page).toBe(basename(paths.image));
    expect(dimensions.w,page).toBeLessThanOrEqual(2048);expect(dimensions.h,page).toBeLessThanOrEqual(2048);
    expect(Object.keys(atlas.frames).length,page).toBeGreaterThan(0);
    for(const [key,record] of Object.entries(atlas.frames)){
      assert(!seen.has(key),`duplicate frame ${key}`);seen.add(key);
      assert.equal(record.rotated,false,`rotated frame changes existing animation: ${key}`);
      const box=record.frame;
      for(const value of Object.values(box))assert(Number.isInteger(value),`non-integer rect: ${key}`);
      assert(box.x>=0&&box.y>=0&&box.w>0&&box.h>0,`invalid rect: ${key}`);
      assert(box.x+box.w<=dimensions.w&&box.y+box.h<=dimensions.h,`frame outside atlas: ${key}`);
    }
  }
});

test('delivery: все 32 кадра ходьбы и стойки и 97 кадров жима со скамьёй сохраняют исходный размер и смещение',()=>{
  const delivery=manifest(),sourceGroups={exploration:explorationSources(),gym:gymSources()};
  expect(sourceGroups.exploration.size).toBe(32);expect(sourceGroups.gym.size).toBe(98);
  const packed=new Set<string>();
  for(const group of ['exploration','gym'] as const){
    const expected=sourceGroups[group],actual=new Set<string>();
    expect(new Set(delivery.groups[group]).size).toBe(delivery.groups[group].length);
    for(const page of delivery.groups[group]){
      const paths=delivery.pages[page];assert(paths,`missing group page: ${page}`);
      for(const [key,record] of Object.entries(json<Atlas>(local(paths.data)).frames)){
        assert(!actual.has(key),`duplicate group frame: ${key}`);actual.add(key);packed.add(key);
        assert.equal(delivery.frames[key],page,`wrong page reference: ${key}`);
        const source=expected.get(key);assert(source,`unexpected frame ${key}`);
        expect(record.sourceSize,key).toEqual(pngSize(source));
        const crop=record.spriteSourceSize;
        expect({w:crop.w,h:crop.h},key).toEqual({w:record.frame.w,h:record.frame.h});
        assert(crop.x>=0&&crop.y>=0&&crop.x+crop.w<=record.sourceSize.w&&crop.y+crop.h<=record.sourceSize.h,`crop loses source placement: ${key}`);
      }
    }
    expect([...actual].sort(),group).toEqual([...expected.keys()].sort());
  }
  expect([...packed].sort()).toEqual(Object.keys(delivery.frames).sort());
});

test('delivery: боевые кадры всех бойцов сохраняют точную геометрию и имена оригинальных атласов',()=>{
  const delivery=manifest();
  const combat=json<{pages:string[];characters:Record<string,Record<string,string[]>>;frames:Record<string,{page:string}>}>(join(root,'src/assets/combatManifest.json'));
  const referenced=new Set(Object.values(combat.characters).flatMap(clips=>Object.values(clips).flat()));
  const delivered=new Set<string>();
  for(const page of combat.pages){
    const paths=delivery.pages[page];assert(paths,`missing fighter page: ${page}`);
    const original=json<Atlas>(join(root,'public/combat',`${page}.json`));
    const optimized=json<Atlas>(local(paths.data));
    expect(optimized.frames,page).toEqual(original.frames);
    for(const key of Object.keys(optimized.frames)){
      assert.equal(combat.frames[key]?.page,page,`wrong combat page: ${key}`);delivered.add(key);
    }
  }
  expect([...delivered].sort()).toEqual([...referenced].sort());
  for(const skin of Object.keys(combat.characters).filter(skin=>skin!=='player')){
    assert(delivery.portraits[skin],`missing board portrait ${skin}`);
    const portrait=losslessWebp(local(delivery.portraits[skin]));
    assert(portrait.w>0&&portrait.h>0,`empty portrait ${skin}`);
  }
});

test('delivery: атласы и портреты заметно меньше исходных ресурсов без потери кадров',()=>{
  const delivery=manifest(),outputs=new Set<string>();
  for(const page of Object.values(delivery.pages)){outputs.add(local(page.image));outputs.add(local(page.data));}
  for(const portrait of Object.values(delivery.portraits))outputs.add(local(portrait));
  const bytes=[...outputs].reduce((sum,path)=>sum+statSync(path).size,0);
  const sources=[...explorationSources().values(),...gymSources().values(),...readdirSync(join(root,'public/combat')).filter(name=>/\.(png|json)$/.test(name)).map(name=>join(root,'public/combat',name))];
  const originalBytes=sources.reduce((sum,path)=>sum+statSync(path).size,0);
  expect(bytes,'delivery assets must retain at least 15% savings over legacy resources').toBeLessThan(originalBytes*.85);
  expect(bytes,'gross asset-size regression').toBeLessThan(43_000_000);
});

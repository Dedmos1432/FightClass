"""Pack original combat frames without changing sources. Requires Pillow.
Run from repository root: python tools/build_combat_atlases.py
Crops transparent margins and scales to the game's on-screen resolution.
Metadata preserves a common body root, ground level, and airborne poses.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/combat'
OUT.mkdir(parents=True, exist_ok=True)
COMMON = {
 'idle': 'ilde_fight', 'walk': 'combat_move/combat_move',
 'retreat': 'combat_move/combat_move_backward', 'block': 'block',
 'dodge': 'dash', 'hit': 'get_hit', 'ko': 'defeat',
}
MOVES = {
 'jab':'Boxing/jab', 'hook':'Boxing/hook', 'uppercut':'Boxing/uppercut',
 'mma-jab':'MMA/jab', 'cross':'MMA/cross', 'low-kick':'MMA/low_kick',
 'axe-kick':'Taekwondo/axe_kick', 'front-kick':'Taekwondo/front_kick',
 'spinning-back-kick':'Taekwondo/spinning_back_kick', 'teep':'Muay Thai/teep',
 'roundhouse':'Muay Thai/roudhouse_kick',
 'jumping-roundhouse':'Muay Thai/jumping_roundhouse_kick',
}
ENEMIES = {
 'kim': ('kim dong won', {'idle':'idle','walk':'move/move','retreat':'move/retreat','block':'block','hit':'get_hit','ko':'defeat','attack0':'jab','attack1':'cross','attack2':'low_kick'}),
 'kwon': ('kwon tae-young', {'idle':'idle','walk':'move/move_forward','retreat':'move/move_backward','block':'block','dodge':'dash','hit':'get_hit','ko':'defeat','attack0':'gyaku tsuki','attack1':'mae_geri','attack2':'yoko_geri'}),
 'yeo': ('yeo eun-sol', {'idle':'idle','walk':'move/move_forward','retreat':'move/move_backward','block':'block','dodge':'dash','hit':'get_hit','ko':'defeat','attack0':'jab','attack1':'cross','attack2':'low_kick'}),
}
manifest = {'characters':{}, 'frames':{}, 'pages':[]}
SCALE = 0.56
SIZE = 2048
for skin in ['player', *ENEMIES]:
 if skin == 'player':
  base = ROOT/'resourse/player'
  clips = {**COMMON, **MOVES}
 else:
  folder, clips = ENEMIES[skin]
  base = ROOT/'resourse/enemy'/folder
 manifest['characters'][skin] = {}
 page = Image.new('RGBA',(SIZE,SIZE)); frames = {}; x=y=rowh=0; pageid=0
 def flush():
  if not frames: return
  key = f'{skin}-{pageid}'
  page.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT/f'{key}.png', optimize=True)
  (OUT/f'{key}.json').write_text(json.dumps({'frames':frames,'meta':{'image':f'{key}.png','size':{'w':SIZE,'h':SIZE},'scale':'1'}}),encoding='utf-8')
  manifest['pages'].append(key)
 for action, rel in clips.items():
  # The movement directory prefix selects exactly one direction, excluding retreat.
  parent = base/rel
  for direction in ['left','right']:
   if parent.is_dir() and list(parent.glob('*.png')):
    raise RuntimeError('Expected direction directories')
   if parent.is_dir():
    candidates = sorted(parent.rglob(f'*{direction}/*.png'))
   else:
    candidates = sorted(parent.parent.glob(f'{parent.name}_{direction}/*.png'))
   if action == 'walk' and skin == 'player':
    candidates = sorted((base/'combat_move'/f'combat_move_{direction}').glob('*.png'))
   if not candidates: raise RuntimeError(f'Missing {skin}/{action}/{direction}: {parent}')
   # Keep every player attack frame, limit long enemy clips to 12 sampled poses.
   indices = sorted(set(round(i*(len(candidates)-1)/(min(12,len(candidates))-1)) for i in range(min(12,len(candidates)))))
   clip=[]
   for logical, idx in enumerate(indices):
    file=candidates[idx]; image=Image.open(file).convert('RGBA'); box=image.getbbox()
    if not box: raise RuntimeError(f'Empty frame {file}')
    crop=image.crop(box)
    crop=crop.resize((max(1,round(crop.width*SCALE)),max(1,round(crop.height*SCALE))),Image.Resampling.NEAREST)
    w,h=crop.size
    if x+w+2>SIZE: x=0;y+=rowh+2;rowh=0
    if y+h+2>SIZE:
     flush(); pageid+=1;page=Image.new('RGBA',(SIZE,SIZE));frames={};x=y=rowh=0
    key=f'{skin}:{action}:{direction}:{logical}'
    page.alpha_composite(crop,(x,y))
    frames[key]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
    offset = 41.5 if skin=='player' else 20.5 if skin=='kim' else .5 if skin=='kwon' else 4.5
    anchorx=image.width/2 + (-offset if direction=='right' else offset)
    # Ground poses get a common sole line. Keep jump and fall silhouettes airborne.
    anchory=box[3] if box[3]>=590 else (604 if skin=='player' else 601)
    if action=='idle' and skin=='player': anchory=624
    manifest['frames'][key]={'page':f'{skin}-{pageid}','ox':(anchorx-box[0])*SCALE/w,'oy':(anchory-box[1])*SCALE/h}
    clip.append(key)
    x+=w+2;rowh=max(rowh,h)
   manifest['characters'][skin][f'{action}-{direction}']=clip
 flush()
(ROOT/'src/assets/combatManifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
print(f'Packed {len(manifest["frames"])} poses into {len(manifest["pages"])} pages')

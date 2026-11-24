import { expect, test } from '@playwright/test';
import { ATTACK_SLOTS, COMBAT, guardStaminaCost } from '../src/config/combat';
import { attackDuration, CombatWorld, fighter } from '../src/combat/CombatWorld';

const battle=(x=700,enemyX=920)=>new CombatWorld(
  fighter({skin:'player',x,maxHP:200,stamina:150,damage:10,speed:340,canDodge:true}),
  fighter({skin:'kim',x:enemyX,maxHP:200,stamina:150,damage:10,speed:300,canDodge:false,facing:-1,autoFace:false}),
);
const advance=(w:CombatWorld,ms:number)=>{for(let t=0;t<ms;t+=8) w.update(Math.min(8,ms-t));};

test('lighter attacks have the same damage, active windows and costs for both fighters',()=>{
  expect(ATTACK_SLOTS.map(s=>s.stamina)).toEqual([12,16,20]);
  expect(ATTACK_SLOTS.map(s=>s.active)).toEqual([100,120,140]);
  for(const slot of [0,1,2] as const) for(const side of ['player','enemy'] as const) {
    const w=battle(),f=w[side],target=side==='player'?w.enemy:w.player;
    const before=f.stamina;
    expect(w.attack(f,slot)).toBe(true);
    expect(f.stamina).toBe(before-ATTACK_SLOTS[slot].stamina);
    advance(w,ATTACK_SLOTS[slot].startup-1); expect(target.hp).toBe(200);
    advance(w,1); expect(target.hp).toBe(190);
  }
});

test('standing guard regenerates slowly and a blocked impact spends only a small guard cost',()=>{
  const w=battle(300,1400);
  w.player.stamina=50; w.enemy.stamina=50; w.player.blocking=true;
  advance(w,1000);
  expect(w.player.stamina).toBeCloseTo(55); expect(w.enemy.stamina).toBeCloseTo(68);
  const hit=battle(); hit.enemy.stamina=50; hit.enemy.blocking=true;
  hit.attack(hit.player,0); advance(hit,ATTACK_SLOTS[0].startup);
  expect(hit.enemy.hp).toBe(200);
  expect(hit.enemy.stamina).toBeCloseTo(50+COMBAT.blockRegen*ATTACK_SLOTS[0].startup/1000-guardStaminaCost(10));
  expect(guardStaminaCost(10)).toBeLessThan(ATTACK_SLOTS[0].stamina/3);
});

test('a held guard stays directional; A/D can turn it without moving, release restores auto-facing',()=>{
  const w=battle(); w.player.blocking=true; advance(w,8); expect(w.player.facing).toBe(1);
  const initialX=w.player.x;
  w.enemy.x=520; w.enemy.facing=1; advance(w,24); expect(w.player.facing).toBe(1);
  w.attack(w.enemy,0); advance(w,ATTACK_SLOTS[0].startup);
  expect(w.player.hp).toBe(190);
  w.player.blocking=true; // The scene reapplies the held Space intent after a hit.
  advance(w,COMBAT.hitStun); w.player.direction=-1; advance(w,8);
  expect(w.player.action).toBe('block'); expect(w.player.facing).toBe(-1); expect(w.player.x).toBe(initialX);
  w.player.direction=0; w.enemy.x=920; advance(w,8); expect(w.player.facing).toBe(-1);
  w.player.blocking=false; advance(w,8); expect(w.player.facing).toBe(1);
});

test('short attack tap near the end of hit stun executes exactly when recovery ends',()=>{
  const w=battle(300,1400),p=w.player;
  p.action='hit'; p.elapsed=p.stun-100;
  expect(w.attack(p,1)).toBe(true); expect(p.action).toBe('hit'); expect(p.stamina).toBe(150);
  advance(w,99); expect(p.action).toBe('hit');
  advance(w,1); expect(p.action).toBe('attack'); expect(p.slot).toBe(1); expect(p.combo).toBe(1);
  expect(p.stamina).toBe(150-ATTACK_SLOTS[1].stamina);
  advance(w,attackDuration(1)+300); expect(p.action).toBe('idle');
});

test('early inputs are rejected and accepted inputs expire instead of firing much later',()=>{
  const w=battle(300,1400),p=w.player;
  p.action='hit'; p.elapsed=0;
  expect(w.attack(p,0)).toBe(false); expect(w.dodge(p)).toBe(false);
  p.elapsed=p.stun-90; expect(w.attack(p,0)).toBe(true);
  p.stun+=500; advance(w,120);
  expect(p.buffered).toBeNull(); expect(p.bufferedDodge).toBeNull();
  advance(w,600); expect(p.action).toBe('idle'); expect(p.stamina).toBe(150);
});

test('a new hit clears the pending attack rather than carrying it through the new stun',()=>{
  const w=battle(),p=w.player;
  p.action='hit'; p.elapsed=p.stun-100; expect(w.attack(p,0)).toBe(true);
  w.enemy.action='attack'; w.enemy.slot=0; w.enemy.elapsed=ATTACK_SLOTS[0].startup-16;
  advance(w,16);
  expect(p.hp).toBe(190); expect(p.action).toBe('hit'); expect(p.buffered).toBeNull();
  advance(w,COMBAT.hitStun+300); expect(p.action).toBe('idle'); expect(p.stamina).toBe(150);
});

test('the wider combo window accepts short taps but still caps a chain at three attacks',()=>{
  const w=battle(300,1400),p=w.player;
  w.attack(p,0);
  for(const slot of [1,2] as const) {
    advance(w,attackDuration(p.slot)-COMBAT.comboBufferMs+8-p.elapsed);
    expect(w.attack(p,slot)).toBe(true);
    advance(w,attackDuration(p.slot)-p.elapsed);
    expect(p.action).toBe('attack'); expect(p.slot).toBe(slot); expect(p.combo).toBe(slot+1);
  }
  advance(w,attackDuration(p.slot)-100-p.elapsed);
  expect(w.attack(p,0)).toBe(false);
  advance(w,101); expect(p.action).toBe('idle'); expect(p.combo).toBe(0);
});

test('the last buffered command wins; dodge begins after recovery and pays its cost only once',()=>{
  const w=battle(600,1400),p=w.player;
  w.attack(p,0); advance(w,attackDuration(0)-100);
  expect(w.attack(p,1)).toBe(true); expect(w.dodge(p)).toBe(true);
  const before=p.stamina;
  advance(w,99); expect(p.action).toBe('attack'); expect(p.stamina).toBe(before);
  advance(w,1); expect(p.action).toBe('dodge'); expect(p.stamina).toBe(before-COMBAT.dodgeCost);
  expect(p.combo).toBe(0); expect(p.buffered).toBeNull();
});

test('directional dodges use the chosen side and keep their facing when crossing an opponent', () => {
  for (const direction of [-1, 1] as const) {
    const start = 960;
    for (const forward of [true, false]) {
      const w = battle(start, start + (forward ? direction : -direction) * 120);
      const p = w.player;
      expect(w.dodge(p, direction)).toBe(true);
      expect(p.dodgeForward).toBe(forward);
      expect(p.dodgeDirection).toBe(direction);
      expect(p.stamina).toBe(150 - COMBAT.dodgeCost);
      const startingFacing = p.facing;
      p.direction = -direction;
      advance(w, COMBAT.dodgeTravelMs);
      expect((p.x - start) * direction).toBeGreaterThan(120);
      expect(p.facing).toBe(startingFacing);
      expect(p.action).toBe('dodge');
      const landingX = p.x;
      p.direction = 0;
      advance(w, COMBAT.dodgeDuration - COMBAT.dodgeTravelMs);
      expect(p.x).toBe(landingX);
      expect(p.facing).toBe(-direction);
    }
  }
});

test('a buffered dodge saves the screen direction even if the opponent crosses before recovery', () => {
  const w = battle(700, 1200), p = w.player;
  w.attack(p, 0);
  advance(w, attackDuration(0) - 80);
  expect(w.dodge(p, 1)).toBe(true);
  w.enemy.x = 440;
  advance(w, 80);
  expect(p.action).toBe('dodge');
  expect(p.dodgeDirection).toBe(1);
  expect(p.dodgeForward).toBe(false);
  advance(w, 16);
  expect(p.x).toBeGreaterThan(700);
});

test('buffered attack after dodge respects the full dodge recovery and the last selected slot',()=>{
  const w=battle(700,1400),p=w.player;
  w.dodge(p); advance(w,COMBAT.dodgeDuration-110);
  expect(w.attack(p,0)).toBe(true); expect(w.attack(p,2)).toBe(true);
  advance(w,109); expect(p.action).toBe('dodge');
  advance(w,1); expect(p.action).toBe('attack'); expect(p.slot).toBe(2);
  expect(p.stamina).toBe(150-COMBAT.dodgeCost-ATTACK_SLOTS[2].stamina);
});

test('clearing the input buffer prevents an action after pause; Kim cannot buffer a dodge',()=>{
  const w=battle(300,1400),p=w.player;
  w.attack(p,0); advance(w,attackDuration(0)-80); w.attack(p,1);
  w.clearInputBuffer(p); advance(w,100); expect(p.action).toBe('idle');
  w.enemy.action='hit'; w.enemy.elapsed=w.enemy.stun-80;
  expect(w.dodge(w.enemy)).toBe(false); advance(w,100); expect(w.enemy.action).toBe('idle');
});

test('an active attack stays facing its original side but a buffered new attack can turn',()=>{
  const w=battle(700,920),p=w.player;
  w.attack(p,0); w.enemy.x=490;
  advance(w,ATTACK_SLOTS[0].startup+ATTACK_SLOTS[0].active);
  expect(p.facing).toBe(1); expect(w.enemy.hp).toBe(200);
  advance(w,attackDuration(0)-COMBAT.comboBufferMs+8-p.elapsed);
  expect(w.attack(p,1)).toBe(true); advance(w,attackDuration(0)-p.elapsed);
  expect(p.facing).toBe(-1); expect(p.action).toBe('attack');
});

test('mobile automatic guard stays idle with normal recovery until a real impact, then releases its pose',()=>{
  const w=battle(),p=w.player;
  p.autoGuard=true; p.stamina=50;
  advance(w,1000);
  expect(p.action).toBe('idle'); expect(p.guardMs).toBe(0);
  expect(p.stamina).toBeCloseTo(50+COMBAT.staminaRegen);
  const before=p.stamina;
  expect(w.attack(w.enemy,0)).toBe(true);
  advance(w,ATTACK_SLOTS[0].startup-1);
  expect(p.action).toBe('idle'); expect(p.hp).toBe(200);
  advance(w,1);
  expect(p.action).toBe('block'); expect(p.hp).toBe(200);
  expect(w.events.some(event=>event.type==='block' && event.target===p)).toBe(true);
  expect(p.stamina).toBeCloseTo(before+COMBAT.staminaRegen*ATTACK_SLOTS[0].startup/1000-guardStaminaCost(w.enemy.damage));
  expect(p.guardMs).toBe(COMBAT.autoGuardMs);
  advance(w,COMBAT.autoGuardMs+8);
  expect(p.action).toBe('idle'); expect(p.guardMs).toBe(0);
});

test('mobile automatic guard respects attack recovery, hit stun, movement and early dodge vulnerability',()=>{
  for(const action of ['idle','attack','hit','dodge'] as const) {
    const w=battle(),p=w.player;
    p.autoGuard=true;
    if(action==='idle')p.direction=-1;
    else {p.action=action;p.elapsed=action==='attack' ? ATTACK_SLOTS[0].startup+ATTACK_SLOTS[0].active : 0;}
    expect(w.attack(w.enemy,0)).toBe(true);
    w.enemy.elapsed=ATTACK_SLOTS[0].startup-8;
    w.update(8);
    expect(p.hp,action).toBe(190);
    expect(w.events.some(event=>event.type==='hit' && event.target===p),action).toBe(true);
    expect(p.guardMs,action).toBe(0);
  }
  const evade=battle(),p=evade.player;p.autoGuard=true;
  expect(evade.dodge(p)).toBe(true);p.elapsed=COMBAT.dodgeInvulnerableFrom;
  expect(evade.attack(evade.enemy,0)).toBe(true);evade.enemy.elapsed=ATTACK_SLOTS[0].startup-8;
  evade.update(8);
  expect(p.hp).toBe(200);expect(p.action).toBe('dodge');expect(p.guardMs).toBe(0);
  expect(evade.events.some(event=>event.type==='dodge' && event.target===p)).toBe(true);
});

test('automatic guard uses the normal stamina tax and guard break instead of unlimited protection',()=>{
  const w=battle(),p=w.player;
  p.autoGuard=true;p.stamina=1;
  expect(w.attack(w.enemy,0)).toBe(true);w.enemy.elapsed=ATTACK_SLOTS[0].startup-8;
  w.update(8);
  expect(p.hp).toBe(190);expect(p.action).toBe('hit');expect(p.stamina).toBe(0);
  expect(p.stun).toBe(COMBAT.guardBreakStun);
  expect(w.events.some(event=>event.type==='guard-break' && event.target===p)).toBe(true);
});

test('desktop fighters have no automatic guard and a guard does not magically cover the wrong facing',()=>{
  const desktop=battle();expect(desktop.player.autoGuard).toBe(false);
  desktop.attack(desktop.enemy,0);advance(desktop,ATTACK_SLOTS[0].startup);
  expect(desktop.player.hp).toBe(190);expect(desktop.player.action).toBe('hit');
  const rear=battle();rear.player.autoGuard=true;rear.player.autoFace=false;rear.player.facing=-1;
  rear.attack(rear.enemy,0);advance(rear,ATTACK_SLOTS[0].startup);
  expect(rear.player.hp).toBe(190);expect(rear.player.action).toBe('hit');
});

test('movement, attacks and dodges immediately interrupt the brief automatic guard pose',()=>{
  for(const input of ['move','attack','dodge'] as const) {
    const w=battle(),p=w.player;p.autoGuard=true;
    w.attack(w.enemy,0);advance(w,ATTACK_SLOTS[0].startup);
    expect(p.action).toBe('block');
    const x=p.x;p.autoGuard=false;
    if(input==='move'){
      p.direction=1;advance(w,8);expect(p.x).toBeGreaterThan(x);expect(p.action).toBe('walk');expect(p.guardMs).toBe(0);
      p.direction=0;p.autoGuard=true;advance(w,8);expect(p.action).toBe('idle');
    }
    else if(input==='attack'){expect(w.attack(p,0)).toBe(true);expect(p.action).toBe('attack');}
    else {expect(w.dodge(p)).toBe(true);expect(p.action).toBe('dodge');}
  }
});

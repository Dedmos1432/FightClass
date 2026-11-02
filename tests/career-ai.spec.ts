import { expect, test } from '@playwright/test';
import { BotBrain } from '../src/combat/BotBrain';
import { CombatWorld, enemyFighter, fighter } from '../src/combat/CombatWorld';
import { opponentAt, type Opponent } from '../src/combat/Opponents';
import { COMBAT } from '../src/config/combat';

const career = (boss = false) => ({ ...opponentAt(4), career: true, boss, skill: boss ? .98 : .8,
  reactionMs: boss ? 95 : 200, defense: .98, aggression: .9, counterPreference: .98,
  dodgePreference: .9, comboChance: .9, reserve: 30, maxHP: 300, stamina: 150, damage: 10 });
const battle = (profile: Opponent = career(), playerX = 700, enemyX = 920) => {
  const enemy = enemyFighter(profile); enemy.x = enemyX;
  return new CombatWorld(fighter({ skin: 'player', x: playerX, maxHP: 300, stamina: 150,
    damage: 10, speed: 340, canDodge: true }), enemy);
};
const advance = (world: CombatWorld, brain: BotBrain, milliseconds: number) => {
  for (let t = 0; t < milliseconds; t += 8) {
    const dt = Math.min(8, milliseconds - t); brain.update(world, dt); world.update(dt);
  }
};
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test('career bot waits for its visible reaction delay instead of reading a new attack', () => {
  const profile = career(), world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.attack(world.player, 2);
  advance(world, brain, 160);
  expect(world.enemy.action).toBe('idle'); expect(world.enemy.stamina).toBe(150);
  advance(world, brain, 80);
  expect(['block', 'dodge']).toContain(world.enemy.action);
});

test('boss evades a slow commitment with real stamina and finite invulnerability', () => {
  const profile = career(true), world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.attack(world.player, 2); advance(world, brain, 144);
  expect(world.enemy.action).toBe('dodge');
  expect(world.enemy.stamina).toBe(150 - COMBAT.dodgeCost);
  advance(world, brain, 500);
  expect(world.enemy.hp).toBe(300); expect(world.enemy.action).not.toBe('dodge');
});

test('Kim blocks a telegraphed attack and never receives a synthetic dodge', () => {
  const profile = { ...career(true), skin: 'kim' as const, canDodge: false };
  const world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.attack(world.player, 2); advance(world, brain, 144);
  expect(world.enemy.action).toBe('block');
  advance(world, brain, 250); expect(world.enemy.hp).toBe(300);
  expect(world.enemy.action).not.toBe('dodge');
});

test('new unobserved poses do not change a career decision before reaction time', () => {
  const profile = career(true), a = battle(profile, 500, 1000), b = battle(profile, 500, 1000);
  const brainA = new BotBrain(profile, () => .5), brainB = new BotBrain(profile, () => .5);
  advance(a, brainA, 220); advance(b, brainB, 220);
  b.player.x = 1100; b.player.action = 'attack'; b.player.slot = 2; b.player.elapsed = 0;
  advance(a, brainA, 64); advance(b, brainB, 64);
  expect(a.enemy.action).toBe(b.enemy.action); expect(a.enemy.facing).toBe(b.enemy.facing);
  expect(a.enemy.direction).toBe(b.enemy.direction); expect(a.enemy.stamina).toBe(b.enemy.stamina);
});

test('a career bot does not turn instantly when the player crosses behind it', () => {
  const profile = career(true), world = battle(profile, 500, 1000), brain = new BotBrain(profile, () => .99);
  advance(world, brain, 250); expect(world.enemy.facing).toBe(-1);
  world.player.x = world.enemy.x + 200; advance(world, brain, 64);
  expect(world.enemy.facing).toBe(-1);
  advance(world, brain, 160); expect(world.enemy.facing).toBe(1);
});

test('boss punishes an observed recovery with the quickest attack that reaches', () => {
  const profile = career(true), world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.player.action = 'attack'; world.player.slot = 2; world.player.elapsed = 450;
  world.player.hitLanded = true;
  advance(world, brain, 144);
  expect(brain.state).toBe('counter'); expect(world.enemy.action).toBe('attack');
  expect(world.enemy.slot).toBe(0);
});

test('career slot selection respects range instead of spending stamina on distant strikes', () => {
  const profile = career(true), world = battle(profile, 300, 1400), brain = new BotBrain(profile, () => 0);
  advance(world, brain, 700);
  expect(world.enemy.action).toBe('walk'); expect(world.enemy.stamina).toBe(150);
  expect(world.player.hp).toBe(300); expect(world.enemy.x).toBeLessThan(1400);
});

test('boss crosses a point-blank long windup with normal movement and without taking damage', () => {
  const profile = career(true), world = battle(profile, 700, 710), brain = new BotBrain(profile, () => 0);
  world.attack(world.player, 2); advance(world, brain, 144);
  expect(brain.state).toBe('flank'); expect(world.enemy.action).toBe('walk');
  advance(world, brain, 300);
  expect(world.enemy.x).toBeLessThan(world.player.x - 50); expect(world.enemy.hp).toBe(300);
  expect(world.enemy.stamina).toBe(150);
});

test('boss reacts to a visible quick jab earlier than an ordinary career opponent at equal physical stats', () => {
  const normal = career(), boss = career(true), a = battle(normal), b = battle(boss);
  const brainA = new BotBrain(normal, () => 0), brainB = new BotBrain(boss, () => 0);
  a.attack(a.player, 0); b.attack(b.player, 0);
  advance(a, brainA, 175); advance(b, brainB, 175);
  expect(a.enemy.hp).toBe(290); expect(b.enemy.hp).toBe(300);
  expect(b.enemy.action).toBe('block');
});

test('exhausted boss recovers with hysteresis and cannot summon stamina for a counter', () => {
  const profile = career(true), world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.enemy.stamina = 2;
  advance(world, brain, 200);
  expect(brain.state).toBe('recover'); expect(world.enemy.direction).toBe(1);
  expect(world.enemy.stamina).toBeCloseTo(5.6);
  advance(world, brain, 1000);
  expect(brain.state).toBe('recover'); expect(world.enemy.stamina).toBeLessThan(25);
});

test('career memory learns repeated attacks, guard habits and dodge habits from observations', () => {
  const profile = career(true), world = battle(profile, 300, 1400), brain = new BotBrain(profile, () => .99);
  for (let i = 0; i < 8; i++) {
    world.player.action = 'attack'; world.player.slot = 2; world.player.elapsed = 0; brain.update(world, 100);
    world.player.action = 'block'; brain.update(world, 200);
    world.player.action = 'dodge'; brain.update(world, 200);
  }
  brain.update(world, 200);
  expect(brain.habits.favorite).toBe(2); expect(brain.habits.repetition).toBe(1);
  expect(brain.habits.blockRate).toBeGreaterThan(.15);
  expect(brain.habits.dodgeRate).toBeGreaterThan(.15);
});

test('boss waits out an observed dodge rather than attacking its invulnerable pose', () => {
  const profile = career(true), world = battle(profile), brain = new BotBrain(profile, () => 0);
  world.dodge(world.player); advance(world, brain, 160);
  expect(world.enemy.action).not.toBe('attack'); expect(world.enemy.stamina).toBe(150);
});

test('career tactics defend more successfully than an early endless bot with identical physical stats', () => {
  const protectedDamage = (smart: boolean, seed: number) => {
    const base = smart ? career(true) : { ...opponentAt(0), maxHP: 300, stamina: 150, damage: 10, speed: career(true).speed };
    const world = battle(base), brain = new BotBrain(base, seeded(seed));
    // Repeated rounds isolate reaction/defense from positional advantages and raw HP.
    let damage = 0;
    for (let i = 0; i < 8; i++) {
      world.player.x = 700; world.enemy.x = 920; world.enemy.action = 'idle';
      world.enemy.hp = 300; world.enemy.stamina = 150; world.enemy.facing = -1;
      world.player.hp = 300; world.player.stamina = 150; world.player.action = 'idle';
      world.attack(world.player, 2); advance(world, brain, 430);
      damage += 300 - world.enemy.hp;
      world.player.action = 'idle'; advance(world, brain, 700);
    }
    return damage;
  };
  const seeds = [2, 11, 92, 440, 8001];
  const weak = seeds.reduce((sum, seed) => sum + protectedDamage(false, seed), 0);
  const strong = seeds.reduce((sum, seed) => sum + protectedDamage(true, seed), 0);
  expect(weak).toBeGreaterThan(100); expect(strong).toBeLessThan(weak * .6);
});

for (const script of ['idle', 'spam', 'guard', 'retreat', 'cross'] as const) {
  test(`boss simulation against ${script}: useful attacks, bounded resources and no positional deadlock`, () => {
    const profile = { ...career(true), maxHP: 1000, stamina: 150 }, world = battle(profile);
    world.player.hp = world.player.maxHP = 1000;
    const brain = new BotBrain(profile, seeded(641));
    let attacks = 0, hits = 0, blocks = 0, crossing = 1, invalidResources = false, outsideArena = false;
    const slots = new Set<number>();
    for (let t = 0; t < 45_000 && !world.over; t += 8) {
      const p = world.player, e = world.enemy, toward = e.x > p.x ? 1 : -1, distance = Math.abs(e.x - p.x);
      p.direction = 0; p.blocking = script === 'guard';
      if (script === 'spam') { p.direction = distance > 225 ? toward : 0; world.attack(p, 0); }
      if (script === 'retreat') p.direction = distance < 600 ? -toward : 0;
      if (script === 'cross') {
        if (t % 640 === 0) crossing = toward;
        p.direction = crossing;
        if (distance < 240) world.attack(p, 0);
      }
      const before = e.action, elapsed = e.elapsed;
      brain.update(world, 8); world.update(8);
      if (e.action === 'attack' && (before !== 'attack' || e.elapsed < elapsed)) { attacks++; slots.add(e.slot); }
      for (const event of world.events) if (event.source === e) {
        if (event.damage > 0) hits++;
        if (event.type === 'block') blocks++;
      }
      invalidResources ||= !Number.isFinite(e.stamina) || e.stamina < 0 || e.stamina > e.maxStamina;
      outsideArena ||= !Number.isFinite(e.x) || e.x < COMBAT.minX || e.x > COMBAT.maxX;
    }
    expect(attacks).toBeGreaterThan(2);
    expect(hits + blocks).toBeGreaterThan(0);
    expect(invalidResources).toBe(false); expect(outsideArena).toBe(false);
    if (script === 'idle') { expect(hits).toBeGreaterThan(4); expect(slots.size).toBeGreaterThan(1); }
    if (script === 'guard') expect(hits).toBeGreaterThan(0);
    console.info(`AI ${script}: ${attacks} attacks, ${hits} hits, ${blocks} blocks, slots ${[...slots]}`);
  });
}

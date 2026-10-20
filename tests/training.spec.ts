import { test, expect } from '@playwright/test';
import { GAME } from '../src/config/game';
import { BENCH } from '../src/config/training';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { StorageService, type StorageLike } from '../src/services/StorageService';
import { BenchPressQte } from '../src/training/BenchPressQte';
import { freshTraining, repsToNextGain, restoredStats, trainingAttributes } from '../src/training/Progression';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function game(backing = new MemoryStorage()): SaveService {
  const saves = new SaveService(new StorageService(backing));
  saves.startNew();
  return saves;
}

test('QTE требует нескольких отдельных нажатий и теряет прогресс без них', () => {
  const qte = new BenchPressQte();
  expect(qte.tap()).toBe(true);
  expect(qte.completed).toBe(false);
  expect(qte.progress).toBe(BENCH.tapGain);
  qte.update(1000);
  expect(qte.progress).toBeCloseTo(BENCH.tapGain - BENCH.decayPerSecond);
  qte.update(5000);
  expect(qte.progress).toBe(0);
});

test('слишком частые события не засчитываются, завершение повторения фиксируется один раз', () => {
  const qte = new BenchPressQte();
  for (let index = 0; index < 5; index++) {
    expect(qte.tap()).toBe(true);
    expect(qte.tap()).toBe(false);
    qte.update(120);
  }
  expect(qte.completed).toBe(true);
  expect(qte.progress).toBe(1);
  qte.update(10000);
  expect(qte.tap()).toBe(false);
  expect(qte.progress).toBe(1);
  qte.reset();
  expect(qte.tap()).toBe(true);
  expect(qte.completed).toBe(false);
});

test('для следующих одинаковых прибавок требуется всё больше повторений, потолка нет', () => {
  expect(trainingAttributes(0)).toEqual({ maxHP: 100, stamina: 100 });
  expect(trainingAttributes(1)).toEqual({ maxHP: 102, stamina: 101 });
  expect(trainingAttributes(100).maxHP - trainingAttributes(0).maxHP).toBeGreaterThan(trainingAttributes(200).maxHP - trainingAttributes(100).maxHP);
  expect(trainingAttributes(1_000_000).maxHP).toBeGreaterThan(trainingAttributes(100_000).maxHP);
  expect(trainingAttributes(1_000_000).stamina).toBeGreaterThan(trainingAttributes(100_000).stamina);
  expect(repsToNextGain(100, 'hp')).toBeGreaterThan(repsToNextGain(0, 'hp'));
});

test('подсказка следующего прироста точно совпадает с фактическим порогом', () => {
  for (let total = 0; total < 200; total++) {
    for (const attribute of ['hp', 'stamina'] as const) {
      const key = attribute === 'hp' ? 'maxHP' : 'stamina';
      const remaining = repsToNextGain(total, attribute);
      const before = trainingAttributes(total)[key];
      expect(trainingAttributes(total + remaining)[key]).toBeGreaterThan(before);
      expect(trainingAttributes(total + remaining - 1)[key]).toBe(before);
    }
  }
});

test('повторения сохраняются сразу и не начисляются дважды или после завершения подхода', () => {
  const backing = new MemoryStorage();
  const saves = game(backing);
  const run = saves.beginBenchSession()!;
  expect(saves.beginBenchSession()).toBe(run);
  expect(saves.completeBenchRep(run, 2)).toBe(false);
  expect(saves.completeBenchRep('wrong-run', 1)).toBe(false);
  expect(saves.completeBenchRep(run, 1)).toBe(true);
  expect(saves.completeBenchRep(run, 1)).toBe(false);
  const restored = new SaveService(new StorageService(backing));
  expect(restored.stats.maxHP).toBe(102);
  expect(restored.training.totalReps).toBe(1);
  expect(restored.completeBenchRep(run, 2)).toBe(false);
  expect(saves.finishBenchSession(run)).toBe(true);
  expect(saves.finishBenchSession(run)).toBe(false);
  expect(saves.completeBenchRep(run, 2)).toBe(false);
  expect(saves.stats.damage).toBe(10);
});

test('обучение, результаты и рекорд сохраняются между подходами', () => {
  const backing = new MemoryStorage();
  const saves = game(backing);
  saves.markBenchTutorialSeen();
  const run = saves.beginBenchSession()!;
  for (let rep = 1; rep <= 5; rep++) saves.completeBenchRep(run, rep);
  saves.finishBenchSession(run);
  const second = saves.beginBenchSession()!;
  saves.completeBenchRep(second, 1);
  saves.finishBenchSession(second);
  const restored = new SaveService(new StorageService(backing));
  expect(restored.training).toEqual({ totalReps: 6, sessions: 2, bestSession: 5, lastSessionReps: 1, tutorialSeen: true });
  expect(restored.stats).toEqual(restoredStats(6));
});

test('улучшение HP не лечит старые повреждения целиком и не зависит от стиля', () => {
  const backing = new MemoryStorage();
  const original = game(backing).current!;
  backing.setItem(GAME.storage.session, JSON.stringify({ ...original, stats: { ...original.stats, currentHP: 40, currentStamina: 30 } }));
  const saves = new SaveService(new StorageService(backing));
  saves.updateLobby({ style: 'freestyle' });
  const run = saves.beginBenchSession()!;
  saves.completeBenchRep(run, 1);
  expect(saves.stats).toEqual({ maxHP: 102, currentHP: 42, stamina: 101, currentStamina: 31, damage: 10 });
});

test('старые сохранения получают базовые характеристики, неверные поля отклоняются', () => {
  const old = { version: 1, id: 'legacy', createdAt: '2026-10-17', updatedAt: '2026-10-17', location: 'lobby', currentClass: 1 };
  const backing = new MemoryStorage(); backing.setItem(GAME.storage.session, JSON.stringify(old));
  const restored = new SaveService(new StorageService(backing));
  expect(restored.training).toEqual(freshTraining());
  expect(restored.stats).toEqual(restoredStats(0));
  expect(isSessionSave({ ...old, training: { ...freshTraining(), totalReps: -1 } })).toBe(false);
  expect(isSessionSave({ ...old, training: { ...freshTraining(), bestSession: 10 } })).toBe(false);
  expect(isSessionSave({ ...old, stats: { ...restoredStats(0), currentHP: 999 } })).toBe(false);
});

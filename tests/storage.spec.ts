import { test, expect } from '@playwright/test';
import { GAME } from '../src/config/game';
import { SaveService, isSessionSave } from '../src/services/SaveService';
import { SettingsService } from '../src/services/SettingsService';
import { StorageService, type StorageLike } from '../src/services/StorageService';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test('нет сохранения до первого запуска, новая сессия восстанавливается', () => {
  const backing = new MemoryStorage();
  const saves = new SaveService(new StorageService(backing));
  expect(saves.current).toBeNull();
  expect(saves.touch()).toBe(false);
  const created = saves.startNew();
  expect(isSessionSave(created)).toBe(true);
  expect(created.currentClass).toBe(1);
  const restored = new SaveService(new StorageService(backing));
  expect(restored.current).toEqual(created);
});

test('новая игра заменяет сессию и не меняет настройки', () => {
  const storage = new StorageService(new MemoryStorage());
  const settings = new SettingsService(storage);
  settings.update({ volume: 0.2, muted: true });
  const saves = new SaveService(storage);
  const previous = saves.startNew().id;
  expect(saves.startNew().id).not.toBe(previous);
  expect(new SettingsService(storage).current).toEqual(settings.current);
});

test('повреждённый JSON не ломает игру и не стирается при чтении', () => {
  const backing = new MemoryStorage();
  backing.setItem(GAME.storage.session, '{broken');
  const saves = new SaveService(new StorageService(backing));
  expect(saves.current).toBeNull();
  expect(saves.loadIssue).toBe('invalid');
  expect(backing.getItem(GAME.storage.session)).toBe('{broken');
});

test('сохранение другой версии распознаётся отдельно', () => {
  const backing = new MemoryStorage();
  backing.setItem(GAME.storage.session, JSON.stringify({ version: 77 }));
  const saves = new SaveService(new StorageService(backing));
  expect(saves.current).toBeNull();
  expect(saves.loadIssue).toBe('unsupported');
});

test('неполные и неверные схемы сохранения не принимаются', () => {
  expect(isSessionSave(null)).toBe(false);
  expect(isSessionSave([])).toBe(false);
  expect(isSessionSave({ version: 1 })).toBe(false);
  const saves = new SaveService(new StorageService(new MemoryStorage()));
  const valid = saves.startNew();
  for (const patch of [{ updatedAt: 'yesterday' }, { id: '' }, { currentClass: 9 }, { location: 'arena' }, { version: 2 }]) {
    expect(isSessionSave({ ...valid, ...patch })).toBe(false);
  }
});

test('запрет чтения localStorage позволяет создать сессию в памяти', () => {
  const storage = new StorageService({
    getItem: () => { throw new Error('Access denied'); },
    setItem: () => { throw new Error('Access denied'); },
  });
  const saves = new SaveService(storage);
  expect(storage.isPersistent).toBe(false);
  const session = saves.startNew();
  expect(new SaveService(storage).current).toEqual(session);
  expect(saves.touch()).toBe(false);
});

test('переполнение хранилища сохраняет данные в памяти', () => {
  const storage = new StorageService({
    getItem: () => null,
    setItem: () => { throw new Error('Quota exceeded'); },
  });
  const saves = new SaveService(storage);
  const session = saves.startNew();
  expect(storage.isPersistent).toBe(false);
  expect(new SaveService(storage).current).toEqual(session);
});

test('отсутствие хранилища не мешает настройкам', () => {
  const storage = new StorageService(null);
  const settings = new SettingsService(storage);
  settings.update({ muted: true, volume: 0.3 });
  expect(new SettingsService(storage).current).toMatchObject({ muted: true, volume: 0.3 });
  expect(storage.isPersistent).toBe(false);
});

test('настройки проверяют типы и ограничивают громкость', () => {
  const backing = new MemoryStorage();
  backing.setItem(GAME.storage.settings, JSON.stringify({ volume: 10, muted: 'yes', animatedBackground: 0 }));
  const settings = new SettingsService(new StorageService(backing));
  expect(settings.current).toEqual({ volume: 1, muted: false, animatedBackground: true });
  settings.update({ volume: -10 });
  expect(settings.current.volume).toBe(0);
  settings.update({ volume: Number.NaN });
  expect(settings.current.volume).toBe(0);
});

test('учитывается системное уменьшение движения, сохранённый выбор имеет приоритет', () => {
  const storage = new StorageService(new MemoryStorage());
  const settings = new SettingsService(storage, true);
  expect(settings.current.animatedBackground).toBe(false);
  settings.update({ animatedBackground: true });
  expect(new SettingsService(storage, true).current.animatedBackground).toBe(true);
});

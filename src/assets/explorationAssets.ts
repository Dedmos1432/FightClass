import Phaser from 'phaser';
import lobbyUrl from '../../assets/backgrounds/lobby.png?url';
import gymUrl from '../../resourse/задники/качалка.png?url';
import dojoUrl from '../../resourse/задники/зал боевых искусств.png?url';

const sprites = import.meta.glob<string>('../../resourse/player/{idle,walk}/**/*.png', {
  eager: true, query: '?url', import: 'default',
});

const backgrounds = { lobby: lobbyUrl, gym: gymUrl, dojo: dojoUrl } as const;
export type RoomId = keyof typeof backgrounds;

export function playerTextureKey(state: string, direction: string, frame: number): string {
  return `player-${state}-${direction}-${String(frame).padStart(2, '0')}`;
}

export function preloadExploration(scene: Phaser.Scene, room: RoomId): void {
  const ui = document.querySelector<HTMLElement>('#ui')!;
  ui.dataset.screen = 'loading';
  ui.innerHTML = '<div class="loading-screen"><span class="brand-mark"><i></i><i></i><i></i></span><p>КЛАСС УДАРА</p><progress aria-label="Загрузка локации" max="1" value="0"></progress><small>ОТКРЫВАЕМ ДВЕРИ КЛУБА</small></div>';
  const onProgress = (value: number): void => { ui.querySelector('progress')?.setAttribute('value', String(value)); };
  const onError = (): void => {
    ui.dataset.screen = 'load-error';
    ui.innerHTML = '<div class="loading-screen"><h1>Не удалось загрузить локацию</h1><p>Сессия сохранена. Попробуй ещё раз.</p><button class="button primary" id="retry-world">Повторить загрузку</button></div>';
    ui.querySelector('#retry-world')?.addEventListener('click', () => window.location.reload());
  };
  scene.load.on(Phaser.Loader.Events.PROGRESS, onProgress);
  scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.load.off(Phaser.Loader.Events.PROGRESS, onProgress);
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  });
  if (!scene.textures.exists(`background-${room}`)) {
    scene.load.image({ key: `background-${room}`, url: backgrounds[room], xhrSettings: { responseType: 'blob', timeout: 20000 } });
  }
  for (const state of ['idle', 'walk']) {
    for (const direction of ['left', 'right']) {
      for (let frame = 1; frame <= 8; frame++) {
        const key = playerTextureKey(state, direction, frame);
        if (scene.textures.exists(key)) continue;
        const file = `../../resourse/player/${state}/${state}_${direction}/${state}_${direction}_${String(frame).padStart(2, '0')}.png`;
        scene.load.image({ key, url: sprites[file], xhrSettings: { responseType: 'blob', timeout: 20000 } });
      }
    }
  }
}

export function createPlayerAnimations(scene: Phaser.Scene): void {
  for (const state of ['idle', 'walk']) {
    for (const direction of ['left', 'right']) {
      const key = `player-${state}-${direction}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({ key, frames: Array.from({ length: 8 }, (_, index) => ({ key: playerTextureKey(state, direction, index + 1) })), frameRate: state === 'walk' ? 11 : 7, repeat: -1 });
    }
  }
}

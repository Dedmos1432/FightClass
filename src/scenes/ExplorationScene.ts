import Phaser from 'phaser';
import { SCENES } from '../config/game';
import { LOBBY_OBJECTS, nearestLobbyObject, WORLD, type LobbyObject } from '../config/lobby';
import type { GameServices } from '../core/GameServices';
import { createPlayerAnimations, preloadExploration, type RoomId } from '../assets/explorationAssets';
import { ExplorationPlayer } from '../characters/ExplorationPlayer';
import { ExplorationInput } from '../input/ExplorationInput';
import { ExplorationView } from '../ui/ExplorationView';
import { showRanking } from '../ui/RankingView';
import { RoomBackdrop } from './RoomBackdrop';

export class ExplorationScene extends Phaser.Scene {
  private player: ExplorationPlayer | null = null;
  private controls: ExplorationInput | null = null;
  private view: ExplorationView | null = null;
  private spawnX: number | undefined;
  private readonly markers = new Map<string, Phaser.GameObjects.Ellipse>();
  private nearest: LobbyObject | null = null;
  private saveElapsed = 0;
  private savedX = 0;
  private moving = false;

  constructor(private readonly services: GameServices, private readonly room: RoomId) {
    super(SCENES[room]);
  }

  init(data: { spawnX?: number } = {}): void {
    this.spawnX = typeof data.spawnX === 'number' && Number.isFinite(data.spawnX) ? data.spawnX : undefined;
    this.player = null; this.controls = null; this.view = null;
    this.nearest = null; this.saveElapsed = 0; this.moving = false;
    this.markers.clear();
  }

  preload(): void {
    if (this.services.saves.current) preloadExploration(this, this.room);
  }

  create(): void {
    if (!this.services.saves.current) { this.scene.start(SCENES.menu); return; }
    if (document.querySelector<HTMLElement>('#ui')?.dataset.screen === 'load-error') return;
    createPlayerAnimations(this);
    const backdrop = new RoomBackdrop(this, this.room);
    this.cameras.main.setBackgroundColor('#0a0f0b');
    const state = this.services.saves.lobbyState;
    const x = this.spawnX ?? (this.room === 'lobby' ? state.x : 330);
    this.player = new ExplorationPlayer(this, Phaser.Math.Clamp(x, WORLD.minX, WORLD.maxX), state.facing);
    this.savedX = this.player.x;
    if (this.room === 'lobby') this.addLobbyMarkers(backdrop);
    else this.addExitMarker();
    this.view = new ExplorationView(this.services, this.room, () => this.interact());
    this.controls = new ExplorationInput(() => Boolean(this.view?.hasDialog) || document.hidden,
      () => this.interact(), () => this.escape());
    this.view.on('#back-menu', 'click', () => this.returnToMenu());
    this.view.on('.brand', 'click', (event) => { event.preventDefault(); this.returnToMenu(); });
    this.view.listen(document, 'visibilitychange', () => { if (document.hidden) this.persistPosition(); });
    window.addEventListener('pagehide', () => this.persistPosition(), { signal: this.view.events.signal });
    this.resize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.refreshInteraction();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.persistPosition();
      this.controls?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.view?.destroy();
      this.player = null; this.controls = null; this.view = null;
    });
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.controls || !this.view) return;
    const direction = this.controls.direction;
    this.player.update(direction, delta);
    this.view.syncPlayer(this.player, delta);
    this.refreshInteraction();
    this.saveElapsed += delta;
    const stopped = this.moving && direction === 0;
    this.moving = direction !== 0;
    if ((stopped || this.saveElapsed > 1500) && Math.abs(this.player.x - this.savedX) > 0.1) this.persistPosition();
  }

  private resize(size: Phaser.Structs.Size): void {
    this.cameras.main.setViewport(0, 0, size.width, size.height)
      .setZoom(Math.min(size.width / WORLD.width, size.height / WORLD.height))
      .centerOn(WORLD.width / 2, WORLD.height / 2);
  }

  private addLobbyMarkers(backdrop: RoomBackdrop): void {
    for (const object of LOBBY_OBJECTS) {
      this.add.text(object.x, backdrop.wallY(object.labelY), object.label, {
        fontFamily: 'Consolas, monospace', fontSize: object.id === 'dojo' ? '16px' : '20px',
        fontStyle: 'bold', color: '#e2dfc4', stroke: '#24271f', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2);
      this.markers.set(object.id, this.add.ellipse(object.x, WORLD.floorY + 4, 185, 25, 0xd8e391, 0.09)
        .setStrokeStyle(2, 0xd8e391, 0.7).setDepth(3).setVisible(false));
    }
  }

  private addExitMarker(): void {
    const marker = this.add.ellipse(160, WORLD.floorY + 4, 150, 25, 0xd8e391, 0.1).setDepth(3).setStrokeStyle(2, 0xd8e391, 0.8);
    this.markers.set('exit', marker);
    this.add.text(160, 750, '← В ЛОББИ', { fontFamily: 'Consolas, monospace', fontSize: '23px', color: '#e4eac9', backgroundColor: '#182016bb', padding: { x: 15, y: 9 } }).setOrigin(0.5).setDepth(2);
  }

  private refreshInteraction(): void {
    if (!this.player || !this.view) return;
    if (this.room === 'lobby') {
      this.nearest = nearestLobbyObject(this.player.x);
      this.view.setInteraction(this.nearest?.action ?? null);
      this.markers.forEach((marker, key) => marker.setVisible(key === this.nearest?.id));
    } else {
      const nearExit = Math.abs(this.player.x - 160) <= WORLD.interactionRadius;
      this.view.setInteraction(nearExit ? 'Вернуться в лобби' : null);
      this.markers.get('exit')?.setAlpha(nearExit ? 1 : 0.35);
    }
  }

  private interact(): void {
    if (!this.player || !this.view || this.view.hasDialog) return;
    this.controls?.clear();
    this.player.stop();
    if (this.room !== 'lobby') {
      if (Math.abs(this.player.x - 160) <= WORLD.interactionRadius) this.returnToLobby();
      return;
    }
    const target = nearestLobbyObject(this.player.x);
    if (!target) return;
    this.persistPosition();
    if (target.id === 'board') showRanking(this.view);
    else { this.services.audio.play('open'); this.scene.start(SCENES[target.id]); }
  }

  private escape(): void {
    if (this.room === 'lobby') this.returnToMenu();
    else this.returnToLobby();
  }

  private returnToLobby(): void {
    this.services.audio.play();
    this.scene.start(SCENES.lobby);
  }

  private returnToMenu(): void {
    this.persistPosition();
    this.services.saves.touch();
    this.services.audio.play();
    this.scene.start(SCENES.menu);
  }

  private persistPosition(): void {
    if (this.room !== 'lobby' || !this.player) return;
    this.services.saves.updateLobby({ x: this.player.x, facing: this.player.direction });
    this.savedX = this.player.x;
    this.saveElapsed = 0;
  }
}

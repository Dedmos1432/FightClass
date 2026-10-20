import { COMBAT } from '../config/combat';
import { defaultLoadout, isLoadout, type Loadout } from '../combat/moves';
import { damageFor, freshEndless, isEndless, isActiveRun, type EndlessProgress, type ActiveRun } from '../combat/EndlessProgress';
import { opponentAt } from '../combat/Opponents';
import { roundElapsed, roundOutcome } from '../combat/RoundRules';
import { GAME } from '../config/game';
import { WORLD } from '../config/lobby';
import { isStyleId, type StyleId } from '../config/styles';
import { StorageService } from './StorageService';
import { freshTraining, isCharacterStats, isTrainingProgress, restoredStats, trainingAttributes, type CharacterStats, type TrainingProgress } from '../training/Progression';

export interface LobbyState {
  x: number;
  facing: 'left' | 'right';
  style: StyleId;
}

const defaultLobbyState = (): LobbyState => ({ x: WORLD.spawnX, facing: 'right', style: 'boxing' });

/** Additive v1 fields preserve saves created by the main-menu stage. */
export interface SessionSave {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  location: 'lobby';
  currentClass: 1;
  player?: LobbyState;
  training?: TrainingProgress;
  stats?: CharacterStats;
  freestyle?: Loadout;
  endless?: EndlessProgress;
  activeRun?: ActiveRun;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSessionSave(value: unknown): value is SessionSave {
  if (!isRecord(value)) return false;
  return value.version === 1 && value.location === 'lobby' && value.currentClass === 1
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    && (value.player === undefined || (isRecord(value.player)
      && typeof value.player.x === 'number' && Number.isFinite(value.player.x)
      && value.player.x >= WORLD.minX && value.player.x <= WORLD.maxX
      && (value.player.facing === 'left' || value.player.facing === 'right')
      && isStyleId(value.player.style)))
    && (value.training === undefined || isTrainingProgress(value.training))
    && (value.stats === undefined || isCharacterStats(value.stats))
    && (value.freestyle === undefined || isLoadout(value.freestyle))
    && (value.endless === undefined || isEndless(value.endless))
    && (value.activeRun === undefined || isActiveRun(value.activeRun));
}

export class SaveService {
  private session: SessionSave | null = null;
  private activeTraining: { id: string; reps: number } | null = null;
  readonly loadIssue: 'invalid' | 'unsupported' | null;

  constructor(private readonly storage: StorageService) {
    const result = storage.read(GAME.storage.session);
    if (result.status === 'ok' && isSessionSave(result.value)) {
      const training = result.value.training ?? freshTraining();
      const endless = result.value.endless ?? freshEndless(Math.max(0, (result.value.stats?.damage ?? 10) - 10));
      this.session = { ...result.value, training: { ...training }, endless: { ...endless },
        freestyle: [...(result.value.freestyle ?? defaultLoadout())],
        stats: { ...restoredStats(training.totalReps, result.value.stats), damage: damageFor(endless) } };
      this.loadIssue = null;
    } else if (result.status === 'ok' || result.status === 'invalid') {
      this.loadIssue = result.status === 'ok' && isRecord(result.value)
        && typeof result.value.version === 'number' && result.value.version !== 1
        ? 'unsupported' : 'invalid';
    } else {
      this.loadIssue = null;
    }
  }

  get current(): Readonly<SessionSave> | null {
    return this.session ? { ...this.session, ...(this.session.player ? { player: { ...this.session.player } } : {}),
      ...(this.session.training ? { training: { ...this.session.training } } : {}),
      ...(this.session.stats ? { stats: { ...this.session.stats } } : {}),
      ...(this.session.endless ? { endless: { ...this.session.endless } } : {}),
      ...(this.session.activeRun ? { activeRun: { ...this.session.activeRun } } : {}),
      ...(this.session.freestyle ? { freestyle: [...this.session.freestyle] as Loadout } : {}),
    } : null;
  }

  get training(): Readonly<TrainingProgress> { return { ...(this.session?.training ?? freshTraining()) }; }
  get stats(): Readonly<CharacterStats> { return { ...(this.session?.stats ?? restoredStats(this.training.totalReps)) }; }

  get freestyle(): Loadout { return [...(this.session?.freestyle ?? defaultLoadout())]; }
  get endless(): Readonly<EndlessProgress> { return { ...(this.session?.endless ?? freshEndless()) }; }
  get activeRun(): Readonly<ActiveRun> | null { return this.session?.activeRun ? { ...this.session.activeRun,
    elapsedMs: this.session.activeRun.elapsedMs ?? 0, roundStartedMs: this.session.activeRun.roundStartedMs ?? 0 } : null; }

  updateFreestyle(loadout: Loadout): boolean {
    if (!this.session || !isLoadout(loadout)) return false;
    this.session.freestyle = [...loadout]; return this.touch();
  }

  beginEndless(): Readonly<ActiveRun> | null {
    if (!this.session) return null;
    if (this.activeRun) return this.activeRun;
    const stats = this.stats, id = crypto.randomUUID(), enemy = opponentAt(0,id);
    this.session.stats = { ...stats, currentHP: stats.maxHP, currentStamina: stats.stamina };
    this.session.activeRun = { id, elapsedMs: 0, roundStartedMs: 0, wins: 0, hp: stats.maxHP, stamina: stats.stamina,
      enemyHP: enemy.maxHP, enemyStamina: enemy.stamina, playerX: COMBAT.playerStart, enemyX: COMBAT.enemyStart };
    this.touch(); return this.activeRun;
  }

  checkpointEndless(id: string, state: Omit<ActiveRun, 'id' | 'wins'>): boolean {
    const run = this.activeRun;
    if (!this.session || !run || run.id !== id) return false;
    const next = { ...state, id, wins: run.wins, elapsedMs: Math.max(run.elapsedMs ?? 0, state.elapsedMs ?? 0), roundStartedMs: run.roundStartedMs ?? 0 },
      enemy = opponentAt(run.wins,run.id,run.roundStartedMs), stats = this.stats;
    if (!isActiveRun(next) || next.hp > stats.maxHP || next.stamina > stats.stamina
      || next.enemyHP > enemy.maxHP || next.enemyStamina > enemy.stamina) return false;
    this.session.activeRun = next;
    this.session.stats = { ...stats, currentHP: Math.ceil(next.hp), currentStamina: Math.floor(next.stamina) };
    return this.touch();
  }

  advanceEndless(id: string): Readonly<ActiveRun> | null {
    const run = this.activeRun;
    if (!this.session || !run || run.id !== id || this.runOutcome(run) !== 'player') return null;
    const enemy = opponentAt(run.wins + 1,run.id,run.elapsedMs);
    this.session.activeRun = { ...run, roundStartedMs: run.elapsedMs ?? 0, wins: run.wins + 1, enemyHP: enemy.maxHP, enemyStamina: enemy.stamina,
      playerX: COMBAT.playerStart, enemyX: COMBAT.enemyStart };
    this.touch(); return this.activeRun;
  }

  finishEndless(id: string): { wins: number; gain: number; damage: number } | null {
    const run = this.activeRun;
    if (!this.session || !run || run.id !== id) return null;
    const outcome = this.runOutcome(run);
    if (outcome !== 'enemy' && outcome !== 'draw') return null;
    const previous = this.endless, before = damageFor(previous);
    const progress = { ...previous, totalWins: previous.totalWins + run.wins, bestStreak: Math.max(previous.bestStreak, run.wins),
      runs: previous.runs + 1, lastWins: run.wins };
    this.session.endless = progress;
    delete this.session.activeRun;
    this.session.stats = { ...this.stats, damage: damageFor(progress), currentHP: Math.ceil(run.hp), currentStamina: Math.floor(run.stamina) };
    this.touch();
    return { wins: run.wins, gain: damageFor(progress) - before, damage: damageFor(progress) };
  }

  private runOutcome(run: Readonly<ActiveRun>) {
    const enemy = opponentAt(run.wins, run.id, run.roundStartedMs);
    return roundOutcome(roundElapsed(run), { hp: run.hp, maxHP: this.stats.maxHP }, { hp: run.enemyHP, maxHP: enemy.maxHP });
  }

  markBenchTutorialSeen(): void {
    if (!this.session) return;
    this.session.training = { ...this.training, tutorialSeen: true };
    this.touch();
  }

  beginBenchSession(): string | null {
    if (!this.session) return null;
    if (this.activeTraining) return this.activeTraining.id;
    this.activeTraining = { id: crypto.randomUUID(), reps: 0 };
    this.session.training = { ...this.training, sessions: this.training.sessions + 1, lastSessionReps: 0 };
    this.touch();
    return this.activeTraining.id;
  }

  completeBenchRep(id: string, repNumber: number): boolean {
    if (!this.session || !this.activeTraining || this.activeTraining.id !== id
      || repNumber !== this.activeTraining.reps + 1) return false;
    const before = this.stats;
    const totalReps = this.training.totalReps + 1;
    const attributes = trainingAttributes(totalReps);
    this.activeTraining.reps = repNumber;
    this.session.training = { ...this.training, totalReps, lastSessionReps: repNumber,
      bestSession: Math.max(this.training.bestSession, repNumber) };
    this.session.stats = { ...before, ...attributes,
      currentHP: Math.min(attributes.maxHP, before.currentHP + attributes.maxHP - before.maxHP),
      currentStamina: Math.min(attributes.stamina, before.currentStamina + attributes.stamina - before.stamina),
    };
    this.touch();
    return true;
  }

  finishBenchSession(id: string): boolean {
    if (this.activeTraining?.id !== id) return false;
    this.activeTraining = null;
    return true;
  }

  get lobbyState(): Readonly<LobbyState> {
    return this.session?.player ? { ...this.session.player } : defaultLobbyState();
  }

  updateLobby(patch: Partial<LobbyState>): boolean {
    if (!this.session) return false;
    const previous = this.lobbyState;
    this.session.player = {
      x: typeof patch.x === 'number' && Number.isFinite(patch.x)
        ? Math.max(WORLD.minX, Math.min(WORLD.maxX, patch.x)) : previous.x,
      facing: patch.facing === 'left' || patch.facing === 'right' ? patch.facing : previous.facing,
      style: isStyleId(patch.style) ? patch.style : previous.style,
    };
    return this.touch();
  }

  startNew(): Readonly<SessionSave> {
    this.activeTraining = null;
    const timestamp = new Date().toISOString();
    this.session = {
      version: 1,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      location: 'lobby',
      currentClass: 1,
      player: defaultLobbyState(),
      training: freshTraining(),
      stats: restoredStats(0),
      freestyle: defaultLoadout(),
      endless: freshEndless(),
    };
    this.storage.write(GAME.storage.session, this.session);
    return this.current!;
  }

  touch(): boolean {
    if (!this.session) return false;
    this.session.updatedAt = new Date().toISOString();
    return this.storage.write(GAME.storage.session, this.session);
  }
}

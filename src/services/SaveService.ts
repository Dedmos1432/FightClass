import { COMBAT } from '../config/combat';
import { defaultLoadout, isLoadout, type Loadout } from '../combat/moves';
import { damageFor, freshEndless, isEndless, isActiveRun, type EndlessProgress, type ActiveRun } from '../combat/EndlessProgress';
import { opponentAt } from '../combat/Opponents';
import { roundElapsed, roundOutcome } from '../combat/RoundRules';
import { GAME } from '../config/game';
import { WORLD } from '../config/lobby';
import { isStyleId, type StyleId } from '../config/styles';
import { StorageService } from './StorageService';
import { isTutorialStep, nextTutorialStep, type TutorialStep } from '../tutorial/Progress';
import { freshClubGuide, isClubGuide, nextClubGuideStep, type ClubGuideProgress, type ClubGuideStep } from '../tutorial/ClubGuide';
import { freshTraining, isCharacterStats, isTrainingProgress, restoredStats, trainingAttributes, type CharacterStats, type TrainingProgress } from '../training/Progression';
import { careerOpponent, type CareerClass } from '../career/Roster';
import { careerAvailable, careerClass, careerComplete, careerScore, careerRoundNumber, careerMatchOutcome, cloneCareer, emptyCareerRecord, freshCareer, isCareerProgress, isCareerRun, type CareerCheckpoint, type CareerProgress, type CareerResult, type CareerRun, type CareerRoundResult } from '../career/Progress';

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
  currentClass: CareerClass;
  player?: LobbyState;
  training?: TrainingProgress;
  stats?: CharacterStats;
  freestyle?: Loadout;
  endless?: EndlessProgress;
  activeRun?: ActiveRun;
  career?: CareerProgress;
  activeCareer?: CareerRun;
  tutorial?: TutorialStep;
  clubGuide?: ClubGuideProgress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSessionSave(value: unknown): value is SessionSave {
  if (!isRecord(value)) return false;
  return value.version === 1 && value.location === 'lobby' && [1,2,3].includes(Number(value.currentClass))
    && typeof value.currentClass === 'number'
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
    && (value.activeRun === undefined || isActiveRun(value.activeRun))
    && (value.career === undefined || isCareerProgress(value.career))
    && (value.tutorial === undefined || isTutorialStep(value.tutorial))
    && (value.clubGuide === undefined || (isClubGuide(value.clubGuide)
      && value.clubGuide.repsBefore <= (isTrainingProgress(value.training) ? value.training.totalReps : 0)))
    && (value.activeCareer === undefined || (isCareerRun(value.activeCareer)
      && careerAvailable(isCareerProgress(value.career) ? value.career : freshCareer(), value.activeCareer.opponentId)));
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
      const career = result.value.career ?? freshCareer();
      this.session = { ...result.value, training: { ...training }, endless: { ...endless },
        career: cloneCareer(career), currentClass: careerClass(career),
        ...(result.value.clubGuide ? {clubGuide:{...result.value.clubGuide}} :
          result.value.tutorial && result.value.tutorial!=='complete' ? {clubGuide:freshClubGuide(training.totalReps)} : {}),
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
      ...(this.session.career ? { career: cloneCareer(this.session.career) } : {}),
      ...(this.session.activeCareer ? { activeCareer: { ...this.session.activeCareer } } : {}),
      ...(this.session.freestyle ? { freestyle: [...this.session.freestyle] as Loadout } : {}),
      ...(this.session.clubGuide ? { clubGuide: {...this.session.clubGuide} } : {}),
    } : null;
  }

  get training(): Readonly<TrainingProgress> { return { ...(this.session?.training ?? freshTraining()) }; }
  // Older saves have no onboarding field and continue directly into the club.
  get tutorialStep(): TutorialStep { return this.session?.tutorial ?? 'complete'; }
  get needsTutorial(): boolean { return Boolean(this.session) && this.tutorialStep!=='complete'; }
  beginTutorial(): void { if(this.session) { this.session.tutorial='movement'; this.session.clubGuide=freshClubGuide(this.training.totalReps); this.touch(); } }
  advanceTutorial(expected: TutorialStep): boolean {
    if(!this.session || this.tutorialStep!==expected || expected==='complete') return false;
    this.session.tutorial=nextTutorialStep(expected); this.touch(); return true;
  }
  skipTutorial(): void { if(this.session) { this.session.tutorial='complete'; this.skipClubGuide(); } }
  get clubGuide():ClubGuideProgress { return {...(this.session?.clubGuide ?? {step:'complete',repsBefore:0})}; }
  get needsClubGuide():boolean { return Boolean(this.session) && !this.needsTutorial && this.clubGuide.step!=='complete'; }
  advanceClubGuide(expected:ClubGuideStep):boolean {
    if(!this.session || !this.needsClubGuide || this.clubGuide.step!==expected || expected==='complete')return false;
    this.session.clubGuide={...this.clubGuide,step:nextClubGuideStep(expected)};this.touch();return true;
  }
  skipClubGuide():void { if(this.session) {this.session.clubGuide={...this.clubGuide,step:'complete'};this.touch();} }
  get stats(): Readonly<CharacterStats> { return { ...(this.session?.stats ?? restoredStats(this.training.totalReps)) }; }

  get freestyle(): Loadout { return [...(this.session?.freestyle ?? defaultLoadout())]; }
  get endless(): Readonly<EndlessProgress> { return { ...(this.session?.endless ?? freshEndless()) }; }
  get activeRun(): Readonly<ActiveRun> | null { return this.session?.activeRun ? { ...this.session.activeRun,
    elapsedMs: this.session.activeRun.elapsedMs ?? 0, roundStartedMs: this.session.activeRun.roundStartedMs ?? 0 } : null; }
  get career(): Readonly<CareerProgress> { return cloneCareer(this.session?.career ?? freshCareer()); }
  get activeCareer(): Readonly<CareerRun> | null { return this.session?.activeCareer ? { ...this.session.activeCareer, ...careerScore(this.session.activeCareer) } : null; }

  beginCareer(opponentId: string): Readonly<CareerRun> | null {
    if (!this.session || !careerAvailable(this.career,opponentId)) return null;
    const active=this.activeCareer;
    if(active) return active.opponentId===opponentId ? active : null;
    const opponent=careerOpponent(opponentId)!;
    const stats=this.stats, progress=this.career;
    const previous=progress.records[opponentId] ?? emptyCareerRecord();
    this.session.career={...progress,records:{...progress.records,[opponentId]:{...previous,attempts:previous.attempts+1}}};
    this.session.activeCareer={id:crypto.randomUUID(),opponentId,playerMaxHP:stats.maxHP,playerMaxStamina:stats.stamina,playerDamage:stats.damage,
      hp:stats.maxHP,stamina:stats.stamina,enemyHP:opponent.maxHP,enemyStamina:opponent.stamina,
      playerX:COMBAT.playerStart,enemyX:COMBAT.enemyStart,elapsedMs:0,playerRounds:0,enemyRounds:0,drawnRounds:0};
    this.session.stats={...stats,currentHP:stats.maxHP,currentStamina:stats.stamina};
    this.touch(); return this.activeCareer;
  }

  checkpointCareer(id: string, state: CareerCheckpoint, expectedRound?: number): boolean {
    const run=this.activeCareer;
    if(!this.session || !run || run.id!==id || careerMatchOutcome(run)
      || expectedRound!==undefined && expectedRound!==careerRoundNumber(run)) return false;
    const next={...run,hp:state.hp,stamina:state.stamina,enemyHP:state.enemyHP,enemyStamina:state.enemyStamina,
      playerX:state.playerX,enemyX:state.enemyX,elapsedMs:Math.max(run.elapsedMs,state.elapsedMs)};
    if(!isCareerRun(next)) return false;
    this.session.activeCareer=next;
    this.session.stats={...this.stats,currentHP:Math.min(this.stats.maxHP,Math.ceil(next.hp)),
      currentStamina:Math.min(this.stats.stamina,Math.floor(next.stamina))};
    return this.touch();
  }

  resolveCareerRound(id: string, expectedRound: number): CareerRoundResult | null {
    const run=this.activeCareer;
    if(!this.session || !run || run.id!==id || careerMatchOutcome(run) || expectedRound!==careerRoundNumber(run)) return null;
    const opponent=careerOpponent(run.opponentId)!;
    const outcome=roundOutcome(run.elapsedMs,{hp:run.hp,maxHP:run.playerMaxHP},{hp:run.enemyHP,maxHP:opponent.maxHP});
    if(!outcome) return null;
    const score=careerScore(run);
    if(outcome==='player') score.playerRounds++;
    else if(outcome==='enemy') score.enemyRounds++;
    else score.drawnRounds++;
    const matchOver=Boolean(careerMatchOutcome({...run,...score}));
    this.session.activeCareer=matchOver ? {...run,...score} : {...run,...score,
      hp:run.playerMaxHP,stamina:run.playerMaxStamina,enemyHP:opponent.maxHP,enemyStamina:opponent.stamina,
      playerX:COMBAT.playerStart,enemyX:COMBAT.enemyStart,elapsedMs:0};
    const next=this.session.activeCareer;
    this.session.stats={...this.stats,currentHP:Math.min(this.stats.maxHP,Math.ceil(next.hp)),
      currentStamina:Math.min(this.stats.stamina,Math.floor(next.stamina))};
    this.touch();
    return {...score,outcome,roundNumber:expectedRound,matchOver,
      reason:outcome==='draw' ? 'draw' : run.hp<=0 || run.enemyHP<=0 ? 'knockout' : 'timeout'};
  }

  finishCareer(id: string): CareerResult | null {
    const run=this.activeCareer;
    if(!this.session || !run || run.id!==id) return null;
    const opponent=careerOpponent(run.opponentId)!;
    const outcome=careerMatchOutcome(run);
    if(!outcome) return null;
    const progress=this.career, previous=progress.records[opponent.id] ?? emptyCareerRecord();
    const newVictory=outcome==='player' && !progress.victories.includes(opponent.id);
    const victories=newVictory ? [...progress.victories,opponent.id] : [...progress.victories];
    const records={...progress.records,[opponent.id]:{...previous,
      wins:previous.wins+Number(outcome==='player'),losses:previous.losses+Number(outcome==='enemy'),draws:previous.draws}};
    const next={victories,records};
    const result:CareerResult={opponentId:opponent.id,outcome,newVictory,newClass:careerClass(next),completed:careerComplete(next),elapsedMs:run.elapsedMs,
      ...careerScore(run),reason:run.hp<=0 || run.enemyHP<=0 ? 'knockout' : 'timeout'};
    this.session.career={...next,lastResult:result};
    this.session.currentClass=result.newClass;
    delete this.session.activeCareer;
    this.session.stats={...this.stats,currentHP:Math.min(this.stats.maxHP,Math.ceil(run.hp)),currentStamina:Math.min(this.stats.stamina,Math.floor(run.stamina))};
    this.touch(); return {...result};
  }

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
      career: freshCareer(),
      tutorial: 'movement',
      clubGuide: freshClubGuide(),
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

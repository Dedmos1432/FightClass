import { COMBAT } from '../config/combat';
import { CAREER_MATCH } from '../config/career';
import { CAREER_ROSTER, careerOpponent, type CareerClass } from './Roster';
import { roundOutcome, type RoundOutcome, type SeriesEndReason } from '../combat/RoundRules';

export interface CareerScore { playerRounds: number; enemyRounds: number; drawnRounds: number }
export const careerWinsNeeded = (id: string): number => careerOpponent(id)?.boss ? CAREER_MATCH.bossWins : CAREER_MATCH.ordinaryWins;
export const careerScore = (run: Partial<CareerScore>): CareerScore => ({
  playerRounds: run.playerRounds ?? 0, enemyRounds: run.enemyRounds ?? 0, drawnRounds: run.drawnRounds ?? 0,
});
export const careerRoundNumber = (run: Partial<CareerScore>): number => {
  const score=careerScore(run); return score.playerRounds+score.enemyRounds+score.drawnRounds+1;
};
export function careerMatchOutcome(run: Pick<CareerRun,'opponentId'> & Partial<CareerScore>): 'player' | 'enemy' | null {
  const score=careerScore(run), needed=careerWinsNeeded(run.opponentId);
  return score.playerRounds>=needed ? 'player' : score.enemyRounds>=needed ? 'enemy' : null;
}
export interface CareerRoundResult extends CareerScore {
  outcome: RoundOutcome; roundNumber: number; matchOver: boolean; reason: SeriesEndReason;
}

export interface CareerRecord { attempts: number; wins: number; losses: number; draws: number }
export interface CareerResult extends Partial<CareerScore> {
  opponentId: string; outcome: RoundOutcome; reason: SeriesEndReason; newVictory: boolean;
  newClass: CareerClass; completed: boolean; elapsedMs: number;
}
export interface CareerProgress {
  victories: string[];
  records: Record<string, CareerRecord>;
  lastResult?: CareerResult;
}
export interface CareerRun extends Partial<CareerScore> {
  id: string; opponentId: string;
  playerMaxHP: number; playerMaxStamina: number; playerDamage: number;
  hp: number; stamina: number; enemyHP: number; enemyStamina: number;
  playerX: number; enemyX: number; elapsedMs: number;
}
export type CareerCheckpoint = Pick<CareerRun,'hp' | 'stamina' | 'enemyHP' | 'enemyStamina' | 'playerX' | 'enemyX' | 'elapsedMs'>;
export const freshCareer = (): CareerProgress => ({ victories:[], records:{} });
export const emptyCareerRecord = (): CareerRecord => ({ attempts:0,wins:0,losses:0,draws:0 });
export const careerComplete = (p: CareerProgress): boolean => p.victories.length === CAREER_ROSTER.length;
export function careerClass(p: CareerProgress): CareerClass {
  return (p.victories.length >= 8 ? 3 : p.victories.length >= 4 ? 2 : 1);
}
export function careerAvailable(p: CareerProgress, id: string): boolean {
  const opponent=careerOpponent(id);
  return Boolean(opponent && opponent.order <= p.victories.length);
}
export function cloneCareer(p: CareerProgress): CareerProgress {
  return { victories:[...p.victories],records:Object.fromEntries(Object.entries(p.records).map(([id,r])=>[id,{...r}])),
    ...(p.lastResult ? {lastResult:{...p.lastResult}} : {}) };
}

const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object' && v!==null && !Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number' && Number.isFinite(v) && v>=0;
const count=(v:unknown):v is number=>finite(v) && Number.isSafeInteger(v);
function isCareerRecord(v:unknown):v is CareerRecord {
  return record(v) && count(v.attempts) && count(v.wins) && count(v.losses) && count(v.draws)
    && v.attempts >= v.wins + v.losses + v.draws;
}
function isScore(v:Record<string,unknown>, opponentId:string):boolean {
  if(v.playerRounds===undefined && v.enemyRounds===undefined && v.drawnRounds===undefined) return true;
  const needed=careerWinsNeeded(opponentId);
  return count(v.playerRounds) && count(v.enemyRounds) && count(v.drawnRounds)
    && v.playerRounds<=needed && v.enemyRounds<=needed
    && !(v.playerRounds===needed && v.enemyRounds===needed)
    && Number.isSafeInteger(v.playerRounds+v.enemyRounds+v.drawnRounds);
}
function isResult(v:unknown):v is CareerResult {
  return record(v) && typeof v.opponentId==='string' && Boolean(careerOpponent(v.opponentId))
    && ['player','enemy','draw'].includes(String(v.outcome)) && ['knockout','timeout','draw'].includes(String(v.reason))
    && typeof v.newVictory==='boolean' && (!v.newVictory || v.outcome==='player')
    && typeof v.newClass==='number' && [1,2,3].includes(v.newClass)
    && typeof v.completed==='boolean' && finite(v.elapsedMs) && v.elapsedMs<=COMBAT.roundDurationMs
    && (v.outcome==='draw')===(v.reason==='draw')
    && (v.reason==='knockout' || v.elapsedMs===COMBAT.roundDurationMs)
    && isScore(v,v.opponentId)
    && (v.playerRounds===undefined || careerMatchOutcome(v as unknown as CareerRun)===v.outcome);
}
export function isCareerProgress(v:unknown):v is CareerProgress {
  return record(v) && Array.isArray(v.victories) && v.victories.length<=CAREER_ROSTER.length
    && v.victories.every((id,index)=>id===CAREER_ROSTER[index].id)
    && record(v.records) && Object.entries(v.records).every(([id,r])=>Boolean(careerOpponent(id)) && isCareerRecord(r))
    && v.victories.every(id=>record(v.records) && isCareerRecord(v.records[id]) && v.records[id].wins>0)
    && (v.lastResult===undefined || isResult(v.lastResult));
}
export function isCareerRun(v:unknown):v is CareerRun {
  if(!record(v) || typeof v.id!=='string' || !v.id.length || v.id.length>128
    || typeof v.opponentId!=='string') return false;
  const opponent=careerOpponent(v.opponentId);
  return Boolean(opponent) && finite(v.playerMaxHP) && v.playerMaxHP>0 && finite(v.playerMaxStamina) && v.playerMaxStamina>0
    && finite(v.playerDamage) && v.playerDamage>0
    && finite(v.hp) && v.hp<=v.playerMaxHP && finite(v.stamina) && v.stamina<=v.playerMaxStamina
    && finite(v.enemyHP) && v.enemyHP<=opponent!.maxHP && finite(v.enemyStamina) && v.enemyStamina<=opponent!.stamina
    && finite(v.elapsedMs) && v.elapsedMs<=COMBAT.roundDurationMs
    && finite(v.playerX) && v.playerX>=COMBAT.minX && v.playerX<=COMBAT.maxX
    && finite(v.enemyX) && v.enemyX>=COMBAT.minX && v.enemyX<=COMBAT.maxX
    && isScore(v,v.opponentId)
    && (!careerMatchOutcome(v as unknown as CareerRun)
      || roundOutcome(v.elapsedMs as number,{hp:v.hp as number,maxHP:v.playerMaxHP as number},
        {hp:v.enemyHP as number,maxHP:opponent!.maxHP})===careerMatchOutcome(v as unknown as CareerRun));
}

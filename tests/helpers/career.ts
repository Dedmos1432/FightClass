import type { SaveService } from '../../src/services/SaveService';
import { careerRoundNumber, careerMatchOutcome } from '../../src/career/Progress';
import type { RoundOutcome } from '../../src/combat/RoundRules';

export function settleCareerRound(saves:SaveService,outcome:RoundOutcome,timeout=false) {
  const run=saves.activeCareer;
  if(!run) throw new Error('No career match');
  saves.checkpointCareer(run.id,{...run,
    ...(outcome==='player' ? {enemyHP:0} : outcome==='enemy' ? {hp:0} : {hp:run.playerMaxHP}),
    ...(timeout || outcome==='draw' ? {elapsedMs:90_000} : {}),
  },careerRoundNumber(run));
  const result=saves.resolveCareerRound(run.id,careerRoundNumber(run));
  if(!result) throw new Error('Round could not be resolved');
  return result;
}
export function winCareerMatch(saves:SaveService,id:string) {
  const run=saves.beginCareer(id);
  if(!run) throw new Error(`Cannot start ${id}`);
  while(!careerMatchOutcome(saves.activeCareer!)) settleCareerRound(saves,'player');
  const result=saves.finishCareer(run.id);
  if(!result) throw new Error('Match could not be finished');
  return result;
}

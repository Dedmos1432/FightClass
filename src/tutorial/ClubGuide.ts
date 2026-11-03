export const CLUB_GUIDE_STEPS = ['gym-door','bench','press','gym-exit','dojo-door','dojo-start','complete'] as const;
export type ClubGuideStep = typeof CLUB_GUIDE_STEPS[number];
export interface ClubGuideProgress { step: ClubGuideStep; repsBefore: number }
export type ClubRoom = 'lobby' | 'gym' | 'dojo';
export const freshClubGuide = (repsBefore=0): ClubGuideProgress => ({step:'gym-door',repsBefore});
export function isClubGuide(value:unknown):value is ClubGuideProgress {
  if(typeof value!=='object' || value===null || Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  return CLUB_GUIDE_STEPS.includes(v.step as ClubGuideStep) && typeof v.repsBefore==='number' && Number.isSafeInteger(v.repsBefore) && v.repsBefore>=0;
}
export function nextClubGuideStep(step:ClubGuideStep):ClubGuideStep {
  return CLUB_GUIDE_STEPS[Math.min(CLUB_GUIDE_STEPS.length-1,CLUB_GUIDE_STEPS.indexOf(step)+1)];
}
/** Continue in the room containing the unfinished task, without changing the lobby position. */
export function clubGuideRoom(step:ClubGuideStep):ClubRoom {
  return step==='bench'||step==='press'||step==='gym-exit' ? 'gym' : step==='dojo-start' ? 'dojo' : 'lobby';
}
export function observedClubStep(progress:ClubGuideProgress,room:ClubRoom,benchActive:boolean,totalReps:number):ClubGuideStep {
  switch(progress.step) {
    case 'gym-door': return room==='gym' ? 'bench' : progress.step;
    case 'bench': return room==='gym' && benchActive ? 'press' : progress.step;
    case 'press': return totalReps>progress.repsBefore ? 'gym-exit' : progress.step;
    case 'gym-exit': return room==='lobby' ? 'dojo-door' : progress.step;
    case 'dojo-door': return room==='dojo' ? 'dojo-start' : progress.step;
    // Only successfully starting/resuming a series completes the final task.
    default: return progress.step;
  }
}

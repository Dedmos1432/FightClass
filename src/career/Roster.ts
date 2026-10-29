import type { EnemySkin, Opponent } from '../combat/Opponents';
import type { StyleId } from '../config/styles';

export type CareerClass = 1 | 2 | 3;
export interface CareerOpponent extends Opponent {
  career: true;
  tier: CareerClass;
  rank: number;
  order: number;
  boss: boolean;
}

interface Entry {
  skin: EnemySkin; name: string; style: StyleId; boss?: boolean; tactic: string;
  hp: number; stamina: number; damage: number; skill: number; reaction: number;
  aggression: number; defense: number; range: number; dodge: number; counter: number; combo: number;
}

/** The sequence follows the resource folders; Korean family names precede given names. */
const entries: readonly Entry[] = [
  { skin:'kim',name:'Kim Dong-won',style:'mma',hp:80,stamina:100,damage:8,skill:.76,reaction:210,
    aggression:.64,defense:.77,range:205,dodge:0,counter:.82,combo:.52,
    tactic:'Держит центр, читает повторяющиеся атаки и отвечает после промаха. Вместо уклонения использует блок и отход.' },
  { skin:'kwon',name:'Kwon Tae-young',style:'taekwondo',hp:92,stamina:108,damage:9,skill:.78,reaction:200,
    aggression:.66,defense:.8,range:252,dodge:.83,counter:.85,combo:.58,
    tactic:'Контролирует дальнюю дистанцию, выманивает длинную атаку и встречает на восстановлении.' },
  { skin:'yeo',name:'Yeo Eun-sol',style:'mma',hp:105,stamina:116,damage:10,skill:.81,reaction:185,
    aggression:.82,defense:.81,range:185,dodge:.75,counter:.87,combo:.72,
    tactic:'Забирает пространство короткими сериями, меняет темп и усиливает давление при нехватке выносливости у соперника.' },
  { skin:'shim',name:'Shim Ha-min',style:'mma',boss:true,hp:128,stamina:126,damage:12,skill:.86,reaction:160,
    aggression:.79,defense:.87,range:215,dodge:.88,counter:.91,combo:.8,
    tactic:'Изучает привычки, ловит конец серии и чередует контратаку с проходом за спину. Босс первого класса.' },
  { skin:'bang',name:'Bang Jung-eum',style:'muay-thai',hp:149,stamina:132,damage:13,skill:.88,reaction:150,
    aggression:.84,defense:.88,range:232,dodge:.79,counter:.92,combo:.82,
    tactic:'Не даёт восстановиться в безопасности: сокращает дистанцию, наказывает отход и расходует выносливость блока.' },
  { skin:'jang',name:'Jang Chun-soo',style:'taekwondo',hp:170,stamina:140,damage:14,skill:.9,reaction:145,
    aggression:.76,defense:.9,range:260,dodge:.93,counter:.94,combo:.84,
    tactic:'Заставляет промахиваться на краю дальности, отступает от разгона и точно выбирает момент для ответа.' },
  { skin:'cha',name:'Cha So-wol',style:'muay-thai',hp:192,stamina:148,damage:16,skill:.915,reaction:140,
    aggression:.86,defense:.91,range:220,dodge:.89,counter:.95,combo:.87,
    tactic:'Следит за защитой и запасом сил, меняет длину комбинаций и наказывает однообразный ритм атак.' },
  { skin:'young',name:'Young Woong',style:'boxing',boss:true,hp:218,stamina:158,damage:18,skill:.93,reaction:125,
    aggression:.89,defense:.94,range:192,dodge:.92,counter:.97,combo:.9,
    tactic:'Терпеливо провоцирует удар, перехватывает инициативу и закрывает пути отхода. Босс второго класса.' },
  { skin:'sunny',name:'Sunny Jaa',style:'freestyle',boss:true,hp:246,stamina:166,damage:20,skill:.945,reaction:115,
    aggression:.87,defense:.95,range:225,dodge:.95,counter:.98,combo:.92,
    tactic:'Чередует ложный отход и взрывное сближение, запоминает любимые атаки и ловит восстановление после уклонения.' },
  { skin:'lee',name:'Lee Ja-kyung',style:'freestyle',boss:true,hp:274,stamina:174,damage:22,skill:.96,reaction:105,
    aggression:.9,defense:.96,range:202,dodge:.96,counter:.985,combo:.94,
    tactic:'Читает серию целиком, меняет ответ на повторяемые приёмы и проходит за спину при затяжной атаке.' },
  { skin:'yang',name:'Yang Ki-hoon',style:'mma',boss:true,hp:302,stamina:182,damage:24,skill:.97,reaction:100,
    aggression:.93,defense:.97,range:210,dodge:.97,counter:.99,combo:.96,
    tactic:'Управляет дистанцией и собственным запасом сил; переходит от защиты к серии, как только замечает слабость.' },
  { skin:'maria',name:'Maria',style:'freestyle',boss:true,hp:336,stamina:192,damage:27,skill:.98,reaction:95,
    aggression:.94,defense:.98,range:225,dodge:.98,counter:.995,combo:.98,
    tactic:'Финальный босс. Подстраивается под ритм, защищается от привычных атак и использует каждое открытое восстановление.' },
];

export const CAREER_ROSTER: readonly CareerOpponent[] = entries.map((e, order) => ({
  id:e.skin, skin:e.skin, name:e.name, style:e.style, canDodge:e.skin !== 'kim',
  career:true, tier:(Math.floor(order / 4) + 1) as CareerClass, rank:order % 4 + 1, order,
  boss:Boolean(e.boss), index:order, difficulty:order + 10, variantName:e.boss ? 'Босс' : 'Карьерный соперник',
  tactic:e.tactic, maxHP:e.hp, stamina:e.stamina, damage:e.damage, speed:290 + order * 4,
  skill:e.skill, reactionMs:e.reaction, aggression:e.aggression, defense:e.defense,
  preferredRange:e.range, dodgePreference:e.dodge, counterPreference:e.counter,
  comboPreference:e.combo, comboChance:e.combo, reserve:30 + Math.floor(order * 1.2), hpBonus:0,
}));

export function careerOpponent(id: string): CareerOpponent | undefined {
  return CAREER_ROSTER.find(opponent => opponent.id === id);
}

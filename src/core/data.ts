import { MORALE } from './personalities';
import type { Grade, RosterEntry, TerrainDef, TerrainId } from './types';

export const GRID_W = 9;
export const GRID_H = 13;

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  plain: { id: 'plain', name: '평지', cost: 1, enCost: 1, groundPass: true, eva: 0, armor: 0, color: '#587a47' },
  forest: { id: 'forest', name: '숲', cost: 2, enCost: 2, groundPass: true, eva: 10, armor: 0, color: '#2f5d3a' },
  mountain: { id: 'mountain', name: '산', cost: 3, enCost: 3, groundPass: true, eva: 15, armor: 0.1, color: '#7a6a55' },
  city: { id: 'city', name: '도시', cost: 1, enCost: 1, groundPass: true, eva: 0, armor: 0.15, color: '#5e6b7d' },
  sea: { id: 'sea', name: '바다', cost: 1, enCost: 0, groundPass: false, eva: 0, armor: 0, color: '#2c5a8a' },
};

/** 적응 등급이 낮을수록 주는 피해·명중이 줄고, 피하는 힘도 줄어든다. */
export const GRADE: Record<Grade, { dmg: number; hit: number; eva: number }> = {
  A: { dmg: 1, hit: 0, eva: 0 },
  B: { dmg: 0.9, hit: -4, eva: -4 },
  C: { dmg: 0.8, hit: -8, eva: -8 },
  D: { dmg: 0.6, hit: -15, eva: -15 },
};

export const RULES = {
  minDamage: 150,
  /** 기력 차이가 이만큼 이상이면 추가 공격 */
  followGap: 30,
  evadeHitMul: 0.5,
  guardDmgMul: 0.5,
  focusBonus: 30,
  /** 능력치의 기준값(100). 반응이 이보다 높을수록 잘 피한다 */
  statBase: 100,
  reactWeight: 0.4,
  mobilityWeight: 0.25,
  hitMin: 5,
  hitMax: 100,
  /** 시작한 칸에서 움직이지 않고 턴을 마치면 회복되는 EN(소량). 공격했는지는 따지지 않는다 */
  restEn: 6,
  /** 공중 유닛이 한 칸 움직일 때 드는 EN. 지형과 상관없이 일정하다(대신 지형에 따른 이동력 감소가 없다) */
  airMoveEn: 2,
  turnLimit: 30,
};

const ALL_GROUND = (plain: Grade, forest: Grade, mountain: Grade, city: Grade, sea: Grade = 'D') => ({
  plain,
  forest,
  mountain,
  city,
  sea,
  air: 'D' as Grade,
});

export const ROSTER: RosterEntry[] = [
  {
    id: 'blazer',
    name: '블레이저 / 류진',
    blurb: '근접 파괴형. 붙으면 강하다. 카운터와 실드.',
    unit: {
      id: 'blazer',
      name: '블레이저',
      hp: 14000,
      en: 120,
      armor: 1250,
      mobility: 90,
      move: 6,
      moveClass: 'ground',
      adapt: ALL_GROUND('A', 'B', 'B', 'B'),
      weapons: [
        { name: '버스트 발칸', kind: 'shoot', power: 2400, minRange: 1, maxRange: 3, accuracy: 85, enCost: 0, ammo: 20, isP: false },
        { name: '하이퍼 소드', kind: 'melee', power: 5400, minRange: 1, maxRange: 1, accuracy: 90, enCost: 6, ammo: null, isP: false },
        { name: '파괴 드라이브', kind: 'melee', power: 9300, minRange: 1, maxRange: 1, accuracy: 80, enCost: 40, ammo: null, isP: true, minMorale: MORALE.finisher },
      ],
    },
    pilot: {
      id: 'ryujin',
      name: '류진',
      melee: 145,
      shoot: 90,
      personality: 'superBold',
      react: 100,
      defense: 95,
      sp: 110,
      spirits: ['sure', 'passion', 'fortitude', 'focus', 'spirit', 'repair'],
      abilities: ['counter', 'shield'],
    },
  },
  {
    id: 'longbow',
    name: '롱보우 / 세라',
    blurb: '저격형. 멀리서 쏘고 빠진다. 히트&어웨이.',
    unit: {
      id: 'longbow',
      name: '롱보우',
      hp: 10500,
      en: 140,
      armor: 900,
      mobility: 105,
      move: 5,
      moveClass: 'ground',
      adapt: ALL_GROUND('A', 'A', 'B', 'B'),
      weapons: [
        { name: '빔 라이플', kind: 'shoot', power: 3600, minRange: 2, maxRange: 5, accuracy: 90, enCost: 4, ammo: null, isP: false },
        { name: '롱 레인지 캐논', kind: 'shoot', power: 7200, minRange: 3, maxRange: 7, accuracy: 80, enCost: 35, ammo: null, isP: true, minMorale: MORALE.finisher },
        { name: '빔 나이프', kind: 'melee', power: 2700, minRange: 1, maxRange: 1, accuracy: 85, enCost: 0, ammo: 12, isP: false },
      ],
    },
    pilot: {
      id: 'sera',
      name: '세라',
      melee: 85,
      shoot: 150,
      personality: 'cool',
      react: 115,
      defense: 80,
      sp: 110,
      spirits: ['sure', 'flash', 'focus', 'haste', 'spirit', 'supply'],
      abilities: ['sniper', 'hitAway'],
    },
  },
  {
    id: 'zephyr',
    name: '제피르 / 카이',
    blurb: '공중 기동형. 바다도 넘고, 분신으로 피한다.',
    unit: {
      id: 'zephyr',
      name: '제피르',
      hp: 11000,
      en: 130,
      armor: 950,
      mobility: 120,
      move: 6,
      moveClass: 'air',
      adapt: { plain: 'D', forest: 'D', mountain: 'D', city: 'D', sea: 'D', air: 'A' },
      weapons: [
        { name: '미사일 포드', kind: 'shoot', power: 2700, minRange: 2, maxRange: 4, accuracy: 85, enCost: 0, ammo: 12, isP: false },
        { name: '플라즈마 건', kind: 'shoot', power: 4000, minRange: 1, maxRange: 4, accuracy: 88, enCost: 10, ammo: null, isP: false },
        { name: '초음속 슬래시', kind: 'melee', power: 5700, minRange: 1, maxRange: 1, accuracy: 85, enCost: 20, ammo: null, isP: true, minMorale: MORALE.finisher },
      ],
    },
    pilot: {
      id: 'kai',
      name: '카이',
      melee: 115,
      shoot: 120,
      personality: 'cautious',
      react: 140,
      defense: 70,
      sp: 120,
      spirits: ['flash', 'focus', 'haste', 'again', 'spirit', 'insight'],
      abilities: ['bunshin', 'agile'],
    },
  },
  {
    id: 'bulwark',
    name: '불워크 / 도윤',
    blurb: '중장갑형. 느리지만 단단하다. 배리어와 재생.',
    unit: {
      id: 'bulwark',
      name: '불워크',
      hp: 15000,
      en: 150,
      armor: 1500,
      mobility: 60,
      move: 4,
      moveClass: 'ground',
      adapt: ALL_GROUND('B', 'C', 'C', 'A'),
      weapons: [
        { name: '유도 미사일', kind: 'shoot', power: 3000, minRange: 2, maxRange: 6, accuracy: 80, enCost: 0, ammo: 10, isP: false },
        { name: '광자포', kind: 'shoot', power: 6300, minRange: 1, maxRange: 5, accuracy: 85, enCost: 30, ammo: null, isP: false },
        { name: '건틀릿', kind: 'melee', power: 4500, minRange: 1, maxRange: 1, accuracy: 85, enCost: 0, ammo: null, isP: false },
        { name: '대형 캐논', kind: 'shoot', power: 9300, minRange: 2, maxRange: 6, accuracy: 80, enCost: 50, ammo: null, isP: true, minMorale: MORALE.finisher },
      ],
    },
    pilot: {
      id: 'doyun',
      name: '도윤',
      melee: 110,
      shoot: 125,
      personality: 'bold',
      react: 85,
      defense: 140,
      sp: 110,
      spirits: ['fortitude', 'ironwall', 'repair', 'supply', 'sure', 'spirit'],
      abilities: ['barrier', 'regen'],
    },
  },
  {
    id: 'skylancer',
    name: '스카이랜서 / 미라',
    blurb: '공중 폭격형. 먼 거리에서 쏜다. 저격과 재생.',
    unit: {
      id: 'skylancer',
      name: '스카이랜서',
      hp: 12500,
      en: 140,
      armor: 1100,
      mobility: 95,
      move: 5,
      moveClass: 'air',
      adapt: { plain: 'D', forest: 'D', mountain: 'D', city: 'D', sea: 'D', air: 'A' },
      weapons: [
        { name: '기관포', kind: 'shoot', power: 2700, minRange: 1, maxRange: 3, accuracy: 85, enCost: 0, ammo: 20, isP: false },
        { name: '폭격 미사일', kind: 'shoot', power: 4500, minRange: 2, maxRange: 5, accuracy: 80, enCost: 15, ammo: null, isP: false },
        { name: '급강하 폭격', kind: 'shoot', power: 8800, minRange: 2, maxRange: 4, accuracy: 80, enCost: 45, ammo: null, isP: true, minMorale: MORALE.finisher },
      ],
    },
    pilot: {
      id: 'mira',
      name: '미라',
      melee: 90,
      shoot: 130,
      react: 105,
      defense: 100,
      sp: 100,
      personality: 'normal',
      spirits: ['sure', 'focus', 'spirit', 'repair', 'supply', 'again'],
      abilities: ['sniper', 'regen'],
    },
  },
];

import type {
  AbilityId,
  Grade,
  RosterEntry,
  SpiritId,
  TerrainDef,
  TerrainId,
} from './types';

export const GRID_W = 9;
export const GRID_H = 13;

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  plain: { id: 'plain', name: '평지', cost: 1, groundPass: true, eva: 0, armor: 0, color: '#587a47' },
  forest: { id: 'forest', name: '숲', cost: 2, groundPass: true, eva: 10, armor: 0, color: '#2f5d3a' },
  mountain: { id: 'mountain', name: '산', cost: 3, groundPass: true, eva: 15, armor: 0.1, color: '#7a6a55' },
  city: { id: 'city', name: '도시', cost: 1, groundPass: true, eva: 0, armor: 0.15, color: '#5e6b7d' },
  sea: { id: 'sea', name: '바다', cost: 1, groundPass: false, eva: 0, armor: 0, color: '#2c5a8a' },
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
  /** 기량 차이가 이만큼 이상이면 추가 공격 */
  followGap: 20,
  evadeHitMul: 0.5,
  guardDmgMul: 0.5,
  focusBonus: 30,
  skillWeight: 0.4,
  mobilityWeight: 0.25,
  hitMin: 5,
  hitMax: 100,
  /** 공격하지 않고 턴을 마치면 회복되는 EN */
  waitEn: 12,
  turnLimit: 30,
};

export const ABILITY_TUNING = {
  bunshin: { chance: 0.4, en: 10 },
  /** 방어력/200 이 발동 확률 */
  shield: { reduce: 1500 },
  barrier: { threshold: 1500, en: 5 },
  sniperRange: 1,
  regen: { hpRatio: 0.04, en: 10 },
  agileMove: 1,
};

export const ABILITIES: Record<AbilityId, { name: string; desc: string }> = {
  counter: { name: '카운터', desc: '반격을 선택하면 상대보다 먼저 공격한다.' },
  hitAway: { name: '히트&어웨이', desc: '공격한 뒤에도 남은 이동력만큼 이동할 수 있다.' },
  bunshin: { name: '분신', desc: `명중한 공격을 ${ABILITY_TUNING.bunshin.chance * 100}% 확률로 무효화한다. EN ${ABILITY_TUNING.bunshin.en} 소비.` },
  shield: { name: '실드 방어', desc: `피격 시 방어력에 비례한 확률로 피해를 ${ABILITY_TUNING.shield.reduce} 줄인다.` },
  barrier: { name: '배리어', desc: `${ABILITY_TUNING.barrier.threshold} 이하의 피해를 무효화한다. EN ${ABILITY_TUNING.barrier.en} 소비.` },
  sniper: { name: '저격', desc: `사격 무기(P무기 제외)의 사거리 +${ABILITY_TUNING.sniperRange}.` },
  regen: { name: '재생', desc: `턴 시작 시 HP ${ABILITY_TUNING.regen.hpRatio * 100}%, EN ${ABILITY_TUNING.regen.en} 회복.` },
  agile: { name: '기동 강화', desc: `이동력 +${ABILITY_TUNING.agileMove}.` },
};

export type SpiritEffect =
  | { t: 'sure' }
  | { t: 'flash' }
  | { t: 'taken'; mul: number }
  | { t: 'dealt'; mul: number }
  | { t: 'focus' }
  | { t: 'pierce' }
  | { t: 'move'; bonus: number }
  | { t: 'heal'; ratio: number }
  | { t: 'supply' }
  | { t: 'again' };

export interface SpiritDef {
  id: SpiritId;
  name: string;
  cost: number;
  desc: string;
  effect: SpiritEffect;
}

export const SPIRITS: Record<SpiritId, SpiritDef> = {
  sure: { id: 'sure', name: '필중', cost: 20, desc: '다음 공격이 반드시 명중한다.', effect: { t: 'sure' } },
  flash: { id: 'flash', name: '섬광', cost: 25, desc: '다음에 맞는 공격 1회를 반드시 피한다.', effect: { t: 'flash' } },
  fortitude: { id: 'fortitude', name: '불굴', cost: 15, desc: '다음에 맞는 공격 1회의 피해가 절반이 된다.', effect: { t: 'taken', mul: 0.5 } },
  ironwall: { id: 'ironwall', name: '철벽', cost: 35, desc: '다음에 맞는 공격 1회의 피해가 1/4이 된다.', effect: { t: 'taken', mul: 0.25 } },
  focus: { id: 'focus', name: '집중', cost: 20, desc: '내 다음 턴 시작까지 명중·회피 +30.', effect: { t: 'focus' } },
  spirit: { id: 'spirit', name: '기합', cost: 25, desc: '다음 공격의 피해가 1.5배가 된다.', effect: { t: 'dealt', mul: 1.5 } },
  passion: { id: 'passion', name: '열혈', cost: 45, desc: '다음 공격의 피해가 2배가 된다.', effect: { t: 'dealt', mul: 2 } },
  haste: { id: 'haste', name: '신속', cost: 15, desc: '이번 턴 이동력 +3.', effect: { t: 'move', bonus: 3 } },
  insight: { id: 'insight', name: '간파', cost: 15, desc: '다음 공격은 상대의 지형 회피 보너스를 무시한다.', effect: { t: 'pierce' } },
  repair: { id: 'repair', name: '수복', cost: 40, desc: 'HP를 30% 회복한다.', effect: { t: 'heal', ratio: 0.3 } },
  supply: { id: 'supply', name: '보급', cost: 30, desc: 'EN과 탄수를 모두 채운다.', effect: { t: 'supply' } },
  again: { id: 'again', name: '재동', cost: 50, desc: '행동한 뒤에 쓰면 한 번 더 행동한다.', effect: { t: 'again' } },
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
        { name: '파괴 드라이브', kind: 'melee', power: 9300, minRange: 1, maxRange: 1, accuracy: 80, enCost: 40, ammo: null, isP: true },
      ],
    },
    pilot: {
      id: 'ryujin',
      name: '류진',
      melee: 145,
      shoot: 90,
      skill: 115,
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
        { name: '롱 레인지 캐논', kind: 'shoot', power: 7200, minRange: 3, maxRange: 7, accuracy: 80, enCost: 35, ammo: null, isP: true },
        { name: '빔 나이프', kind: 'melee', power: 2700, minRange: 1, maxRange: 1, accuracy: 85, enCost: 0, ammo: 12, isP: false },
      ],
    },
    pilot: {
      id: 'sera',
      name: '세라',
      melee: 85,
      shoot: 150,
      skill: 135,
      react: 115,
      defense: 80,
      sp: 110,
      spirits: ['sure', 'flash', 'focus', 'haste', 'insight', 'supply'],
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
        { name: '초음속 슬래시', kind: 'melee', power: 5700, minRange: 1, maxRange: 1, accuracy: 85, enCost: 20, ammo: null, isP: true },
      ],
    },
    pilot: {
      id: 'kai',
      name: '카이',
      melee: 115,
      shoot: 120,
      skill: 150,
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
        { name: '대형 캐논', kind: 'shoot', power: 9300, minRange: 2, maxRange: 6, accuracy: 80, enCost: 50, ammo: null, isP: true },
      ],
    },
    pilot: {
      id: 'doyun',
      name: '도윤',
      melee: 110,
      shoot: 125,
      skill: 100,
      react: 85,
      defense: 140,
      sp: 110,
      spirits: ['fortitude', 'ironwall', 'repair', 'supply', 'sure', 'spirit'],
      abilities: ['barrier', 'regen'],
    },
  },
];

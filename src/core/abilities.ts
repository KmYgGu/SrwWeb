/**
 * 파일럿 특수 능력. 능력이 규칙에 끼어드는 방식(훅)을 능력마다 한 곳에서 정의한다.
 * 규칙 코드는 능력 이름을 직접 검사하지 않고 아래 조회 함수만 부른다.
 * 새 능력 = 이 표에 항목 하나 + types.ts 의 AbilityId 에 이름 하나.
 */
import type { AbilityId, PilotDef, WeaponDef } from './types';

export interface AbilityDef {
  name: string;
  desc: string;
  /** 반격을 고르면 상대보다 먼저 공격한다 */
  strikesFirstOnCounter?: boolean;
  /** 공격한 뒤에도 남은 이동력으로 이동할 수 있다 */
  moveAfterAttack?: boolean;
  moveBonus?: number;
  rangeBonus?: (w: WeaponDef) => number;
  turnStart?: { hpRatio?: number; en?: number };
  /** 명중한 공격을 확률로 무효화한다(EN 소비) */
  dodge?: { chance: number; en: number };
  /** 피해가 기준 이하면 무효화한다(EN 소비) */
  absorb?: { threshold: number; en: number };
  /** 확률로 피해를 깎는다. 확률은 파일럿 능력치에서 정한다 */
  reduce?: { chance: (p: PilotDef) => number; amount: number };
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  counter: {
    name: '카운터',
    desc: '반격을 선택하면 상대보다 먼저 공격한다.',
    strikesFirstOnCounter: true,
  },
  hitAway: {
    name: '히트&어웨이',
    desc: '공격한 뒤에도 남은 이동력만큼 이동할 수 있다.',
    moveAfterAttack: true,
  },
  bunshin: {
    name: '분신',
    desc: '명중한 공격을 40% 확률로 무효화한다. EN 10 소비.',
    dodge: { chance: 0.4, en: 10 },
  },
  shield: {
    name: '실드 방어',
    desc: '피격 시 방어력에 비례한 확률로 피해를 1500 줄인다.',
    reduce: { chance: (p) => p.defense / 200, amount: 1500 },
  },
  barrier: {
    name: '배리어',
    desc: '1500 이하의 피해를 무효화한다. EN 5 소비.',
    absorb: { threshold: 1500, en: 5 },
  },
  sniper: {
    name: '저격',
    desc: '사격 무기(P무기 제외)의 사거리 +1.',
    rangeBonus: (w) => (w.kind === 'shoot' && !w.isP ? 1 : 0),
  },
  regen: {
    name: '재생',
    desc: '턴 시작 시 HP 4%, EN 10 회복.',
    turnStart: { hpRatio: 0.04, en: 10 },
  },
  agile: {
    name: '기동 강화',
    desc: '이동력 +1.',
    moveBonus: 1,
  },
};

const defsOf = (p: PilotDef): AbilityDef[] => p.abilities.map((id) => ABILITIES[id]);

export const strikesFirstOnCounter = (p: PilotDef) => defsOf(p).some((a) => a.strikesFirstOnCounter);
export const movesAfterAttack = (p: PilotDef) => defsOf(p).some((a) => a.moveAfterAttack);
export const moveBonusOf = (p: PilotDef) => defsOf(p).reduce((s, a) => s + (a.moveBonus ?? 0), 0);
export const rangeBonusOf = (p: PilotDef, w: WeaponDef) =>
  defsOf(p).reduce((s, a) => s + (a.rangeBonus?.(w) ?? 0), 0);

export function turnStartOf(p: PilotDef): { hpRatio: number; en: number } {
  const out = { hpRatio: 0, en: 0 };
  for (const a of defsOf(p)) {
    out.hpRatio += a.turnStart?.hpRatio ?? 0;
    out.en += a.turnStart?.en ?? 0;
  }
  return out;
}

type ReactionKey = 'dodge' | 'absorb' | 'reduce';

/** 피격 때 끼어드는 능력들. 선언 순서(= 파일럿 능력 목록 순서)대로 처리한다. */
export function reactionsOf<K extends ReactionKey>(
  p: PilotDef,
  key: K,
): { id: AbilityId; def: NonNullable<AbilityDef[K]> }[] {
  const out: { id: AbilityId; def: NonNullable<AbilityDef[K]> }[] = [];
  for (const id of p.abilities) {
    const def = ABILITIES[id][key];
    if (def) out.push({ id, def: def as NonNullable<AbilityDef[K]> });
  }
  return out;
}

/**
 * 정신 커맨드. 각 커맨드는 효과 종류(effect)와 수치만 가진 데이터이고,
 * 효과 종류가 실제로 하는 일은 EFFECTS 표에 한 번만 적는다.
 * 새 커맨드 = SPIRITS 에 항목 추가(기존 효과 재사용). 새 효과 종류 = EFFECTS 에 핸들러 추가.
 *
 * 지속 효과(lasting)는 apply 때 unit.effects 에 등록하고, 효과가 끝나면 같은 목록에서 뺀다.
 * HUD 는 이 목록만 본다(Buffs 나 moveBudget 을 직접 해석하지 않는다).
 */
import { clampMorale, MORALE } from './personalities';
import type { SpiritId, TurnState, Unit } from './types';

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
  | { t: 'morale'; amount: number }
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
  spirit: { id: 'spirit', name: '기합', cost: 20, desc: '기력 +10.', effect: { t: 'morale', amount: 10 } },
  passion: { id: 'passion', name: '열혈', cost: 45, desc: '다음 공격의 피해가 2배가 된다.', effect: { t: 'dealt', mul: 2 } },
  haste: { id: 'haste', name: '신속', cost: 15, desc: '이번 턴 이동력 +3.', effect: { t: 'move', bonus: 3 } },
  insight: { id: 'insight', name: '간파', cost: 15, desc: '다음 공격은 상대의 지형 회피 보너스를 무시한다.', effect: { t: 'pierce' } },
  repair: { id: 'repair', name: '수복', cost: 40, desc: 'HP를 30% 회복한다.', effect: { t: 'heal', ratio: 0.3 } },
  supply: { id: 'supply', name: '보급', cost: 30, desc: 'EN과 탄수를 모두 채운다.', effect: { t: 'supply' } },
  again: { id: 'again', name: '재동', cost: 50, desc: '행동한 뒤에 쓰면 한 번 더 행동한다.', effect: { t: 'again' } },
};

export interface EffectCtx {
  unit: Unit;
  turn: TurnState;
  /** 이 유닛의 기본 이동력(능력 보정 포함) */
  baseMove: number;
  canMove: boolean;
  /** 지금 쓰는 정신(지속 효과 등록용) */
  spiritId: SpiritId;
}

interface Handler<E> {
  apply(e: E, c: EffectCtx): void;
  /** 규칙상 쓸 수 있는 상황인가(낭비 방지) */
  usable?(e: E, c: EffectCtx): boolean;
  /** 행동하기 전에만 의미가 있다(AI 가 행동 뒤에는 후보에서 뺀다) */
  beforeActionOnly?: boolean;
  /** AI: 지금 쓸 만한 상태인가 */
  worthCasting?(e: E, u: Unit): boolean;
  /** AI: 아껴 두는 값에 곱할 배율 */
  holdScale?(e: E, u: Unit): number;
  /**
   * 한동안 남아서 HUD 에 보여야 하는 효과인가.
   * true 이면 applySpirit 이 unit.effects 에 이름을 넣고, 효과가 끝날 때 같은 목록에서 뺀다.
   */
  lasting?: boolean;
}

type Handlers = { [K in SpiritEffect['t']]: Handler<Extract<SpiritEffect, { t: K }>> };

export function addEffect(u: Unit, id: SpiritId, label: string) {
  if (!u.effects.some((e) => e.id === id)) u.effects.push({ id, label });
}

export function removeEffects(u: Unit, pred: (id: SpiritId) => boolean) {
  u.effects = u.effects.filter((e) => !pred(e.id));
}

export function removeEffectsOfType(u: Unit, t: SpiritEffect['t']) {
  removeEffects(u, (id) => SPIRITS[id].effect.t === t);
}

export const EFFECTS: Handlers = {
  sure: {
    lasting: true,
    beforeActionOnly: true,
    apply: (_e, c) => void (c.unit.buffs.sure = true),
  },
  flash: {
    lasting: true,
    apply: (_e, c) => void (c.unit.buffs.flash = true),
  },
  taken: {
    lasting: true,
    apply: (e, c) => void (c.unit.buffs.takenMul *= e.mul),
  },
  dealt: {
    lasting: true,
    beforeActionOnly: true,
    apply: (e, c) => void (c.unit.buffs.dealtMul *= e.mul),
  },
  focus: {
    lasting: true,
    apply: (_e, c) => void (c.unit.buffs.focus = true),
  },
  pierce: {
    lasting: true,
    beforeActionOnly: true,
    apply: (_e, c) => void (c.unit.buffs.pierce = true),
  },
  move: {
    lasting: true,
    apply: (e, c) => void (c.turn.moveBudget += e.bonus),
    usable: (_e, c) => c.canMove,
  },
  heal: {
    apply: (e, c) => {
      c.unit.hp = Math.min(c.unit.def.hp, c.unit.hp + Math.round(c.unit.def.hp * e.ratio));
    },
    usable: (_e, c) => c.unit.hp < c.unit.def.hp,
    worthCasting: (_e, u) => u.hp / u.def.hp <= 0.85,
    // 덜 닳았을 때 쓰면 낭비라서, 실제로 채워지는 비율만큼 아끼는 값이 올라간다.
    holdScale: (e, u) => Math.min(3, e.ratio / Math.max(0.05, Math.min(e.ratio, 1 - u.hp / u.def.hp))),
  },
  supply: {
    apply: (_e, c) => {
      c.unit.en = c.unit.def.en;
      c.unit.ammo = c.unit.def.weapons.map((w) => w.ammo);
    },
    usable: (_e, c) =>
      c.unit.en < c.unit.def.en ||
      c.unit.ammo.some((a, i) => a !== null && a < (c.unit.def.weapons[i].ammo as number)),
  },
  morale: {
    apply: (e, c) => void (c.unit.morale = clampMorale(c.unit.morale + e.amount)),
    usable: (_e, c) => c.unit.morale < MORALE.max,
  },
  again: {
    apply: (_e, c) => {
      // 새 행동으로 넘어가므로 이번 턴 이동 보너스(신속)는 여기서 끝난다.
      removeEffectsOfType(c.unit, 'move');
      Object.assign(c.turn, {
        startPos: { ...c.unit.pos },
        acted: false,
        attackedInPlace: false,
        movedAfter: false,
        moveBudget: c.baseMove,
        moveEn: 0,
      });
    },
    usable: (_e, c) => c.turn.acted,
  },
};

/** effect 종류를 모르는 곳에서 쓰는 조회. 타입 정보는 호출 쪽에서 합쳐진다. */
export const handlerOf = (e: SpiritEffect): Handler<SpiritEffect> => EFFECTS[e.t] as Handler<SpiritEffect>;

/** lasting 효과가 있는 정신 id 목록(검사·문서용). */
export const lastingSpiritIds = (): SpiritId[] =>
  (Object.keys(SPIRITS) as SpiritId[]).filter((id) => handlerOf(SPIRITS[id].effect).lasting);

/**
 * HUD 가 보는 유일한 지속 효과 목록.
 * Buffs 나 이동력을 직접 해석하지 않는다 — 등록은 applySpirit / 해제는 규칙 코드가 한다.
 */
export function activeEffectLabels(u: Unit): string[] {
  return u.effects.map((e) => e.label);
}

/** @deprecated activeEffectLabels 로 통합. 기존 import 호환용 */
export const activeSpiritLabels = activeEffectLabels;

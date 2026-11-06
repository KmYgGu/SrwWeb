/**
 * 상대 AI.
 *
 * 한 턴의 계획(이동 칸 × 무기)마다
 *   ① 공방이 끝난 뒤의 기대 점수(HP 비율 차, EN 차, 승패)
 *   ② 상대가 다음 턴에 때릴 수 있는 최선의 한 방(이동·무기·내 방어 선택까지 읽은 위험도)
 * 을 합쳐 고른다. 상대의 방어 선택은 내 점수를 가장 깎는 쪽으로 가정한다.
 * 정신 커맨드는 "쓴 계획"과 "안 쓴 계획"의 점수 차이가 아껴 두는 값보다 클 때만 쓴다.
 */
import { RULES, SPIRITS } from '../core/data';
import {
  calcStrike,
  defenseOptions,
  effMaxRange,
  exchangeLeaves,
  fighterOf,
  gradeOf,
  groundBonus,
  hasAbility,
  inRange,
  weaponReady,
  type DefenseChoice,
  type Env,
  type Fighter,
} from '../core/exchange';
import {
  activeUnit,
  applySpirit,
  baseMove,
  castable,
  cloneState,
  envOf,
  foeUnit,
  moveRange,
} from '../core/game';
import { dist, keyPos, reachable, samePos } from '../core/map';
import type { Action, GameState, Pos, Side, SpiritId } from '../core/types';

export interface AiProfile {
  name: string;
  /** 상대 HP 를 깎는 일을 얼마나 중시하는가 */
  aggression: number;
  /** 상대의 반격·다음 턴 공격을 얼마나 두려워하는가 */
  caution: number;
  /** 정신 커맨드를 얼마나 아끼는가 */
  thrift: number;
}

export const PROFILES: Record<string, AiProfile> = {
  balanced: { name: '균형형', aggression: 1, caution: 1, thrift: 1 },
  hunter: { name: '공격형', aggression: 1.3, caution: 0.65, thrift: 0.8 },
  careful: { name: '신중형', aggression: 0.9, caution: 1.4, thrift: 1.15 },
};

interface Ctx {
  s: GameState;
  env: Env;
  me: Side;
  prof: AiProfile;
  /** 상대가 이번에 닿을 수 있는 칸 */
  oppReach: Pos[];
  /** 내 무기별로, 지금 자리에서 한 번 맞혔을 때 상대 HP 를 얼마나 깎는가(비율) */
  eDmg: number[];
  riskCache: Map<string, number>;
  /** 디버깅용: 계획별 점수를 쌓는다 */
  trace?: string[];
}

export function staticEval(prof: AiProfile, m: Fighter, o: Fighter): number {
  const mr = m.hp / m.u.def.hp;
  const or = o.hp / o.u.def.hp;
  if (o.hp <= 0) return 3 + mr * 0.5;
  if (m.hp <= 0) return -3 + (1 - or) * 0.5;
  return mr - prof.aggression * or + 0.06 * (m.en / m.u.def.en - o.en / o.u.def.en);
}

export function makeCtx(s: GameState, prof: AiProfile): Ctx {
  const me = activeUnit(s);
  const opp = foeUnit(s);
  const env = envOf(s);
  const reach = reachable(s.grid, opp.def.moveClass, opp.pos, baseMove(opp), null);
  const fm = fighterOf(me);
  const fo = fighterOf(opp);
  return {
    s,
    env,
    me: s.turn.side,
    prof,
    oppReach: [...reach.keys()].map(keyPos),
    eDmg: me.def.weapons.map((w) => {
      const st = calcStrike(env, fm, fo, w, false, false);
      return (st.hit * st.dmg) / opp.def.hp;
    }),
    riskCache: new Map(),
  };
}

const sig = (f: Fighter, maxHp: number, maxEn: number) =>
  [
    Math.floor((f.hp / maxHp) * 20),
    Math.floor((f.en / maxEn) * 6),
    f.b.sure ? 1 : 0,
    f.b.flash ? 1 : 0,
    f.b.takenMul,
    f.b.dealtMul,
    f.b.focus ? 1 : 0,
    f.b.pierce ? 1 : 0,
  ].join(',');

/**
 * m 이 지금 자리(m.pos)에 서 있을 때, 상대가 다음 턴에 가할 수 있는 최선의 한 방이
 * 내 점수를 얼마나 깎는가(0 이상). 상대는 가만히 있을 수도 있다.
 */
export function riskOf(ctx: Ctx, m: Fighter, o: Fighter): number {
  const key = `${m.pos.x},${m.pos.y}|${sig(m, m.u.def.hp, m.u.def.en)}|${sig(o, o.u.def.hp, o.u.def.en)}`;
  const hit = ctx.riskCache.get(key);
  if (hit !== undefined) return hit;

  const base = staticEval(ctx.prof, m, o);
  let best = base;
  o.u.def.weapons.forEach((w, wi) => {
    if (!weaponReady(o, wi, false)) return;
    const cands: { pos: Pos; rank: number }[] = [];
    for (const U of ctx.oppReach) {
      if (samePos(U, m.pos)) continue;
      if (!inRange(o, w, dist(U, m.pos))) continue;
      if (w.isP && !samePos(U, o.pos)) continue;
      const at = { ...o, pos: U };
      const gb = groundBonus(ctx.env, at);
      cands.push({ pos: U, rank: gb.eva + gb.armor * 100 + gradeOf(ctx.env, at).dmg * 10 + dist(U, m.pos) * 0.1 });
    }
    cands.sort((a, b) => b.rank - a.rank);
    for (const c of cands.slice(0, 4)) {
      const O = { ...o, pos: c.pos };
      let val = -Infinity;
      for (const d of defenseOptions(m, O)) {
        let v = 0;
        for (const lf of exchangeLeaves(ctx.env, O, m, wi, d)) v += lf.p * staticEval(ctx.prof, lf.d, lf.a);
        if (v > val) val = v;
      }
      if (val < best) best = val;
    }
  });
  const risk = Math.max(0, base - best);
  ctx.riskCache.set(key, risk);
  return risk;
}

/** 공격 후 이동(히트&어웨이)이 있으면 남은 이동력으로 닿는 칸 중 가장 안전한 곳 기준 */
function postRisk(ctx: Ctx, S: GameState, m: Fighter, o: Fighter, leftover: number): number {
  if (!hasAbility(m, 'hitAway') || leftover <= 0) return riskOf(ctx, m, o);
  let best = Infinity;
  const reach = reachable(S.grid, m.u.def.moveClass, m.pos, leftover, o.pos);
  for (const k of reach.keys()) best = Math.min(best, riskOf(ctx, { ...m, pos: keyPos(k) }, o));
  return best;
}

/** 이 자리에서 다음 턴에 공격이 닿을 가능성(가까울수록 큼). 거리를 좁히는 동기를 준다. */
function potential(ctx: Ctx, m: Fighter, o: Fighter): number {
  const d = dist(m.pos, o.pos);
  let best = 0;
  m.u.def.weapons.forEach((w, wi) => {
    if (!weaponReady(m, wi, false)) return;
    const reach = effMaxRange(m, w) + (w.isP ? 0 : baseMove(m.u));
    const v = d <= reach ? 1 : Math.max(0, 1 - (d - reach) / 8);
    best = Math.max(best, ctx.eDmg[wi] * v);
  });
  return best * 0.35 * ctx.prof.aggression * (1 + ctx.s.round / 12);
}

interface Plan {
  value: number;
  move: Pos | null;
  weapon: number | null;
}

interface AttackCand {
  pos: Pos;
  moved: boolean;
  wi: number;
  leftover: number;
  coarse: number;
}

export function search(ctx: Ctx, S: GameState): Plan {
  const me = activeUnit(S);
  const foe = foeUnit(S);
  const fm0 = fighterOf(me);
  const fo = fighterOf(foe);
  // 서로 안 때리고 버틴 라운드가 길어질수록 위험을 덜 따진다(교착 해소).
  const kappa = ctx.prof.caution / (1 + (S.round - S.lastClash) / 3);
  const reach = moveRange(S);
  const acted = S.turn.acted;

  let best: Plan = { value: -Infinity, move: null, weapon: null };
  const attacks: AttackCand[] = [];

  for (const [k, node] of reach) {
    const pos = keyPos(k);
    const moved = !samePos(pos, me.pos);
    const leftover = S.turn.mpLeft - node.cost;
    const fm: Fighter = { ...fm0, pos };
    const riskNow = postRisk(ctx, S, fm, fo, acted ? 0 : leftover);

    // 공격하지 않고 마치는 계획
    const waited: Fighter = acted ? fm : { ...fm, en: Math.min(me.def.en, fm.en + RULES.waitEn) };
    const wv = staticEval(ctx.prof, waited, fo) - kappa * riskOf(ctx, waited, fo) + potential(ctx, waited, fo);
    ctx.trace?.push(`wait@(${pos.x},${pos.y}) v=${wv.toFixed(3)} risk=${riskOf(ctx, waited, fo).toFixed(3)}`);
    if (wv > best.value) best = { value: wv, move: moved ? pos : null, weapon: null };

    if (acted) continue;
    const d = dist(pos, foe.pos);
    me.def.weapons.forEach((w, wi) => {
      if (!weaponReady(fm, wi, moved) || !inRange(fm, w, d)) return;
      let v = Infinity;
      for (const def of defenseOptions(fo, fm)) {
        let e = 0;
        for (const lf of exchangeLeaves(ctx.env, fm, fo, wi, def)) {
          const alive = lf.a.hp > 0 && lf.d.hp > 0;
          e += lf.p * (staticEval(ctx.prof, lf.a, lf.d) + (alive ? potential(ctx, lf.a, lf.d) - kappa * riskNow : 0));
        }
        if (e < v) v = e;
      }
      ctx.trace?.push(`atk@(${pos.x},${pos.y}) w${wi} coarse=${v.toFixed(3)} riskNow=${riskNow.toFixed(3)}`);
      attacks.push({ pos, moved, wi, leftover, coarse: v });
    });
  }

  // 상위 후보만 결과마다 정확한 위험도로 다시 계산한다.
  attacks.sort((a, b) => b.coarse - a.coarse);
  for (const c of attacks.slice(0, 6)) {
    const fm: Fighter = { ...fm0, pos: c.pos };
    let v = Infinity;
    for (const def of defenseOptions(fo, fm)) {
      let e = 0;
      for (const lf of exchangeLeaves(ctx.env, fm, fo, c.wi, def)) {
        const alive = lf.a.hp > 0 && lf.d.hp > 0;
        const adj = alive ? potential(ctx, lf.a, lf.d) - kappa * postRisk(ctx, S, lf.a, lf.d, c.leftover) : 0;
        e += lf.p * (staticEval(ctx.prof, lf.a, lf.d) + adj);
      }
      if (e < v) v = e;
    }
    if (v > best.value) best = { value: v, move: c.moved ? c.pos : null, weapon: c.wi };
  }
  return best;
}

/** 정신 커맨드를 아껴 둘 때의 값. 체력이 줄거나 시간이 흐를수록 싸진다. */
function holdCost(ctx: Ctx, S: GameState, id: SpiritId): number {
  const me = activeUnit(S);
  const hpRatio = me.hp / me.def.hp;
  const timeFactor = Math.max(0.35, 1 - S.round / RULES.turnLimit);
  let hold = SPIRITS[id].cost * 0.0045 * ctx.prof.thrift * (0.35 + 0.65 * hpRatio) * timeFactor;
  const e = SPIRITS[id].effect;
  // 회복은 덜 닳았을 때 쓰면 낭비라서, 실제로 채워지는 비율만큼 아끼는 값이 올라간다.
  if (e.t === 'heal') hold *= Math.min(3, e.ratio / Math.max(0.05, Math.min(e.ratio, 1 - hpRatio)));
  return hold;
}

const OFFENSIVE: SpiritId[] = ['sure', 'spirit', 'passion', 'insight'];

function spiritCandidates(S: GameState): SpiritId[] {
  const u = activeUnit(S);
  return u.pilot.spirits.filter((id) => {
    if (!castable(S, id)) return false;
    if (S.turn.acted && OFFENSIVE.includes(id)) return false;
    if (id === 'repair' && u.hp / u.def.hp > 0.85) return false;
    return true;
  });
}

/** 지금 상태에서 이어서 할 행동들. 마지막은 항상 공격이나 대기다. */
export function decide(s: GameState, prof: AiProfile): Action[] {
  const ctx = makeCtx(s, prof);
  let cur = cloneState(s);
  let plan = search(ctx, cur);
  const spirits: SpiritId[] = [];

  for (let round = 0; round < 4; round++) {
    let pick: { id: SpiritId; plan: Plan; state: GameState; gain: number } | null = null;
    for (const id of spiritCandidates(cur)) {
      const next = cloneState(cur);
      applySpirit(next, id);
      const p = search(ctx, next);
      const gain = p.value - plan.value - holdCost(ctx, cur, id);
      if (gain > 0 && (!pick || gain > pick.gain)) pick = { id, plan: p, state: next, gain };
    }
    if (!pick) break;
    spirits.push(pick.id);
    cur = pick.state;
    plan = pick.plan;
  }

  const acts: Action[] = spirits.map((id) => ({ type: 'spirit', id }));
  if (plan.move) acts.push({ type: 'move', to: plan.move });
  acts.push(plan.weapon === null ? { type: 'wait' } : { type: 'attack', weapon: plan.weapon });
  return acts;
}

/** 공격을 받는 쪽(AI)의 방어 선택. 반격·방어·회피 각각의 기대 점수로 고른다. */
export function chooseDefense(s: GameState, weapon: number, prof: AiProfile): DefenseChoice {
  const env = envOf(s);
  const fa = fighterOf(activeUnit(s));
  const fd = fighterOf(foeUnit(s));
  let best: DefenseChoice = { kind: 'guard' };
  let bestV = -Infinity;
  for (const d of defenseOptions(fd, fa)) {
    let v = 0;
    for (const lf of exchangeLeaves(env, fa, fd, weapon, d)) v += lf.p * staticEval(prof, lf.d, lf.a);
    if (v > bestV + 1e-9) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

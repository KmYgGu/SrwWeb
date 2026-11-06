/**
 * 상대 AI.
 *
 * 한 턴의 계획(이동 칸 × 무기)마다
 *   ① 공방이 끝난 뒤의 기대 점수(HP 비율 차, EN 차, 승패)
 *   ② 상대가 다음 턴에 때릴 수 있는 최선의 한 방(이동·무기·내 방어 선택까지 읽은 위험도)
 * 을 합쳐 고른다. 상대의 방어 선택은 내 점수를 가장 깎는 쪽으로 가정한다.
 * 정신 커맨드는 "쓴 계획"과 "안 쓴 계획"의 점수 차이가 아껴 두는 값보다 클 때만 쓴다.
 */
import { movesAfterAttack } from '../core/abilities';
import { GRID_H, GRID_W, RULES, TERRAINS } from '../core/data';
import {
  calcStrike,
  defenseOptions,
  effMaxRange,
  exchangeLeaves,
  fighterOf,
  gradeOf,
  groundBonus,
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
import { dist, inBounds, keyPos, reachable, samePos, tileKey } from '../core/map';
import { MORALE } from '../core/personalities';
import { handlerOf, SPIRITS } from '../core/spirits';
import type { Action, GameState, Pos, Side, SpiritId, Unit, WeaponDef } from '../core/types';

export interface AiProfile {
  name: string;
  /** 상대 HP 를 깎는 일을 얼마나 중시하는가 */
  aggression: number;
  /** 상대의 반격·다음 턴 공격을 얼마나 두려워하는가 */
  caution: number;
  /** 정신 커맨드를 얼마나 아끼는가 */
  thrift: number;
  /** 점수 함수의 세부. 성향이 아니라 AI 의 눈금이다. */
  tuning: AiTuning;
}

export interface AiTuning {
  /** 승패가 갈렸을 때의 점수 크기 */
  terminalScore: number;
  /** 승패가 갈렸을 때 남은 체력(또는 준 피해)이 더하는 비중 */
  terminalHpWeight: number;
  /** EN 비율 차이의 비중 */
  enWeight: number;
  /** 기력 차이 1점당 점수 */
  moraleWeight: number;
  /** 필살기를 쓸 수 있는 기력에 가까워진 정도(0~1)의 비중. 기력을 모으는 동기를 준다 */
  finisherWeight: number;
  /** 다음 턴 공격 가능성(거리를 좁히는 동기)의 비중 */
  potentialWeight: number;
  /** 라운드가 갈수록 potentialWeight 가 커지는 속도(1 + round / 이 값) */
  potentialGrowth: number;
  /** 공격이 닿는 거리를 벗어났을 때 가능성이 0 이 되기까지의 칸 수 */
  potentialFalloff: number;
  /** 공격 없이 버틴 라운드마다 위험 가중치를 줄이는 속도(1 + idle / 이 값) */
  idleDecay: number;
  /** 서로 안 때리고 버틴 라운드 하나당 공격 계획에 더해 주는 점수(교착 해소) */
  idleAttackRate: number;
  /** 그 보너스의 상한 */
  idleAttackCap: number;
  /** 정신 커맨드 1 SP 당 아끼는 값 */
  spiritHoldRate: number;
  /** 체력이 바닥일 때도 남는 아끼는 값의 비율 */
  spiritHoldHpFloor: number;
  /** 시간이 흘러도 남는 아끼는 값의 최소 비율 */
  spiritHoldTimeFloor: number;
  /** 한 턴에 연달아 고려하는 정신 커맨드 수 */
  spiritRounds: number;
  /** 결과마다 위험도를 다시 계산하는 상위 공격 후보 수 */
  refineTop: number;
  /** 위험 계산에서 상대의 무기마다 살펴보는 자리 수 */
  riskCandidates: number;
}

export const DEFAULT_TUNING: AiTuning = {
  terminalScore: 3,
  terminalHpWeight: 0.5,
  enWeight: 0.06,
  moraleWeight: 0.004,
  finisherWeight: 0.08,
  potentialWeight: 0.35,
  potentialGrowth: 12,
  potentialFalloff: 8,
  idleDecay: 3,
  idleAttackRate: 0.01,
  idleAttackCap: 0.2,
  spiritHoldRate: 0.0045,
  spiritHoldHpFloor: 0.35,
  spiritHoldTimeFloor: 0.35,
  spiritRounds: 4,
  refineTop: 6,
  riskCandidates: 4,
};

export const PROFILES: Record<string, AiProfile> = {
  balanced: { name: '균형형', aggression: 1, caution: 1, thrift: 1, tuning: DEFAULT_TUNING },
  hunter: { name: '공격형', aggression: 1.3, caution: 0.65, thrift: 0.8, tuning: DEFAULT_TUNING },
  careful: { name: '신중형', aggression: 0.9, caution: 1.4, thrift: 1.15, tuning: DEFAULT_TUNING },
};

/** 상대가 설 자리를 고를 때 후보를 줄이는 기준(지형이 좋은 자리, 멀리서 쏘는 자리 우선) */
const CANDIDATE_RANK = { armor: 100, grade: 10, distance: 0.1 };

interface Ctx {
  s: GameState;
  env: Env;
  me: Side;
  prof: AiProfile;
  /** 상대가 이번에 닿을 수 있는 칸 */
  oppReach: Pos[];
  /** 내 무기별로, 지금 자리에서 한 번 맞혔을 때 상대 HP 를 얼마나 깎는가(비율) */
  eDmg: number[];
  /** 무기별로, 각 칸에서 그 무기가 상대에게 닿는 자리까지 가는 이동 비용(지형 반영) */
  fireCost: Map<number, number>[];
  riskCache: Map<string, number>;
  /** 디버깅용: 계획별 점수를 쌓는다 */
  trace?: string[];
}

/** 필살기(기력 제한 무기)를 쓸 수 있는 기력에 얼마나 가까운가. 무기마다 0~1 이고 합한다. */
const finisherReadiness = (f: Fighter) =>
  f.u.def.weapons.reduce(
    (sum, w) =>
      w.minMorale === undefined
        ? sum
        : sum + Math.min(1, Math.max(0, (f.morale - MORALE.base) / (w.minMorale - MORALE.base))),
    0,
  );

export function staticEval(prof: AiProfile, m: Fighter, o: Fighter): number {
  const k = prof.tuning;
  const mr = m.hp / m.u.def.hp;
  const or = o.hp / o.u.def.hp;
  if (o.hp <= 0) return k.terminalScore + mr * k.terminalHpWeight;
  if (m.hp <= 0) return -k.terminalScore + (1 - or) * k.terminalHpWeight;
  return (
    mr -
    prof.aggression * or +
    k.enWeight * (m.en / m.u.def.en - o.en / o.u.def.en) +
    k.moraleWeight * (m.morale - o.morale) +
    k.finisherWeight * (finisherReadiness(m) - finisherReadiness(o))
  );
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
    fireCost: me.def.weapons.map((w) => costToFire(s, me, opp, w, effMaxRange(fm, w))),
    riskCache: new Map(),
  };
}

/**
 * 각 칸에서 상대에게 무기가 닿는 자리까지 가는 데 드는 이동 비용.
 * 거리만 보면 지형 때문에 못 가는 자리도 닿는다고 착각해 마지막 몇 칸을 좁히지 못하므로, 지형 비용을 반영한다.
 */
function costToFire(s: GameState, me: Unit, opp: Unit, w: WeaponDef, maxRange: number): Map<number, number> {
  const air = me.def.moveClass === 'air';
  const walkable = (x: number, y: number) =>
    inBounds(x, y) && !(x === opp.pos.x && y === opp.pos.y) && (air || TERRAINS[s.grid[y][x]].groundPass);
  const enter = (x: number, y: number) => (air ? 1 : TERRAINS[s.grid[y][x]].cost);
  const best = new Map<number, number>();
  const open: number[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const d = dist({ x, y }, opp.pos);
      if (d < w.minRange || d > maxRange || !walkable(x, y)) continue;
      best.set(tileKey(x, y), 0);
      open.push(tileKey(x, y));
    }
  }
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (best.get(open[i])! < best.get(open[bi])!) bi = i;
    const u = open.splice(bi, 1)[0];
    const { x, y } = keyPos(u);
    // n 에서 u 로 들어가는 비용 = u 칸의 진입 비용
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(nx, ny)) continue;
      const nd = best.get(u)! + enter(x, y);
      const nk = tileKey(nx, ny);
      if (nd < (best.get(nk) ?? Infinity)) {
        best.set(nk, nd);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return best;
}

const sig = (f: Fighter, maxHp: number, maxEn: number) =>
  [
    Math.floor((f.hp / maxHp) * 20),
    Math.floor((f.en / maxEn) * 6),
    Math.floor(f.morale / 5),
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
      cands.push({ pos: U, rank: gb.eva + gb.armor * CANDIDATE_RANK.armor + gradeOf(ctx.env, at).dmg * CANDIDATE_RANK.grade + dist(U, m.pos) * CANDIDATE_RANK.distance });
    }
    cands.sort((a, b) => b.rank - a.rank);
    for (const c of cands.slice(0, ctx.prof.tuning.riskCandidates)) {
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
  if (!movesAfterAttack(m.u.pilot) || leftover <= 0) return riskOf(ctx, m, o);
  let best = Infinity;
  const reach = reachable(S.grid, m.u.def.moveClass, m.pos, leftover, o.pos);
  for (const k of reach.keys()) best = Math.min(best, riskOf(ctx, { ...m, pos: keyPos(k) }, o));
  return best;
}

/** 이 자리에서 다음 턴에 공격이 닿을 가능성(가까울수록 큼). 거리를 좁히는 동기를 준다. */
function potential(ctx: Ctx, m: Fighter, o: Fighter): number {
  void o;
  const k = ctx.prof.tuning;
  const here = tileKey(m.pos.x, m.pos.y);
  let best = 0;
  m.u.def.weapons.forEach((w, wi) => {
    if (!weaponReady(m, wi, false)) return;
    const cost = ctx.fireCost[wi].get(here);
    if (cost === undefined) return;
    let v: number;
    if (w.isP) {
      // P무기는 움직이면 못 쏘므로, 지금 자리가 닿는 자리일 때만 온전히 친다.
      v = cost === 0 ? 1 : 0.5 * Math.max(0, 1 - cost / k.potentialFalloff);
    } else {
      const budget = baseMove(m.u);
      v = cost <= budget ? 1 : Math.max(0, 1 - (cost - budget) / k.potentialFalloff);
    }
    best = Math.max(best, ctx.eDmg[wi] * v);
  });
  return best * k.potentialWeight * ctx.prof.aggression * (1 + ctx.s.round / k.potentialGrowth);
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
  const idle = S.round - S.lastClash;
  const kappa = ctx.prof.caution / (1 + idle / ctx.prof.tuning.idleDecay);
  const idleBonus = Math.min(ctx.prof.tuning.idleAttackCap, idle * ctx.prof.tuning.idleAttackRate);
  const reach = moveRange(S);
  const acted = S.turn.acted;

  let best: Plan = { value: -Infinity, move: null, weapon: null };
  const attacks: AttackCand[] = [];

  for (const k of reach.keys()) {
    const pos = keyPos(k);
    // needsMove: 지금 칸에서 옮겨야 하는가. away: 이번 행동의 시작 칸을 벗어났는가(P무기·히트&어웨이 판정)
    const needsMove = !samePos(pos, me.pos);
    const away = !samePos(pos, S.turn.startPos);
    // 히트&어웨이는 제자리에서 공격했을 때만 공격 뒤에 움직일 수 있다.
    const leftover = away ? 0 : S.turn.moveBudget;
    const fm: Fighter = { ...fm0, pos };
    const riskNow = postRisk(ctx, S, fm, fo, acted ? 0 : leftover);

    // 공격하지 않고 마치는 계획
    const waited: Fighter = acted ? fm : { ...fm, en: Math.min(me.def.en, fm.en + RULES.waitEn) };
    const wv = staticEval(ctx.prof, waited, fo) - kappa * riskOf(ctx, waited, fo) + potential(ctx, waited, fo);
    ctx.trace?.push(`wait@(${pos.x},${pos.y}) v=${wv.toFixed(3)} risk=${riskOf(ctx, waited, fo).toFixed(3)}`);
    if (wv > best.value) best = { value: wv, move: needsMove ? pos : null, weapon: null };

    if (acted) continue;
    const d = dist(pos, foe.pos);
    me.def.weapons.forEach((w, wi) => {
      if (!weaponReady(fm, wi, away) || !inRange(fm, w, d)) return;
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
      v += idleBonus;
      attacks.push({ pos, moved: needsMove, wi, leftover, coarse: v });
    });
  }

  // 상위 후보만 결과마다 정확한 위험도로 다시 계산한다.
  attacks.sort((a, b) => b.coarse - a.coarse);
  for (const c of attacks.slice(0, ctx.prof.tuning.refineTop)) {
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
    v += idleBonus;
    if (v > best.value) best = { value: v, move: c.moved ? c.pos : null, weapon: c.wi };
  }
  return best;
}

/** 정신 커맨드를 아껴 둘 때의 값. 체력이 줄거나 시간이 흐를수록 싸진다. */
function holdCost(ctx: Ctx, S: GameState, id: SpiritId): number {
  const k = ctx.prof.tuning;
  const me = activeUnit(S);
  const def = SPIRITS[id];
  const hpRatio = me.hp / me.def.hp;
  const timeFactor = Math.max(k.spiritHoldTimeFloor, 1 - S.round / RULES.turnLimit);
  const hold =
    def.cost * k.spiritHoldRate * ctx.prof.thrift * (k.spiritHoldHpFloor + (1 - k.spiritHoldHpFloor) * hpRatio) * timeFactor;
  return hold * (handlerOf(def.effect).holdScale?.(def.effect, me) ?? 1);
}

function spiritCandidates(S: GameState): SpiritId[] {
  const u = activeUnit(S);
  return u.pilot.spirits.filter((id) => {
    if (!castable(S, id)) return false;
    const e = SPIRITS[id].effect;
    const h = handlerOf(e);
    if (S.turn.acted && h.beforeActionOnly) return false;
    return h.worthCasting?.(e, u) ?? true;
  });
}

/** 지금 상태에서 이어서 할 행동들. 마지막은 항상 공격이나 대기다. */
export function decide(s: GameState, prof: AiProfile): Action[] {
  const ctx = makeCtx(s, prof);
  let cur = cloneState(s);
  let plan = search(ctx, cur);
  const spirits: SpiritId[] = [];

  for (let round = 0; round < prof.tuning.spiritRounds; round++) {
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

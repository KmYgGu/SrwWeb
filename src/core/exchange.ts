/**
 * 공격 한 번이 불러오는 공방(공격 → 반격 → 추격)의 규칙.
 * 실제 전투(sampleExchange)와 AI의 기대값 계산(exchangeLeaves)이 같은 strikeBranches 를 쓰므로
 * 규칙이 두 군데로 갈라지지 않는다.
 */
import { rangeBonusOf, reactionsOf, strikesFirstOnCounter } from './abilities';
import { GRADE, RULES, TERRAINS } from './data';
import { dist } from './map';
import { clampMorale, MORALE, PERSONALITIES } from './personalities';
import type { AbilityId, Buffs, Pos, TerrainId, Unit, WeaponDef } from './types';

export interface Env {
  grid: TerrainId[][];
}

/** 한 유닛의 전투 중 스냅샷. 원본 Unit 은 건드리지 않는다. */
export interface Fighter {
  u: Unit;
  pos: Pos;
  hp: number;
  en: number;
  ammo: (number | null)[];
  morale: number;
  b: Buffs;
}

export const fighterOf = (u: Unit): Fighter => ({
  u,
  pos: u.pos,
  hp: u.hp,
  en: u.en,
  ammo: u.ammo.slice(),
  morale: u.morale,
  b: { ...u.buffs },
});

export type DefenseChoice =
  | { kind: 'counter'; weapon: number }
  | { kind: 'guard' }
  | { kind: 'evade' };

export type StrikeTag = 'main' | 'counter' | 'follow';

export interface StrikeEvent {
  /** 0 = 공격을 건 쪽, 1 = 받은 쪽 */
  by: 0 | 1;
  tag: StrikeTag;
  weapon: string;
  result: 'miss' | 'flash' | 'negated' | 'hit';
  dmg: number;
  /** result 가 negated 일 때 무효화한 능력 */
  ability?: AbilityId;
  /** 피해를 깎은 능력(실드 방어 등) */
  reducedBy?: AbilityId;
}

export interface Leaf {
  p: number;
  /** 공격을 건 쪽 */
  a: Fighter;
  /** 받은 쪽 */
  d: Fighter;
  events: StrikeEvent[];
}

export const effMaxRange = (f: Fighter, w: WeaponDef): number => w.maxRange + rangeBonusOf(f.u.pilot, w);

export const inRange = (f: Fighter, w: WeaponDef, d: number) =>
  d >= w.minRange && d <= effMaxRange(f, w);

export function weaponReady(f: Fighter, wi: number, afterMove: boolean): boolean {
  const w = f.u.def.weapons[wi];
  if (f.en < w.enCost) return false;
  if (f.morale < (w.minMorale ?? 0)) return false;
  if (w.ammo !== null && (f.ammo[wi] ?? 0) <= 0) return false;
  return !(afterMove && w.isP);
}

export function groundBonus(env: Env, f: Fighter): { eva: number; armor: number } {
  if (f.u.def.moveClass === 'air') return { eva: 0, armor: 0 };
  const t = TERRAINS[env.grid[f.pos.y][f.pos.x]];
  return { eva: t.eva, armor: t.armor };
}

export function gradeOf(env: Env, f: Fighter) {
  const key = f.u.def.moveClass === 'air' ? 'air' : env.grid[f.pos.y][f.pos.x];
  return GRADE[f.u.def.adapt[key]];
}

export interface StrikeStats {
  hit: number;
  dmg: number;
  flash: boolean;
}

/** 공격 한 번의 명중 확률(0~1)과 명중했을 때의 피해. 분신·배리어·실드는 여기에 포함하지 않는다. */
export function calcStrike(
  env: Env,
  S: Fighter,
  T: Fighter,
  w: WeaponDef,
  evade: boolean,
  guard: boolean,
): StrikeStats {
  if (T.b.flash) return { hit: 0, dmg: 0, flash: true };
  const sg = gradeOf(env, S);
  const tg = gradeOf(env, T);
  const tb = groundBonus(env, T);

  let hit: number;
  if (S.b.sure) {
    hit = 1;
  } else {
    const evasion =
      (T.u.def.mobility - 100) * RULES.mobilityWeight +
      (S.b.pierce ? 0 : tb.eva) +
      tg.eva +
      (T.b.focus ? RULES.focusBonus : 0);
    let h =
      w.accuracy +
      (RULES.statBase - T.u.pilot.react) * RULES.reactWeight +
      (S.morale - T.morale) * MORALE.hitPerPoint +
      sg.hit -
      evasion +
      (S.b.focus ? RULES.focusBonus : 0);
    h = Math.min(RULES.hitMax, Math.max(RULES.hitMin, h));
    if (evade) h *= RULES.evadeHitMul;
    hit = h / 100;
  }

  const stat = w.kind === 'melee' ? S.u.pilot.melee : S.u.pilot.shoot;
  const raw = w.power * (0.5 + stat / 200) * sg.dmg * S.b.dealtMul * (1 + (S.morale - MORALE.base) * MORALE.dmgPerPoint);
  const armor = T.u.def.armor * (0.5 + T.u.pilot.defense / 200) * (1 + tb.armor);
  let dmg = Math.max(RULES.minDamage, Math.round(raw - armor));
  if (guard) dmg = Math.max(RULES.minDamage, Math.round(dmg * RULES.guardDmgMul));
  return { hit, dmg, flash: false };
}

/**
 * 공격 한 번이 줄 수 있는 피해 합계(오버킬 표시용). 빗나감·실드·배리어는 따지지 않는 최대치다.
 * 이 게임에는 크리티컬이 없어서, followUps 가 true 이면 추격까지 더해 "운이 좋을 때"를 대신한다.
 * 상대의 섬광(첫 타 무효)과 피격 배율(불굴 등)은 반영한다.
 */
export function maxStrikeDamage(
  env: Env,
  atk: Fighter,
  def: Fighter,
  wi: number,
  followUps: boolean,
  guard = false,
): number {
  const w = atk.u.def.weapons[wi];
  const open: Fighter = def.b.flash ? { ...def, b: { ...def.b, flash: false } } : def;
  let per = calcStrike(env, atk, open, w, false, guard).dmg;
  if (def.b.takenMul !== 1) per = Math.max(RULES.minDamage, Math.round(per * def.b.takenMul));
  let hits = 1 + (followUps && atk.morale - def.morale >= RULES.followGap ? 1 : 0);
  if (def.b.flash) hits -= 1;
  return per * Math.max(0, hits);
}

export function counterWeapons(def: Fighter, atk: Fighter): number[] {
  const d = dist(def.pos, atk.pos);
  const out: number[] = [];
  def.u.def.weapons.forEach((w, i) => {
    if (weaponReady(def, i, false) && inRange(def, w, d)) out.push(i);
  });
  return out;
}

export function defenseOptions(def: Fighter, atk: Fighter): DefenseChoice[] {
  const opts: DefenseChoice[] = counterWeapons(def, atk).map((weapon) => ({ kind: 'counter', weapon }));
  opts.push({ kind: 'guard' }, { kind: 'evade' });
  return opts;
}

// ---- 공방 진행 ----

interface Step {
  by: 0 | 1;
  weapon: number;
  tag: StrikeTag;
}

interface X {
  f: [Fighter, Fighter];
  /** 각자 이번 공방에서 한 번이라도 공격했는가(추격의 조건) */
  did: [boolean, boolean];
  ev: StrikeEvent[];
}

interface Branch {
  p: number;
  x: X;
}

function buildSteps(atk: Fighter, def: Fighter, wi: number, choice: DefenseChoice): Step[] {
  const steps: Step[] = [];
  const cw = choice.kind === 'counter' ? choice.weapon : -1;
  const counterFirst = cw >= 0 && strikesFirstOnCounter(def.u.pilot);
  if (counterFirst) steps.push({ by: 1, weapon: cw, tag: 'counter' });
  steps.push({ by: 0, weapon: wi, tag: 'main' });
  if (cw >= 0 && !counterFirst) steps.push({ by: 1, weapon: cw, tag: 'counter' });
  const gap = atk.morale - def.morale;
  if (gap >= RULES.followGap) steps.push({ by: 0, weapon: wi, tag: 'follow' });
  if (cw >= 0 && -gap >= RULES.followGap) steps.push({ by: 1, weapon: cw, tag: 'follow' });
  return steps;
}

function canStep(x: X, step: Step): boolean {
  const S = x.f[step.by];
  const T = x.f[1 - step.by];
  if (S.hp <= 0 || T.hp <= 0) return false;
  if (step.tag === 'follow') return x.did[step.by];
  const w = S.u.def.weapons[step.weapon];
  return S.en >= w.enCost && (w.ammo === null || (S.ammo[step.weapon] ?? 0) > 0);
}

function pay(f: Fighter, wi: number, w: WeaponDef): Fighter {
  if (w.enCost === 0 && w.ammo === null) return f;
  const ammo = w.ammo === null ? f.ammo : f.ammo.map((a, i) => (i === wi ? (a as number) - 1 : a));
  return { ...f, en: f.en - w.enCost, ammo };
}

function strikeBranches(env: Env, x: X, step: Step, choice: DefenseChoice, rec: boolean): Branch[] {
  const s = step.by;
  const t = (1 - s) as 0 | 1;
  const T0 = x.f[t];
  const w = x.f[s].u.def.weapons[step.weapon];
  const S = step.tag === 'follow' ? x.f[s] : pay(x.f[s], step.weapon, w);

  const st = calcStrike(env, S, T0, w, choice.kind === 'evade' && s === 0, choice.kind === 'guard' && s === 0);
  const Sd: Fighter =
    S.b.sure || S.b.pierce || S.b.dealtMul !== 1
      ? { ...S, b: { ...S.b, sure: false, pierce: false, dealtMul: 1 } }
      : S;

  const make = (p: number, T: Fighter, info: Pick<StrikeEvent, 'result' | 'dmg' | 'ability' | 'reducedBy'>): Branch => {
    const f: [Fighter, Fighter] = [x.f[0], x.f[1]];
    // 타격 하나마다 양쪽의 기력이 성격표대로 오르내린다(무효화·섬광은 빗나감과 회피로 친다).
    const isHit = info.result === 'hit';
    const ps = PERSONALITIES[Sd.u.pilot.personality];
    const pt = PERSONALITIES[T.u.pilot.personality];
    f[s] = { ...Sd, morale: clampMorale(Sd.morale + (isHit ? ps.onHit : ps.onMiss)) };
    f[t] = { ...T, morale: clampMorale(T.morale + (isHit ? pt.onDamaged : pt.onDodge)) };
    const did: [boolean, boolean] = [x.did[0], x.did[1]];
    did[s] = true;
    const ev = rec ? [...x.ev, { by: s, tag: step.tag, weapon: w.name, ...info }] : x.ev;
    return { p, x: { f, did, ev } };
  };

  if (st.flash) return [make(1, { ...T0, b: { ...T0.b, flash: false } }, { result: 'flash', dmg: 0 })];

  const out: Branch[] = [];
  if (st.hit < 1) out.push(make(1 - st.hit, T0, { result: 'miss', dmg: 0 }));
  if (st.hit <= 0) return out;

  const pilot = T0.u.pilot;
  let pRem = st.hit;

  // 확률로 무효화(분신 등). 막지 못한 쪽은 EN 을 쓰지 않는다.
  for (const r of reactionsOf(pilot, 'dodge')) {
    if (T0.en < r.def.en) continue;
    const pn = pRem * r.def.chance;
    out.push(make(pn, { ...T0, en: T0.en - r.def.en }, { result: 'negated', dmg: 0, ability: r.id }));
    pRem -= pn;
  }

  let d = st.dmg;
  if (T0.b.takenMul !== 1) d = Math.max(RULES.minDamage, Math.round(d * T0.b.takenMul));

  // 기준 이하 피해 무효화(배리어 등). 막으면 정신 커맨드의 피격 배율은 쓰이지 않은 채 남는다.
  for (const r of reactionsOf(pilot, 'absorb')) {
    if (d <= r.def.threshold && T0.en >= r.def.en) {
      out.push(make(pRem, { ...T0, en: T0.en - r.def.en }, { result: 'negated', dmg: 0, ability: r.id }));
      return out;
    }
  }

  // 확률로 피해 감소(실드 방어 등)
  let cases: { p: number; dmg: number; by?: AbilityId }[] = [{ p: pRem, dmg: d }];
  for (const r of reactionsOf(pilot, 'reduce')) {
    const c = r.def.chance(pilot);
    if (c <= 0) continue;
    cases = cases.flatMap((k) => [
      { p: k.p * c, dmg: Math.max(RULES.minDamage, k.dmg - r.def.amount), by: r.id },
      { p: k.p * (1 - c), dmg: k.dmg, by: k.by },
    ]);
  }
  const landed: Fighter = { ...T0, b: T0.b.takenMul !== 1 ? { ...T0.b, takenMul: 1 } : T0.b };
  for (const k of cases) {
    out.push(make(k.p, { ...landed, hp: Math.max(0, T0.hp - k.dmg) }, { result: 'hit', dmg: k.dmg, reducedBy: k.by }));
  }
  return out;
}

const start = (atk: Fighter, def: Fighter): X => ({ f: [atk, def], did: [false, false], ev: [] });

/** 가능한 모든 결과와 그 확률. 이벤트 기록은 만들지 않는다. */
export function exchangeLeaves(
  env: Env,
  atk: Fighter,
  def: Fighter,
  wi: number,
  choice: DefenseChoice,
): Leaf[] {
  const steps = buildSteps(atk, def, wi, choice);
  const out: Leaf[] = [];
  const walk = (x: X, i: number, p: number) => {
    while (i < steps.length && !canStep(x, steps[i])) i++;
    if (i >= steps.length) {
      out.push({ p, a: x.f[0], d: x.f[1], events: x.ev });
      return;
    }
    for (const br of strikeBranches(env, x, steps[i], choice, false)) {
      if (br.p > 1e-9) walk(br.x, i + 1, p * br.p);
    }
  };
  walk(start(atk, def), 0, 1);
  return out;
}

/** 실제 전투: 난수로 한 가지 결과를 뽑고 이벤트를 남긴다. */
export function sampleExchange(
  env: Env,
  atk: Fighter,
  def: Fighter,
  wi: number,
  choice: DefenseChoice,
  rand: () => number,
): Leaf {
  let x = start(atk, def);
  for (const step of buildSteps(atk, def, wi, choice)) {
    if (!canStep(x, step)) continue;
    const brs = strikeBranches(env, x, step, choice, true);
    let r = rand();
    let pick = brs[brs.length - 1];
    for (const b of brs) {
      if (r < b.p) {
        pick = b;
        break;
      }
      r -= b.p;
    }
    x = pick.x;
  }
  return { p: 1, a: x.f[0], d: x.f[1], events: x.ev };
}

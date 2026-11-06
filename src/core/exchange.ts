/**
 * 공격 한 번이 불러오는 공방(공격 → 반격 → 추격)의 규칙.
 * 실제 전투(sampleExchange)와 AI의 기대값 계산(exchangeLeaves)이 같은 strikeBranches 를 쓰므로
 * 규칙이 두 군데로 갈라지지 않는다.
 */
import { ABILITY_TUNING, GRADE, RULES, TERRAINS } from './data';
import { dist } from './map';
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
  b: Buffs;
}

export const fighterOf = (u: Unit): Fighter => ({
  u,
  pos: u.pos,
  hp: u.hp,
  en: u.en,
  ammo: u.ammo.slice(),
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
  result: 'miss' | 'flash' | 'bunshin' | 'barrier' | 'hit';
  dmg: number;
  shield: boolean;
}

export interface Leaf {
  p: number;
  /** 공격을 건 쪽 */
  a: Fighter;
  /** 받은 쪽 */
  d: Fighter;
  events: StrikeEvent[];
}

export const hasAbility = (f: Fighter, id: AbilityId) => f.u.pilot.abilities.includes(id);

export function effMaxRange(f: Fighter, w: WeaponDef): number {
  const sniper = w.kind === 'shoot' && !w.isP && hasAbility(f, 'sniper');
  return w.maxRange + (sniper ? ABILITY_TUNING.sniperRange : 0);
}

export const inRange = (f: Fighter, w: WeaponDef, d: number) =>
  d >= w.minRange && d <= effMaxRange(f, w);

export function weaponReady(f: Fighter, wi: number, afterMove: boolean): boolean {
  const w = f.u.def.weapons[wi];
  if (f.en < w.enCost) return false;
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
      (S.u.pilot.skill - T.u.pilot.react) * RULES.skillWeight +
      sg.hit -
      evasion +
      (S.b.focus ? RULES.focusBonus : 0);
    h = Math.min(RULES.hitMax, Math.max(RULES.hitMin, h));
    if (evade) h *= RULES.evadeHitMul;
    hit = h / 100;
  }

  const stat = w.kind === 'melee' ? S.u.pilot.melee : S.u.pilot.shoot;
  const raw = w.power * (0.5 + stat / 200) * sg.dmg * S.b.dealtMul;
  const armor = T.u.def.armor * (0.5 + T.u.pilot.defense / 200) * (1 + tb.armor);
  let dmg = Math.max(RULES.minDamage, Math.round(raw - armor));
  if (guard) dmg = Math.max(RULES.minDamage, Math.round(dmg * RULES.guardDmgMul));
  return { hit, dmg, flash: false };
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
  const counterFirst = cw >= 0 && hasAbility(def, 'counter');
  if (counterFirst) steps.push({ by: 1, weapon: cw, tag: 'counter' });
  steps.push({ by: 0, weapon: wi, tag: 'main' });
  if (cw >= 0 && !counterFirst) steps.push({ by: 1, weapon: cw, tag: 'counter' });
  const gap = atk.u.pilot.skill - def.u.pilot.skill;
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

  const make = (
    p: number,
    T: Fighter,
    result: StrikeEvent['result'],
    dmg: number,
    shield = false,
  ): Branch => {
    const f: [Fighter, Fighter] = [x.f[0], x.f[1]];
    f[s] = Sd;
    f[t] = T;
    const did: [boolean, boolean] = [x.did[0], x.did[1]];
    did[s] = true;
    const ev = rec ? [...x.ev, { by: s, tag: step.tag, weapon: w.name, result, dmg, shield }] : x.ev;
    return { p, x: { f, did, ev } };
  };

  if (st.flash) return [make(1, { ...T0, b: { ...T0.b, flash: false } }, 'flash', 0)];

  const out: Branch[] = [];
  if (st.hit < 1) out.push(make(1 - st.hit, T0, 'miss', 0));
  if (st.hit <= 0) return out;

  let pRem = st.hit;
  if (hasAbility(T0, 'bunshin') && T0.en >= ABILITY_TUNING.bunshin.en) {
    const pb = pRem * ABILITY_TUNING.bunshin.chance;
    out.push(make(pb, { ...T0, en: T0.en - ABILITY_TUNING.bunshin.en }, 'bunshin', 0));
    pRem -= pb;
  }

  let d = st.dmg;
  if (T0.b.takenMul !== 1) d = Math.max(RULES.minDamage, Math.round(d * T0.b.takenMul));

  const bar = ABILITY_TUNING.barrier;
  if (hasAbility(T0, 'barrier') && d <= bar.threshold && T0.en >= bar.en) {
    out.push(make(pRem, { ...T0, en: T0.en - bar.en }, 'barrier', 0));
    return out;
  }

  const landed: Fighter = { ...T0, b: T0.b.takenMul !== 1 ? { ...T0.b, takenMul: 1 } : T0.b };
  const land = (dmg: number, p: number, shield: boolean) =>
    out.push(make(p, { ...landed, hp: Math.max(0, T0.hp - dmg) }, 'hit', dmg, shield));

  const pShield = hasAbility(T0, 'shield') ? T0.u.pilot.defense / 200 : 0;
  if (pShield > 0) {
    land(Math.max(RULES.minDamage, d - ABILITY_TUNING.shield.reduce), pRem * pShield, true);
    land(d, pRem * (1 - pShield), false);
  } else {
    land(d, pRem, false);
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

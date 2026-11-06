import { ABILITY_TUNING, RULES, SPIRITS } from './data';
import {
  counterWeapons,
  defenseOptions,
  fighterOf,
  hasAbility,
  inRange,
  sampleExchange,
  weaponReady,
  type DefenseChoice,
  type Env,
  type Fighter,
  type StrikeEvent,
} from './exchange';
import { buildGrid, dist, reachable, samePos, SPAWNS, tileKey, type ReachNode } from './map';
import type { Action, Buffs, GameState, RosterEntry, Side, SpiritId, Unit } from './types';

const freshBuffs = (): Buffs => ({
  sure: false,
  flash: false,
  takenMul: 1,
  dealtMul: 1,
  focus: false,
  pierce: false,
});

function newUnit(side: Side, entry: RosterEntry): Unit {
  return {
    side,
    def: entry.unit,
    pilot: entry.pilot,
    pos: { ...SPAWNS[side] },
    hp: entry.unit.hp,
    en: entry.unit.en,
    ammo: entry.unit.weapons.map((w) => w.ammo),
    sp: entry.pilot.sp,
    used: [],
    buffs: freshBuffs(),
  };
}

export function createGame(p0: RosterEntry, p1: RosterEntry, seed: number): GameState {
  const s: GameState = {
    grid: buildGrid(),
    units: [newUnit(0, p0), newUnit(1, p1)],
    turn: { side: 0, movedBefore: false, acted: false, movedAfter: false, mpLeft: 0 },
    round: 1,
    lastClash: 1,
    winner: null,
    rngState: seed >>> 0,
    log: [],
  };
  beginTurn(s);
  return s;
}

function cloneUnit(u: Unit): Unit {
  return { ...u, pos: { ...u.pos }, ammo: u.ammo.slice(), used: u.used.slice(), buffs: { ...u.buffs } };
}

/** AI가 가정을 세워 볼 때 쓰는 복사본. 지형은 바뀌지 않으므로 공유한다. */
export function cloneState(s: GameState): GameState {
  return { ...s, units: [cloneUnit(s.units[0]), cloneUnit(s.units[1])], turn: { ...s.turn }, log: [] };
}

export const envOf = (s: GameState): Env => ({ grid: s.grid });
export const activeUnit = (s: GameState): Unit => s.units[s.turn.side];
export const foeUnit = (s: GameState): Unit => s.units[1 - s.turn.side];

export function rand(s: GameState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const baseMove = (u: Unit) => u.def.move + (u.pilot.abilities.includes('agile') ? ABILITY_TUNING.agileMove : 0);

function beginTurn(s: GameState) {
  const u = activeUnit(s);
  u.buffs.focus = false;
  if (u.pilot.abilities.includes('regen')) {
    u.hp = Math.min(u.def.hp, u.hp + Math.round(u.def.hp * ABILITY_TUNING.regen.hpRatio));
    u.en = Math.min(u.def.en, u.en + ABILITY_TUNING.regen.en);
  }
  s.turn = { side: s.turn.side, movedBefore: false, acted: false, movedAfter: false, mpLeft: baseMove(u) };
}

function finish(s: GameState, winner: GameState['winner']) {
  s.winner = winner;
  s.log.push(winner === 'draw' ? '시간 종료: 무승부' : `승자: ${s.units[winner as Side].def.name}`);
}

function endTurn(s: GameState) {
  const u = activeUnit(s);
  if (!s.turn.acted) u.en = Math.min(u.def.en, u.en + RULES.waitEn);
  const next = (1 - s.turn.side) as Side;
  if (next === 0) {
    s.round++;
    if (s.round > RULES.turnLimit) {
      const r = (x: Unit) => x.hp / x.def.hp;
      const [a, b] = s.units;
      finish(s, Math.abs(r(a) - r(b)) < 1e-9 ? 'draw' : r(a) > r(b) ? 0 : 1);
      return;
    }
  }
  s.turn.side = next;
  beginTurn(s);
}

export function canMove(s: GameState): boolean {
  const t = s.turn;
  if (s.winner !== null || t.mpLeft <= 0) return false;
  if (!t.acted) return !t.movedBefore;
  return hasAbility(fighterOf(activeUnit(s)), 'hitAway') && !t.movedAfter;
}

export function moveRange(s: GameState): Map<number, ReachNode> {
  const u = activeUnit(s);
  return reachable(s.grid, u.def.moveClass, u.pos, canMove(s) ? s.turn.mpLeft : 0, foeUnit(s).pos);
}

export function castable(s: GameState, id: SpiritId): boolean {
  const u = activeUnit(s);
  const def = SPIRITS[id];
  if (s.winner !== null || !u.pilot.spirits.includes(id) || u.used.includes(id) || u.sp < def.cost) return false;
  switch (def.effect.t) {
    case 'again':
      return s.turn.acted;
    case 'heal':
      return u.hp < u.def.hp;
    case 'supply':
      return u.en < u.def.en || u.ammo.some((a, i) => a !== null && a < (u.def.weapons[i].ammo as number));
    case 'move':
      return canMove(s);
    default:
      return true;
  }
}

export function anyCastable(s: GameState): boolean {
  return activeUnit(s).pilot.spirits.some((id) => castable(s, id));
}

export function applySpirit(s: GameState, id: SpiritId) {
  const u = activeUnit(s);
  const def = SPIRITS[id];
  const e = def.effect;
  u.sp -= def.cost;
  u.used.push(id);
  switch (e.t) {
    case 'sure':
      u.buffs.sure = true;
      break;
    case 'flash':
      u.buffs.flash = true;
      break;
    case 'taken':
      u.buffs.takenMul *= e.mul;
      break;
    case 'dealt':
      u.buffs.dealtMul *= e.mul;
      break;
    case 'focus':
      u.buffs.focus = true;
      break;
    case 'pierce':
      u.buffs.pierce = true;
      break;
    case 'move':
      s.turn.mpLeft += e.bonus;
      break;
    case 'heal':
      u.hp = Math.min(u.def.hp, u.hp + Math.round(u.def.hp * e.ratio));
      break;
    case 'supply':
      u.en = u.def.en;
      u.ammo = u.def.weapons.map((w) => w.ammo);
      break;
    case 'again':
      s.turn = { side: s.turn.side, movedBefore: false, acted: false, movedAfter: false, mpLeft: baseMove(u) };
      break;
  }
}

/** 지금 위치에서 쓸 수 있는 무기 번호와 그 이유(UI 표시용) */
export function weaponStatus(s: GameState, unit: Unit, wi: number): 'ok' | 'en' | 'ammo' | 'p' | 'range' {
  const f = fighterOf(unit);
  const w = unit.def.weapons[wi];
  if (f.en < w.enCost) return 'en';
  if (w.ammo !== null && (f.ammo[wi] ?? 0) <= 0) return 'ammo';
  if (unit.side === s.turn.side && s.turn.movedBefore && w.isP) return 'p';
  const foe = s.units[1 - unit.side];
  return inRange(f, w, dist(unit.pos, foe.pos)) ? 'ok' : 'range';
}

export type Result =
  | { ok: true; events: StrikeEvent[]; attacker: Side }
  | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const done = (events: StrikeEvent[] = [], attacker: Side = 0): Result => ({ ok: true, events, attacker });

function writeBack(u: Unit, f: Fighter) {
  u.hp = f.hp;
  u.en = f.en;
  u.ammo = f.ammo.slice();
  u.buffs = { ...f.b };
}

function describe(ev: StrikeEvent, atk: Unit, def: Unit): string {
  const who = ev.by === 0 ? atk : def;
  const tgt = ev.by === 0 ? def : atk;
  const head = `${who.def.name}의 ${ev.weapon}`;
  switch (ev.result) {
    case 'miss':
      return `${head} - 빗나감`;
    case 'flash':
      return `${head} - ${tgt.def.name}이(가) 섬광으로 회피`;
    case 'bunshin':
      return `${head} - ${tgt.def.name}의 분신!`;
    case 'barrier':
      return `${head} - ${tgt.def.name}의 배리어가 막았다`;
    default:
      return `${head} - ${ev.dmg} 피해${ev.shield ? ' (실드 방어)' : ''}`;
  }
}

export function perform(s: GameState, action: Action, defense?: DefenseChoice): Result {
  if (s.winner !== null) return fail('이미 끝난 전투');
  const me = activeUnit(s);
  const foe = foeUnit(s);
  const t = s.turn;

  switch (action.type) {
    case 'spirit': {
      if (!castable(s, action.id)) return fail('쓸 수 없는 정신 커맨드');
      applySpirit(s, action.id);
      s.log.push(`${me.def.name}: 「${SPIRITS[action.id].name}」`);
      return done();
    }
    case 'move': {
      if (!canMove(s)) return fail('지금은 이동할 수 없다');
      if (samePos(action.to, me.pos)) return fail('같은 칸');
      const node = moveRange(s).get(tileKey(action.to.x, action.to.y));
      if (!node) return fail('갈 수 없는 칸');
      me.pos = { ...action.to };
      t.mpLeft -= node.cost;
      if (t.acted) t.movedAfter = true;
      else t.movedBefore = true;
      if (t.acted && !canMove(s) && !anyCastable(s)) endTurn(s);
      return done();
    }
    case 'attack': {
      if (t.acted) return fail('이미 공격했다');
      const wi = action.weapon;
      const w = me.def.weapons[wi];
      if (!w) return fail('없는 무기');
      const fa = fighterOf(me);
      const fd = fighterOf(foe);
      if (!weaponReady(fa, wi, t.movedBefore)) return fail('쓸 수 없는 무기');
      if (!inRange(fa, w, dist(me.pos, foe.pos))) return fail('사거리 밖');
      if (!defense) return fail('방어 선택이 필요하다');
      if (defense.kind === 'counter' && !counterWeapons(fd, fa).includes(defense.weapon)) {
        return fail('반격할 수 없는 무기');
      }
      const leaf = sampleExchange(envOf(s), fa, fd, wi, defense, () => rand(s));
      writeBack(me, leaf.a);
      writeBack(foe, leaf.d);
      for (const ev of leaf.events) s.log.push(describe(ev, me, foe));
      t.acted = true;
      s.lastClash = s.round;
      if (foe.hp <= 0) finish(s, me.side);
      else if (me.hp <= 0) finish(s, foe.side);
      else if (!canMove(s) && !anyCastable(s)) endTurn(s);
      return done(leaf.events, me.side);
    }
    case 'wait': {
      endTurn(s);
      return done();
    }
  }
}

export { defenseOptions };

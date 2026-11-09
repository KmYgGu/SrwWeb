import { ABILITIES, moveBonusOf, movesAfterAttack, turnStartOf } from './abilities';
import { RULES } from './data';
import {
  counterWeapons,
  defenseOptions,
  fighterOf,
  inRange,
  sampleExchange,
  weaponReady,
  type DefenseChoice,
  type Env,
  type Fighter,
  type StrikeEvent,
} from './exchange';
import { buildGrid, mapById } from './maps';
import { MORALE } from './personalities';
import { dist, reachable, samePos, tileKey, type ReachNode } from './map';
import { addEffect, handlerOf, removeEffectsOfType, SPIRITS, type EffectCtx } from './spirits';
import type { Action, Buffs, GameState, Pos, RosterEntry, Side, SpiritId, Unit } from './types';

const freshBuffs = (): Buffs => ({
  sure: false,
  flash: false,
  takenMul: 1,
  dealtMul: 1,
  focus: false,
  pierce: false,
});

function newUnit(side: Side, entry: RosterEntry, spawn: Pos): Unit {
  return {
    side,
    def: entry.unit,
    pilot: entry.pilot,
    pos: { ...spawn },
    hp: entry.unit.hp,
    en: entry.unit.en,
    ammo: entry.unit.weapons.map((w) => w.ammo),
    sp: entry.pilot.sp,
    used: [],
    lastWeapon: null,
    morale: MORALE.base,
    buffs: freshBuffs(),
    effects: [],
  };
}

export function createGame(p0: RosterEntry, p1: RosterEntry, seed: number, mapId?: string): GameState {
  const map = mapById(mapId ?? '');
  const s: GameState = {
    mapId: map.id,
    grid: buildGrid(map),
    units: [newUnit(0, p0, map.spawns[0]), newUnit(1, p1, map.spawns[1])],
    turn: { side: 0, startPos: { x: 0, y: 0 }, acted: false, attackedInPlace: false, movedAfter: false, moveBudget: 0, moveEn: 0 },
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
  return { ...u, pos: { ...u.pos }, ammo: u.ammo.slice(), used: u.used.slice(), buffs: { ...u.buffs }, effects: u.effects.map((e) => ({ ...e })) };
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

export const baseMove = (u: Unit) => u.def.move + moveBonusOf(u.pilot);

function beginTurn(s: GameState) {
  const u = activeUnit(s);
  u.buffs.focus = false;
  // 집중·신속은 내 턴이 다시 시작될 때 끝난다(HUD effects 도 같이 지운다).
  removeEffectsOfType(u, 'focus');
  removeEffectsOfType(u, 'move');
  const start = turnStartOf(u.pilot);
  if (start.hpRatio > 0) u.hp = Math.min(u.def.hp, u.hp + Math.round(u.def.hp * start.hpRatio));
  if (start.en > 0) u.en = Math.min(u.def.en, u.en + start.en);
  s.turn = {
    side: s.turn.side,
    startPos: { ...u.pos },
    acted: false,
    attackedInPlace: false,
    movedAfter: false,
    moveBudget: baseMove(u),
    moveEn: 0,
  };
}

function finish(s: GameState, winner: GameState['winner']) {
  s.winner = winner;
  s.log.push(winner === 'draw' ? '시간 종료: 무승부' : `승자: ${s.units[winner as Side].def.name}`);
}

function endTurn(s: GameState) {
  const u = activeUnit(s);
  if (samePos(u.pos, s.turn.startPos)) {
    const gain = Math.min(u.def.en - u.en, RULES.restEn);
    if (gain > 0) {
      u.en += gain;
      s.log.push(`${u.def.name} 제자리 대기 (EN +${gain})`);
    }
  }
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

/** 이번 행동의 시작 칸에서 벗어나 있는가(P무기는 이때 쓸 수 없다) */
export const hasMoved = (s: GameState): boolean => !samePos(activeUnit(s).pos, s.turn.startPos);

export function canMove(s: GameState): boolean {
  const t = s.turn;
  if (s.winner !== null || t.moveBudget <= 0) return false;
  // 공격 전에는 시작 칸의 이동 범위 안에서 몇 번이든 다시 고를 수 있다.
  // 공격 뒤에는 히트&어웨이이면서 제자리에서 공격했을 때만, 한 번 움직일 수 있다.
  if (!t.acted) return true;
  return t.attackedInPlace && !t.movedAfter && movesAfterAttack(activeUnit(s).pilot);
}

export function moveRange(s: GameState): Map<number, ReachNode> {
  const u = activeUnit(s);
  // 공격 전에는 시작 칸에서, 공격 뒤에는 지금 칸에서 잰다.
  const anchor = s.turn.acted ? u.pos : s.turn.startPos;
  const reach = reachable(s.grid, u.def.moveClass, anchor, canMove(s) ? s.turn.moveBudget : 0, foeUnit(s).pos);
  // 이동에는 EN 이 든다. 이번 행동에서 이미 낸 EN 까지 합친 만큼만 쓸 수 있고, 모자라는 칸은 갈 수 없다.
  const available = u.en + s.turn.moveEn;
  for (const [k, n] of reach) if (n.en > available) reach.delete(k);
  return reach;
}

const effectCtx = (s: GameState, u: Unit, spiritId: SpiritId, sideIsActive: boolean): EffectCtx => ({
  unit: u,
  turn: s.turn,
  baseMove: baseMove(u),
  // 비액티브 쪽은 이번 턴 이동권·행동권이 없으므로 신속/재동 usable 이 false 가 된다.
  canMove: sideIsActive && canMove(s),
  spiritId,
});

/**
 * 특정 진영 유닛이 그 정신을 쓸 수 있는가.
 * 평소에는 액티브만 쓰지만, 상대 공격 대응 중에는 방어 쪽(나)도 쓸 수 있게 한다.
 * 턴 상태(moveBudget·acted)를 건드리는 신속·재동은 자기 턴이 아니면 막는다.
 */
export function castableFor(s: GameState, side: Side, id: SpiritId): boolean {
  const u = s.units[side];
  const def = SPIRITS[id];
  if (s.winner !== null || !u.pilot.spirits.includes(id) || u.used.includes(id) || u.sp < def.cost) return false;
  const t = def.effect.t;
  if ((t === 'move' || t === 'again') && side !== s.turn.side) return false;
  return handlerOf(def.effect).usable?.(def.effect, effectCtx(s, u, id, side === s.turn.side)) ?? true;
}

export function castable(s: GameState, id: SpiritId): boolean {
  return castableFor(s, s.turn.side, id);
}

export function anyCastableFor(s: GameState, side: Side): boolean {
  return s.units[side].pilot.spirits.some((id) => castableFor(s, side, id));
}

export function anyCastable(s: GameState): boolean {
  return anyCastableFor(s, s.turn.side);
}

export function applySpiritFor(s: GameState, side: Side, id: SpiritId) {
  const u = s.units[side];
  const def = SPIRITS[id];
  u.sp -= def.cost;
  u.used.push(id);
  const h = handlerOf(def.effect);
  h.apply(def.effect, effectCtx(s, u, id, side === s.turn.side));
  // 지속 효과는 규칙 상태와 별도로 HUD 목록에 등록한다(신속처럼 Buffs 에 안 남는 것도 여기로).
  if (h.lasting) addEffect(u, id, def.name);
}

export function applySpirit(s: GameState, id: SpiritId) {
  applySpiritFor(s, s.turn.side, id);
}

/** 지금 위치에서 쓸 수 있는 무기 번호와 그 이유(UI 표시용) */
export function weaponStatus(s: GameState, unit: Unit, wi: number): 'ok' | 'en' | 'ammo' | 'morale' | 'p' | 'range' {
  const f = fighterOf(unit);
  const w = unit.def.weapons[wi];
  if (f.en < w.enCost) return 'en';
  if (w.ammo !== null && (f.ammo[wi] ?? 0) <= 0) return 'ammo';
  if (f.morale < (w.minMorale ?? 0)) return 'morale';
  if (unit.side === s.turn.side && hasMoved(s) && w.isP) return 'p';
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
  u.morale = f.morale;
  u.buffs = { ...f.b };
  // 공방에서 소모된 버프는 HUD 목록에서도 같은 기준으로 지운다.
  if (!f.b.sure) removeEffectsOfType(u, 'sure');
  if (!f.b.flash) removeEffectsOfType(u, 'flash');
  if (f.b.takenMul === 1) removeEffectsOfType(u, 'taken');
  if (f.b.dealtMul === 1) removeEffectsOfType(u, 'dealt');
  if (!f.b.focus) removeEffectsOfType(u, 'focus');
  if (!f.b.pierce) removeEffectsOfType(u, 'pierce');
}

const DEFENSE_NAME = { counter: '반격', guard: '방어', evade: '회피' };

function describe(ev: StrikeEvent, atk: Unit, def: Unit): string {
  const who = ev.by === 0 ? atk : def;
  const tgt = ev.by === 0 ? def : atk;
  const head = `${who.def.name}의 ${ev.firstStrike ? `${ABILITIES[ev.firstStrike].name}! ` : ''}${ev.weapon}`;
  switch (ev.result) {
    case 'miss':
      return `${head} - 빗나감`;
    case 'flash':
      return `${head} - ${tgt.def.name}이(가) 섬광으로 회피`;
    case 'negated':
      return `${head} - ${tgt.def.name}의 ${ABILITIES[ev.ability!].name}!`;
    default:
      return `${head} - ${ev.dmg} 피해${ev.reducedBy ? ` (${ABILITIES[ev.reducedBy].name})` : ''}`;
  }
}

/**
 * 턴은 'wait' 행동으로만 끝난다(전투가 끝난 경우 제외). 공격이나 이동, 정신 커맨드 뒤에 자동으로 끝내지 않는다.
 * 공격 뒤에 무엇이 남았는지(이동, 새 정신 커맨드)를 규칙이 일일이 따지면 정신이 늘 때마다 고쳐야 하기 때문이다.
 */
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
      // 다시 고른 이동은 시작 칸에서 새 목적지까지의 EN 과 이미 낸 EN 의 차액만 정산한다(돌아가면 돌려받는다).
      const delta = node.en - t.moveEn;
      me.en -= delta;
      t.moveEn = node.en;
      s.log.push(`${me.def.name} 이동 (EN ${delta > 0 ? '-' : '+'}${Math.abs(delta)})`);
      me.pos = { ...action.to };
      if (t.acted) t.movedAfter = true;
      return done();
    }
    case 'attack': {
      if (t.acted) return fail('이미 공격했다');
      const wi = action.weapon;
      const w = me.def.weapons[wi];
      if (!w) return fail('없는 무기');
      const fa = fighterOf(me);
      const fd = fighterOf(foe);
      const moved = hasMoved(s);
      if (!weaponReady(fa, wi, moved)) return fail('쓸 수 없는 무기');
      if (!inRange(fa, w, dist(me.pos, foe.pos))) return fail('사거리 밖');
      if (!defense) return fail('방어 선택이 필요하다');
      if (defense.kind === 'counter' && !counterWeapons(fd, fa).includes(defense.weapon)) {
        return fail('반격할 수 없는 무기');
      }
      const leaf = sampleExchange(envOf(s), fa, fd, wi, defense, () => rand(s));
      writeBack(me, leaf.a);
      writeBack(foe, leaf.d);
      s.log.push(`${foe.def.name}: ${DEFENSE_NAME[defense.kind]}`);
      for (const ev of leaf.events) s.log.push(describe(ev, me, foe));
      t.acted = true;
      t.attackedInPlace = !moved;
      t.moveEn = 0; // 공격 전의 이동은 여기서 확정된다
      me.lastWeapon = wi;
      if (defense.kind === 'counter' && leaf.events.some((ev) => ev.by === 1 && ev.tag === 'counter')) {
        foe.lastWeapon = defense.weapon;
      }
      s.lastClash = s.round;
      if (foe.hp <= 0) finish(s, me.side);
      else if (me.hp <= 0) finish(s, foe.side);
      return done(leaf.events, me.side);
    }
    case 'wait': {
      endTurn(s);
      return done();
    }
  }
}

export { defenseOptions };

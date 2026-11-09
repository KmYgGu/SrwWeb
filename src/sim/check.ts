/** 규칙의 핵심 약속을 짧게 확인한다. 실행: npm run check */
import assert from 'node:assert/strict';
import { bestCounter, chooseDefense, decide, PROFILES } from '../ai/ai';
import { ROSTER, RULES } from '../core/data';
import { calcStrike, counterWeapons, exchangeLeaves, fighterOf, maxStrikeDamage, sampleExchange, worstLoss } from '../core/exchange';
import { activeUnit, canMove, createGame, hasMoved, moveRange, perform, weaponStatus } from '../core/game';
import { dist, keyPos, reachable, tileKey } from '../core/map';
import { MORALE } from '../core/personalities';
import { activeSpiritLabels } from '../core/spirits';
import { aimTravel, moveDuration } from '../ui/session';

const blazer = ROSTER.find((r) => r.unit.id === 'blazer')!;
const longbow = ROSTER.find((r) => r.unit.id === 'longbow')!;

// 1. 이동은 얼마나 옮겼는지와 상관없이, 항상 이번 행동의 시작 칸에서 닿는 범위 안에서 다시 고를 수 있다.
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  const start = { ...me.pos };
  const budget = s.turn.moveBudget;
  const inRange = [...moveRange(s)].filter(([, n]) => n.cost >= budget - 2);
  // 시작 칸에서는 둘 다 닿지만, 서로에게서는 이동력으로 닿지 않는 두 칸을 찾는다.
  let pair: [number, number] | null = null;
  for (const [a] of inRange) {
    const fromA = reachable(s.grid, me.def.moveClass, keyPos(a), budget, s.units[1].pos);
    const b = inRange.find(([k]) => k !== a && !fromA.has(k));
    if (b) {
      pair = [a, b[0]];
      break;
    }
  }
  assert.ok(pair, '시험할 두 칸을 찾지 못함');
  assert.ok(perform(s, { type: 'move', to: keyPos(pair[0]) }).ok);
  assert.ok(perform(s, { type: 'move', to: keyPos(pair[1]) }).ok, 'A 에서 닿지 않아도 시작 칸에서 닿으면 이동');
  assert.equal(s.turn.moveBudget, budget, '이동해도 이동 범위는 줄지 않는다');
  assert.ok(perform(s, { type: 'move', to: start }).ok, '시작 칸으로 되돌아가기');
  assert.ok(!hasMoved(s));
  // 시작 칸에서 닿지 않는 칸은 갈 수 없다.
  const far = { x: start.x, y: Math.max(0, start.y - 9) };
  assert.ok(!perform(s, { type: 'move', to: far }).ok);
}

// 1-2. 이동에는 EN 이 든다: 지상은 들어가는 칸의 지형마다, 공중은 칸 수에 일정하게. 다시 고르면 차액만 정산한다.
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  const en0 = me.en;
  assert.ok(perform(s, { type: 'move', to: { x: 3, y: 11 } }).ok); // 평지
  assert.equal(me.en, en0 - 1, '평지는 EN 1');
  assert.ok(perform(s, { type: 'move', to: { x: 4, y: 10 } }).ok); // 산
  assert.equal(me.en, en0 - 3, '산은 EN 3');
  assert.ok(perform(s, { type: 'move', to: { x: 3, y: 11 } }).ok);
  assert.equal(me.en, en0 - 1, '다시 고르면 차액만큼 돌려받는다');
  assert.ok(perform(s, { type: 'move', to: { x: 4, y: 11 } }).ok);
  assert.equal(me.en, en0, '시작 칸으로 돌아오면 전부 돌려받는다');
  me.en = 1;
  assert.ok(!perform(s, { type: 'move', to: { x: 4, y: 10 } }).ok, 'EN 이 모자라면 산에는 못 간다');
  for (const k of moveRange(s).keys()) assert.ok(moveRange(s).get(k)!.en <= 1, '갈 수 있는 칸은 EN 안에 든다');

  const z = createGame(ROSTER.find((r) => r.unit.id === 'zephyr')!, blazer, 1);
  const air = activeUnit(z);
  const airEn0 = air.en;
  const node = moveRange(z).get(tileKey(4, 9))!; // (4,9): 산을 넘어 두 칸
  assert.equal(node.cost, 2, '공중은 지형과 상관없이 칸 수만큼의 이동력');
  assert.ok(perform(z, { type: 'move', to: { x: 4, y: 9 } }).ok);
  assert.equal(air.en, airEn0 - 2 * RULES.airMoveEn, '공중은 지형과 상관없이 칸마다 일정한 EN');
}

// 1-3. 히트&어웨이의 공격 뒤 이동에도 EN 이 든다.
{
  const s = createGame(longbow, blazer, 1);
  s.units[1].pos = { x: 4, y: 8 };
  assert.ok(perform(s, { type: 'attack', weapon: 0 }, { kind: 'guard' }).ok);
  const before = activeUnit(s).en;
  assert.ok(perform(s, { type: 'move', to: { x: 4, y: 12 } }).ok);
  assert.equal(activeUnit(s).en, before - 1, '평지 한 칸 = EN 1');
}

// 1-4. 제자리에서 턴을 마치면 EN 이 조금 회복되고, 움직였으면 회복되지 않는다.
{
  const rest = createGame(blazer, longbow, 1);
  activeUnit(rest).en = 100;
  assert.ok(perform(rest, { type: 'wait' }).ok);
  assert.equal(rest.units[0].en, 100 + RULES.restEn, '제자리 대기');

  const full = createGame(blazer, longbow, 1);
  assert.ok(perform(full, { type: 'wait' }).ok);
  assert.equal(full.units[0].en, full.units[0].def.en, '최대치를 넘지 않는다');

  const moved = createGame(blazer, longbow, 1);
  assert.ok(perform(moved, { type: 'move', to: { x: 3, y: 11 } }).ok);
  const enMoved = moved.units[0].en;
  assert.ok(perform(moved, { type: 'wait' }).ok);
  assert.equal(moved.units[0].en, enMoved, '움직였으면 회복 없음');

  const shot = createGame(blazer, longbow, 1);
  shot.units[1].pos = { x: 4, y: 10 };
  assert.ok(perform(shot, { type: 'attack', weapon: 1 }, { kind: 'guard' }).ok); // 하이퍼 소드 EN 6
  const enShot = shot.units[0].en;
  assert.ok(perform(shot, { type: 'wait' }).ok);
  assert.equal(shot.units[0].en, enShot + RULES.restEn, '제자리에서 공격하고 마쳐도 회복');
}

// 2. P무기는 시작 칸을 벗어나 있을 때만 막힌다(제자리로 돌아오면 다시 쓸 수 있다).
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  me.morale = MORALE.finisher; // 필살기는 기력이 있어야 쓴다
  s.units[1].pos = { x: 4, y: 10 };
  assert.equal(weaponStatus(s, me, 2), 'ok');
  assert.ok(perform(s, { type: 'move', to: { x: 3, y: 11 } }).ok);
  assert.equal(weaponStatus(s, me, 2), 'p');
  assert.ok(perform(s, { type: 'move', to: { x: 4, y: 11 } }).ok);
  assert.equal(weaponStatus(s, me, 2), 'ok');
}

// 3. 히트&어웨이는 제자리에서 공격했을 때만, 공격 뒤에 한 번 움직일 수 있다.
{
  const s = createGame(longbow, blazer, 1);
  s.units[1].pos = { x: 4, y: 8 };
  assert.ok(perform(s, { type: 'attack', weapon: 0 }, { kind: 'guard' }).ok);
  assert.ok(canMove(s), '제자리 공격 뒤에는 움직일 수 있다');
  assert.ok(perform(s, { type: 'move', to: { x: 4, y: 12 } }).ok);
  assert.ok(!canMove(s), '공격 뒤 이동은 한 번뿐');

  const t = createGame(longbow, blazer, 1);
  t.units[1].pos = { x: 4, y: 8 };
  assert.ok(perform(t, { type: 'move', to: { x: 4, y: 10 } }).ok);
  assert.ok(perform(t, { type: 'attack', weapon: 0 }, { kind: 'guard' }).ok);
  assert.ok(!canMove(t), '이동한 뒤 공격하면 공격 뒤에 움직일 수 없다');
}

// 3-2. 턴은 직접 끝낸다: 공격이나 이동, 정신 커맨드 뒤에 자동으로 넘어가지 않는다.
{
  const s = createGame(blazer, longbow, 1);
  s.units[1].pos = { x: 4, y: 10 };
  assert.ok(perform(s, { type: 'attack', weapon: 1 }, { kind: 'guard' }).ok);
  assert.equal(s.turn.side, 0, '공격 뒤에도 내 턴');
  assert.ok(perform(s, { type: 'wait' }).ok);
  assert.equal(s.turn.side, 1, '턴 종료를 눌러야 넘어간다');
}

// 4. 공격하면 쓴 무기가 기억되고, 반격이 실제로 나가면 맞은 쪽도 기억한다.
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  const foe = s.units[1];
  me.pos = { x: 4, y: 5 };
  s.turn.startPos = { x: 4, y: 5 };
  foe.pos = { x: 4, y: 3 };
  assert.equal(me.lastWeapon, null);
  assert.ok(perform(s, { type: 'attack', weapon: 0 }, { kind: 'counter', weapon: 0 }).ok);
  assert.equal(me.lastWeapon, 0);
  assert.equal(foe.lastWeapon, 0, '반격에 쓴 무기');
  assert.equal(dist(me.pos, foe.pos), 2);
}

// 5. 기력: 성격표대로 오르내린다(초강기 류진 vs 냉정 세라).
{
  const hit = createGame(blazer, longbow, 1);
  hit.units[1].pos = { x: 4, y: 10 };
  hit.units[0].buffs.sure = true; // 필중이라 반드시 맞는다
  assert.ok(perform(hit, { type: 'attack', weapon: 1 }, { kind: 'guard' }).ok);
  assert.equal(hit.units[0].morale, MORALE.base + 2, '초강기: 맞히면 +2');
  assert.equal(hit.units[1].morale, MORALE.base - 1, '냉정: 맞으면 -1');

  const miss = createGame(blazer, longbow, 1);
  miss.units[1].pos = { x: 4, y: 10 };
  miss.units[1].buffs.flash = true; // 섬광이라 반드시 빗나간다
  assert.ok(perform(miss, { type: 'attack', weapon: 1 }, { kind: 'guard' }).ok);
  assert.equal(miss.units[0].morale, MORALE.base - 2, '초강기: 빗나가면 -2');
  assert.equal(miss.units[1].morale, MORALE.base + 2, '냉정: 피하면 +2');
}

// 5-2. 필살기는 기력이 모자라면 쓸 수 없다.
{
  const s = createGame(blazer, longbow, 1);
  s.units[1].pos = { x: 4, y: 10 };
  assert.equal(weaponStatus(s, activeUnit(s), 2), 'morale');
  assert.ok(!perform(s, { type: 'attack', weapon: 2 }, { kind: 'guard' }).ok);
  activeUnit(s).morale = MORALE.finisher;
  assert.equal(weaponStatus(s, activeUnit(s), 2), 'ok');
}

// 5-3. 추격은 기력 차이가 기준 이상일 때만 붙는다.
{
  const run = (gap: number) => {
    const s = createGame(blazer, longbow, 1);
    s.units[1].pos = { x: 4, y: 10 };
    s.units[0].morale = MORALE.base + gap;
    s.units[0].buffs.sure = true;
    const r = perform(s, { type: 'attack', weapon: 1 }, { kind: 'guard' });
    assert.ok(r.ok);
    return r.ok ? r.events.length : 0;
  };
  assert.equal(run(RULES.followGap - 1), 1, '기준 미만이면 추격 없음');
  assert.equal(run(RULES.followGap), 2, '기준 이상이면 추격');
}

// 5-4. 기합은 기력을 10 올리고, 최대치를 넘지 않는다.
{
  const s = createGame(blazer, longbow, 1);
  assert.ok(perform(s, { type: 'spirit', id: 'spirit' }).ok);
  assert.equal(activeUnit(s).morale, MORALE.base + 10);
  const t = createGame(blazer, longbow, 1);
  activeUnit(t).morale = MORALE.max - 3;
  assert.ok(perform(t, { type: 'spirit', id: 'spirit' }).ok);
  assert.equal(activeUnit(t).morale, MORALE.max);
}

// 5-5. 오버킬 표시용 최대 피해: 추격과 섬광, 피격 배율을 반영한다.
{
  const s = createGame(blazer, longbow, 1);
  const env = { grid: s.grid };
  const a = fighterOf(s.units[0]);
  const d = fighterOf(s.units[1]);
  const one = maxStrikeDamage(env, a, d, 1, false);
  assert.ok(one > 0);
  assert.equal(maxStrikeDamage(env, a, d, 1, true), one, '기력 차이가 없으면 추격이 없다');
  const high = { ...a, morale: a.morale + RULES.followGap };
  assert.ok(maxStrikeDamage(env, high, d, 1, true) > one * 1.9, '기력 차이가 기준 이상이면 두 번 친다');
  assert.equal(maxStrikeDamage(env, a, { ...d, b: { ...d.b, flash: true } }, 1, false), 0, '섬광은 첫 타를 막는다');
  const half = maxStrikeDamage(env, a, { ...d, b: { ...d.b, takenMul: 0.5 } }, 1, false);
  assert.ok(half < one, '불굴은 피해를 줄인다');
}

// 5-6. 발동 중인 정신은 이름으로 보여 준다.
{
  const s = createGame(blazer, longbow, 1);
  const u = activeUnit(s);
  assert.deepEqual(activeSpiritLabels(u), []);
  perform(s, { type: 'spirit', id: 'sure' });
  perform(s, { type: 'spirit', id: 'fortitude' });
  assert.deepEqual(activeSpiritLabels(u), ['필중', '불굴']);
  u.buffs.takenMul = 0.125;
  assert.ok(activeSpiritLabels(u).includes('피격×0.125'), '겹친 배율은 수치로 적는다');
}

// 5-7. AI: 상대가 철벽이어도 멀쩡할 때는 반격·공격으로 벗겨 내고, 궁지에서는 맞붙는다.
{
  const bulwark = ROSTER.find((r) => r.unit.id === 'bulwark')!;
  const duel = (meHp: number, foeHp: number, side: 0 | 1) => {
    const s = createGame(bulwark, blazer, 1);
    const [a, b] = s.units;
    a.pos = { x: 6, y: 7 };
    b.pos = { x: 6, y: 6 };
    a.hp = meHp;
    b.hp = foeHp;
    b.morale = 126;
    a.buffs.takenMul = 0.25;
    s.turn.side = side;
    s.turn.startPos = { ...s.units[side].pos };
    s.turn.moveBudget = s.units[side].def.move;
    return s;
  };
  const prof = PROFILES.balanced;
  assert.equal(chooseDefense(duel(12000, 12000, 0), 1, prof).kind, 'counter', '멀쩡하면 철벽 상대에게도 반격');
  assert.ok(decide(duel(12000, 12000, 1), prof).some((a) => a.type === 'attack'), '멀쩡하면 철벽 상대를 공격');
  assert.ok(decide(duel(4751, 2464, 1), prof).some((a) => a.type === 'attack'), '궁지에서는 맞붙는다');
  const log = duel(12000, 12000, 0);
  assert.ok(perform(log, { type: 'attack', weapon: 1 }, { kind: 'guard' }).ok);
  assert.ok(log.log.includes('블레이저: 방어'), '상대의 선택이 로그에 남는다');
}

// 5-8. 공방 예고: 잃을 수 있는 최대치가 전투 규칙과 같고, 반격 추천 무기는 실제로 쓸 수 있는 것이다.
{
  const s = createGame(ROSTER.find((r) => r.unit.id === 'bulwark')!, blazer, 1);
  const [a, b] = s.units;
  a.pos = { x: 6, y: 7 };
  b.pos = { x: 6, y: 6 };
  const env = { grid: s.grid };
  const fa = fighterOf(a);
  const fd = fighterOf(b);
  const wi = a.def.weapons.findIndex((w) => w.maxRange >= 1 && w.minRange <= 1 && !w.minMorale);
  const guard = worstLoss(env, fa, fd, wi, { kind: 'guard' });
  const evade = worstLoss(env, fa, fd, wi, { kind: 'evade' });
  assert.ok(guard.def.hp > 0 && guard.def.hp < evade.def.hp, '방어는 잃는 체력을 줄인다');
  assert.equal(guard.atk.hp, 0, '방어하면 공격한 쪽은 체력을 잃지 않는다');
  assert.equal(guard.atk.en, a.def.weapons[wi].enCost, '공격한 쪽은 무기의 EN 을 쓴다');
  const usable = counterWeapons(fd, fa);
  s.turn.side = 0;
  const rec = bestCounter(s, wi, PROFILES.balanced);
  assert.ok(rec !== null && usable.includes(rec), '추천 무기는 쓸 수 있는 반격 무기다');
  assert.ok(worstLoss(env, fa, fd, wi, { kind: 'counter', weapon: rec! }).atk.hp > 0, '반격하면 공격한 쪽도 맞을 수 있다');
}

// 5-9. 능력 발동: 베어내기는 격투 무기만 막고, 카운터로 먼저 친 공격은 기록에 능력이 남는다.
{
  const s = createGame(longbow, blazer, 1);
  const [a, b] = s.units;
  a.pos = { x: 6, y: 7 };
  b.pos = { x: 6, y: 6 };
  const env = { grid: s.grid };
  const fa = fighterOf(a);
  const fd = fighterOf(b);
  const untouched = (wi: number) =>
    exchangeLeaves(env, fa, fd, wi, { kind: 'guard' }).filter((l) => l.d.hp === fd.hp).reduce((sum, l) => sum + l.p, 0);
  const missOf = (wi: number) => 1 - calcStrike(env, fa, fd, a.def.weapons[wi], false, true).hit;
  const knife = a.def.weapons.findIndex((w) => w.kind === 'melee');
  const rifle = a.def.weapons.findIndex((w) => w.kind === 'shoot' && !w.minMorale);
  assert.ok(untouched(knife) > missOf(knife) + 0.1, '베어내기는 격투 무기를 막는다');
  assert.ok(Math.abs(untouched(rifle) - missOf(rifle)) < 1e-9, '베어내기는 사격 무기를 막지 않는다');
  const cw = counterWeapons(fd, fa)[0];
  const leaf = sampleExchange(env, fa, fd, knife, { kind: 'counter', weapon: cw }, () => 0.99);
  assert.equal(leaf.events[0].by, 1);
  assert.equal(leaf.events[0].firstStrike, 'counter', '카운터로 먼저 친 공격에 능력이 기록된다');
  assert.ok(leaf.events.slice(1).every((e) => !e.firstStrike), '나머지 공격에는 붙지 않는다');
}

// 6. 연출 시간: 이동은 거리와 상관없이 1초 이내, 조준선은 같은 칸 수에서 항상 이동보다 빠르다.
for (let steps = 1; steps <= 300; steps++) {
  const ms = moveDuration(steps);
  assert.ok(ms <= 1000 && ms >= 100, `이동 ${steps}칸: ${ms}ms`);
  assert.ok(aimTravel(steps) <= ms, `조준선(${aimTravel(steps)}ms)이 이동(${ms}ms)보다 빨라야 한다 (${steps}칸)`);
  assert.ok(aimTravel(steps) >= 100, '조준선이 눈에 보일 만큼은 걸려야 한다');
}

console.log('check: 모두 통과');

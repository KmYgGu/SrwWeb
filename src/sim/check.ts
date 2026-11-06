/** 규칙의 핵심 약속을 짧게 확인한다. 실행: npm run check */
import assert from 'node:assert/strict';
import { ROSTER, RULES } from '../core/data';
import { activeUnit, canMove, createGame, hasMoved, moveRange, perform, weaponStatus } from '../core/game';
import { dist, keyPos, reachable } from '../core/map';
import { MORALE } from '../core/personalities';
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

// 6. 연출 시간: 이동은 거리와 상관없이 1초 이내, 조준선은 같은 칸 수에서 항상 이동보다 빠르다.
for (let steps = 1; steps <= 300; steps++) {
  const ms = moveDuration(steps);
  assert.ok(ms <= 1000 && ms >= 100, `이동 ${steps}칸: ${ms}ms`);
  assert.ok(aimTravel(steps) <= ms, `조준선(${aimTravel(steps)}ms)이 이동(${ms}ms)보다 빨라야 한다 (${steps}칸)`);
  assert.ok(aimTravel(steps) >= 100, '조준선이 눈에 보일 만큼은 걸려야 한다');
}

console.log('check: 모두 통과');

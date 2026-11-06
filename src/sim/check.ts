/** 규칙의 핵심 약속을 짧게 확인한다. 실행: npm run check */
import assert from 'node:assert/strict';
import { ROSTER } from '../core/data';
import { activeUnit, canMove, createGame, hasMoved, moveRange, perform, weaponStatus } from '../core/game';
import { dist, keyPos, reachable } from '../core/map';
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

// 5. 연출 시간: 이동은 거리와 상관없이 1초 이내, 조준선은 같은 칸 수에서 항상 이동보다 빠르다.
for (let steps = 1; steps <= 300; steps++) {
  const ms = moveDuration(steps);
  assert.ok(ms <= 1000 && ms >= 100, `이동 ${steps}칸: ${ms}ms`);
  assert.ok(aimTravel(steps) <= ms, `조준선(${aimTravel(steps)}ms)이 이동(${ms}ms)보다 빨라야 한다 (${steps}칸)`);
  assert.ok(aimTravel(steps) >= 100, '조준선이 눈에 보일 만큼은 걸려야 한다');
}

console.log('check: 모두 통과');

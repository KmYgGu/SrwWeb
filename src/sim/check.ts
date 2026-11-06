/** 규칙의 핵심 약속을 짧게 확인한다. 실행: npm run check */
import assert from 'node:assert/strict';
import { ROSTER } from '../core/data';
import { activeUnit, createGame, moveRange, perform, weaponStatus } from '../core/game';
import { dist, keyPos } from '../core/map';
import { moveDuration } from '../ui/session';

const blazer = ROSTER.find((r) => r.unit.id === 'blazer')!;
const longbow = ROSTER.find((r) => r.unit.id === 'longbow')!;

// 1. 이동 후에도 남은 이동력 안에서 다른 칸으로 다시 이동할 수 있다.
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  const budget = s.turn.mpLeft;
  const first = [...moveRange(s)].find(([, n]) => n.cost === 2)!;
  assert.ok(perform(s, { type: 'move', to: keyPos(first[0]) }).ok);
  assert.equal(s.turn.mpLeft, budget - 2);
  const second = [...moveRange(s)].find(([k, n]) => n.cost >= 1 && k !== first[0])!;
  assert.ok(perform(s, { type: 'move', to: keyPos(second[0]) }).ok, '두 번째 이동');
  assert.equal(s.turn.mpLeft, budget - 2 - second[1].cost);
  // 이동했으니 P무기는 쓸 수 없다.
  assert.equal(weaponStatus(s, me, 2), 'p');
  // 남은 이동력을 넘는 칸은 갈 수 없다.
  const far = { x: me.pos.x, y: Math.max(0, me.pos.y - 9) };
  assert.ok(!perform(s, { type: 'move', to: far }).ok);
}

// 2. 공격하면 쓴 무기가 기억되고, 반격이 실제로 나가면 맞은 쪽도 기억한다.
{
  const s = createGame(blazer, longbow, 1);
  const me = activeUnit(s);
  const foe = s.units[1];
  me.pos = { x: 4, y: 5 };
  foe.pos = { x: 4, y: 3 };
  assert.equal(me.lastWeapon, null);
  const r = perform(s, { type: 'attack', weapon: 0 }, { kind: 'counter', weapon: 0 });
  assert.ok(r.ok);
  assert.equal(me.lastWeapon, 0);
  assert.equal(foe.lastWeapon, 0, '반격에 쓴 무기');
  assert.ok(dist(me.pos, foe.pos) === 2);
}

// 3. 이동 연출은 거리와 상관없이 1초를 넘지 않고, 너무 짧지도 않다.
for (let steps = 1; steps <= 300; steps++) {
  const ms = moveDuration(steps);
  assert.ok(ms <= 1000 && ms >= 100, `${steps}칸: ${ms}ms`);
}

console.log('check: 모두 통과');

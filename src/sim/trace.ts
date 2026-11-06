/** 한 판을 턴마다 찍어 본다. 실행: npx tsx src/sim/trace.ts [기체0] [기체1] [시드] */
import { chooseDefense, decide, PROFILES } from '../ai/ai';
import { ROSTER } from '../core/data';
import { createGame, perform } from '../core/game';

const a = ROSTER.find((r) => r.unit.id === process.argv[2]) ?? ROSTER[0];
const b = ROSTER.find((r) => r.unit.id === process.argv[3]) ?? ROSTER[1];
const seed = Number(process.argv[4] ?? 1);
const prof = PROFILES.balanced;
const s = createGame(a, b, seed);
let guard = 0;
while (s.winner === null && guard++ < 400) {
  const side = s.turn.side;
  const acts = decide(s, prof);
  const [u0, u1] = s.units;
  console.log(
    `R${s.round} P${side} | ${u0.def.name}(${u0.pos.x},${u0.pos.y}) hp${u0.hp} en${u0.en} sp${u0.sp} | ${u1.def.name}(${u1.pos.x},${u1.pos.y}) hp${u1.hp} en${u1.en} sp${u1.sp} -> ` +
      acts.map((x) => (x.type === 'move' ? `move(${x.to.x},${x.to.y})` : x.type === 'attack' ? `atk:${s.units[side].def.weapons[x.weapon].name}` : x.type === 'spirit' ? `sp:${x.id}` : 'wait')).join(' '),
  );
  const before = s.log.length;
  for (const act of acts) {
    if (s.winner !== null || s.turn.side !== side) break;
    const def = act.type === 'attack' ? chooseDefense(s, act.weapon, prof) : undefined;
    if (def) console.log(`     defense: ${def.kind}${def.kind === 'counter' ? ':' + s.units[1 - side].def.weapons[def.weapon].name : ''}`);
    const r = perform(s, act, def);
    if (!r.ok) throw new Error(r.error);
  }
  for (const line of s.log.slice(before)) console.log('     ' + line);
}
console.log('winner', s.winner);

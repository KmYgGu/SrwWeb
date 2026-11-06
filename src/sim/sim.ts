/**
 * AI 끼리 자동 대전. 밸런스(어느 기체가 너무 센가)와 AI 가 멍청한 짓을 하지 않는지 숫자로 본다.
 * 실행: npm run sim -- [판수] [시드]
 */
import { chooseDefense, decide, PROFILES, type AiProfile } from '../ai/ai';
import { ROSTER } from '../core/data';
import { createGame, perform } from '../core/game';
import type { GameState, RosterEntry } from '../core/types';

export interface MatchResult {
  winner: 0 | 1 | 'draw';
  rounds: number;
  spiritsUsed: [number, number];
  decideMs: number;
  decisions: number;
  /** 필살기(기력 제한 무기)로 친 타격 수 */
  finishers: number;
  state: GameState;
}

export function playMatch(a: RosterEntry, b: RosterEntry, seed: number, profs: [AiProfile, AiProfile]): MatchResult {
  const s = createGame(a, b, seed);
  let decideMs = 0;
  let decisions = 0;
  let guard = 0;
  while (s.winner === null && guard++ < 2000) {
    const side = s.turn.side;
    const t0 = performance.now();
    const acts = decide(s, profs[side]);
    decideMs += performance.now() - t0;
    decisions++;
    for (const act of acts) {
      if (s.winner !== null || s.turn.side !== side) break;
      const defense =
        act.type === 'attack' ? chooseDefense(s, act.weapon, profs[1 - side]) : undefined;
      const r = perform(s, act, defense);
      if (!r.ok) throw new Error(`illegal AI action ${JSON.stringify(act)}: ${r.error}`);
    }
  }
  if (s.winner === null) throw new Error('match did not terminate');
  return {
    winner: s.winner,
    rounds: s.round,
    spiritsUsed: [s.units[0].used.length, s.units[1].used.length],
    decideMs,
    decisions,
    finishers: s.log.filter((l) =>
      s.units.some((u) => u.def.weapons.some((w) => w.minMorale !== undefined && l.includes(w.name))),
    ).length,
    state: s,
  };
}

function main() {
  const games = Number(process.argv[2] ?? 4);
  const seed0 = Number(process.argv[3] ?? 1);
  const prof = PROFILES.balanced;
  const n = ROSTER.length;
  const wins = ROSTER.map(() => ({ w: 0, l: 0, d: 0, g: 0 }));
  const matrix: string[][] = ROSTER.map(() => ROSTER.map(() => '-'));
  let totalRounds = 0;
  let totalGames = 0;
  let ms = 0;
  let decisions = 0;
  let spirits = 0;
  let finishers = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let wi = 0;
      let played = 0;
      for (let g = 0; g < games; g++) {
        // i 가 선공일 때와 후공일 때를 번갈아 돌려 선공 이점을 지운다.
        const iFirst = g % 2 === 0;
        const r = iFirst
          ? playMatch(ROSTER[i], ROSTER[j], seed0 + g, [prof, prof])
          : playMatch(ROSTER[j], ROSTER[i], seed0 + g, [prof, prof]);
        const iSide = iFirst ? 0 : 1;
        played++;
        wins[i].g++;
        if (r.winner === 'draw') wins[i].d++;
        else if (r.winner === iSide) {
          wins[i].w++;
          wi++;
        } else wins[i].l++;
        totalRounds += r.rounds;
        totalGames++;
        ms += r.decideMs;
        decisions += r.decisions;
        spirits += r.spiritsUsed[0] + r.spiritsUsed[1];
        finishers += r.finishers;
      }
      matrix[i][j] = `${wi}/${played}`;
    }
  }

  console.log('승/판 (행 기체가 열 기체를 상대로)');
  console.log(['            ', ...ROSTER.map((r) => r.unit.name.padEnd(8))].join(' '));
  ROSTER.forEach((r, i) => console.log([r.unit.name.padEnd(12), ...matrix[i].map((m) => m.padEnd(8))].join(' ')));
  console.log('\n기체별 승률');
  ROSTER.forEach((r, i) => {
    const w = wins[i];
    console.log(`${r.unit.name.padEnd(8)} ${((w.w / w.g) * 100).toFixed(0)}%  (승${w.w} 패${w.l} 무${w.d})`);
  });
  console.log(
    `\n평균 ${(totalRounds / totalGames).toFixed(1)}라운드, 정신 ${(spirits / totalGames).toFixed(1)}회/판, 필살기 ${(finishers / totalGames).toFixed(1)}타/판, ` +
      `결정 ${(ms / decisions).toFixed(1)}ms/회 (총 ${totalGames}판)`,
  );
}

if (/sim.ts$/.test(process.argv[1] ?? '')) main();

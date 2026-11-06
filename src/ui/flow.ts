/** 턴 진행: 사람의 입력 → 규칙 실행 → 연출 → AI 차례. 규칙 자체는 core 가 한다. */
import { ABILITIES } from '../core/abilities';
import { chooseDefense, decide, PROFILES } from '../ai/ai';
import type { DefenseChoice, StrikeEvent } from '../core/exchange';
import { activeUnit, foeUnit, perform } from '../core/game';
import { dist, pathTo, reachable } from '../core/map';
import type { Action, Side } from '../core/types';
import { popText } from './board';
import { askDefense } from './battleSheet';
import { AIM_HOLD_MS, AIM_RESULT_MS, aimTravel, FOE, ME, moveDuration, session, sleep } from './session';

const AI_PROFILE = PROFILES.balanced;

/** 공방의 한 번 한 번마다 조준선이 날아가고, 도착해 멈춘 뒤에 결과가 뜬다. */
async function showEvents(events: StrikeEvent[], attacker: Side) {
  const game = session.game;
  for (const ev of events) {
    const strikerSide = (ev.by === 0 ? attacker : 1 - attacker) as Side;
    const striker = game.units[strikerSide];
    const target = game.units[1 - strikerSide];
    const travel = aimTravel(dist(striker.pos, target.pos));
    session.aim = { from: striker.pos, to: target.pos, side: strikerSide, t0: performance.now(), travel, hold: AIM_HOLD_MS };
    await sleep(travel + AIM_HOLD_MS);
    session.aim = null;
    const text =
      ev.result === 'hit'
        ? String(ev.dmg)
        : ev.result === 'miss'
          ? 'MISS'
          : ev.result === 'flash'
            ? '섬광'
            : ABILITIES[ev.ability!].name;
    popText(target.pos.x, target.pos.y, text, ev.result === 'hit' ? '#ffd24a' : '#ffffff');
    await sleep(AIM_RESULT_MS);
  }
}

async function exec(act: Action, defense?: DefenseChoice) {
  const game = session.game;
  // 이동 경로는 규칙이 위치를 바꾸기 전에, 지금 칸에서 목적지까지의 실제 길로 구해 둔다.
  const unit = activeUnit(game);
  const path =
    act.type === 'move'
      ? pathTo(reachable(game.grid, unit.def.moveClass, unit.pos, 99, foeUnit(game).pos), act.to)
      : [];
  const side = unit.side;
  const r = perform(game, act, defense);
  if (!r.ok) {
    console.warn(r.error);
    return;
  }
  if (path.length > 1) {
    const dur = moveDuration(path.length - 1);
    session.anim = { side, path, t0: performance.now(), dur };
    await sleep(dur);
    session.anim = null;
  }
  if (r.events.length) await showEvents(r.events, r.attacker);
}

async function runAi() {
  const game = session.game;
  session.busy = true;
  let guard = 0;
  while (game.turn.side === FOE && game.winner === null && guard++ < 50) {
    await sleep(500);
    for (const act of decide(game, AI_PROFILE)) {
      if (game.turn.side !== FOE || game.winner !== null) break;
      const defense = act.type === 'attack' ? await askDefense(act.weapon) : undefined;
      await exec(act, defense);
      await sleep(250);
    }
  }
  session.busy = false;
}

const turnSide = () => session.game.turn.side;
const isOver = () => session.game.winner !== null;

let onFinish: () => void = () => {};

/** 전투가 끝났을 때 불릴 함수를 등록한다. */
export function setFinishHandler(fn: () => void) {
  onFinish = fn;
}

export async function playerAct(act: Action) {
  const game = session.game;
  if (session.busy || game.turn.side !== ME || game.winner !== null) return;
  session.busy = true;
  await exec(act, act.type === 'attack' ? chooseDefense(game, act.weapon, AI_PROFILE) : undefined);
  session.busy = false;
  // 위에서 좁혀진 타입은 await 을 거치며 달라졌으므로 함수로 다시 읽는다.
  if (!isOver() && turnSide() === FOE) await runAi();
  if (isOver()) onFinish();
}

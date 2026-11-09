/** 턴 진행: 사람의 입력 → 규칙 실행 → 연출 → AI 차례. 규칙 자체는 core 가 한다. */
import { ABILITIES } from '../core/abilities';
import { chooseDefense, decide } from '../ai/ai';
import type { DefenseChoice, StrikeEvent } from '../core/exchange';
import { activeUnit, foeUnit, perform } from '../core/game';
import { dist, pathTo, reachable } from '../core/map';
import type { Action, Side } from '../core/types';
import { popText } from './board';
import { askDefense } from './battleSheet';

/** 능력이 발동했을 때 맵에 뜨는 글자 색 */
const ABILITY_COLOR = '#7fe0ff';
import { SPIRIT_FX_MS } from './spiritFx';
import { AI_PROFILE, AIM_HOLD_MS, AIM_RESULT_MS, aimTravel, FOE, ME, moveDuration, session, sleep } from './session';

/** 공방의 한 번 한 번마다 조준선이 날아가고, 도착해 멈춘 뒤에 결과가 뜬다. */
async function showEvents(events: StrikeEvent[], attacker: Side) {
  const game = session.game;
  for (const ev of events) {
    const strikerSide = (ev.by === 0 ? attacker : 1 - attacker) as Side;
    const striker = game.units[strikerSide];
    const target = game.units[1 - strikerSide];
    const travel = aimTravel(dist(striker.pos, target.pos));
    // 먼저 치게 만든 능력(카운터 등)은 조준하기 전에 치는 쪽 위에 띄운다.
    if (ev.firstStrike) {
      popText(striker.pos.x, striker.pos.y, `${ABILITIES[ev.firstStrike].name}!`, ABILITY_COLOR);
      await sleep(AIM_RESULT_MS);
    }
    session.aim = { from: striker.pos, to: target.pos, side: strikerSide, t0: performance.now(), travel, hold: AIM_HOLD_MS };
    await sleep(travel + AIM_HOLD_MS);
    session.aim = null;
    const { x, y } = target.pos;
    if (ev.result === 'hit') {
      popText(x, y, String(ev.dmg), '#ffd24a');
      // 피해를 깎은 능력(실드 방어 등)은 숫자 위에 한 줄 더 띄운다.
      if (ev.reducedBy) popText(x, y, ABILITIES[ev.reducedBy].name, ABILITY_COLOR, 1);
    } else if (ev.result === 'miss') {
      popText(x, y, 'MISS');
    } else if (ev.result === 'flash') {
      popText(x, y, '섬광');
    } else {
      popText(x, y, ABILITIES[ev.ability!].name, ABILITY_COLOR);
    }
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
  if (act.type === 'spirit') {
    session.spiritFx = { side, id: act.id, t0: performance.now() };
    await sleep(SPIRIT_FX_MS);
    session.spiritFx = null;
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

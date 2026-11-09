/** 턴 진행: 사람의 입력 → 규칙 실행 → 연출 → AI 차례. 규칙 자체는 core 가 한다. */
import { ABILITIES } from '../core/abilities';
import { chooseDefense, decide } from '../ai/ai';
import type { DefenseChoice, StrikeEvent } from '../core/exchange';
import { activeUnit, foeUnit, perform } from '../core/game';
import { dist, pathTo, reachable } from '../core/map';
import type { Action, Pos, Side } from '../core/types';
import { popText } from './board';
import { askDefense } from './battleSheet';

/** 능력이 발동했을 때 맵에 뜨는 글자 색 */
const ABILITY_COLOR = '#7fe0ff';
import { SPIRIT_FX_MS } from './spiritFx';
import { AI_PROFILE, AIM_HOLD_MS, AIM_RESULT_MS, aimTravel, FOE, ME, moveDuration, session, sleep } from './session';

/** 조준선만 날린다(결과 글자 없음). 시트·판정 전에 쓴다. */
export async function showAim(from: Pos, to: Pos, side: Side) {
  const travel = aimTravel(dist(from, to));
  session.aim = { from, to, side, t0: performance.now(), travel, hold: AIM_HOLD_MS };
  await sleep(travel + AIM_HOLD_MS);
  session.aim = null;
}

/**
 * 공방 결과 글자. 본 공격 조준은 시트 전에 이미 보여 줬다.
 * 반격(ev.by === 1)만 짧은 조준을 한 번 더 보여 준다.
 */
async function showResults(events: StrikeEvent[], attacker: Side) {
  const game = session.game;
  for (const ev of events) {
    const strikerSide = (ev.by === 0 ? attacker : 1 - attacker) as Side;
    const striker = game.units[strikerSide];
    const target = game.units[1 - strikerSide];
    if (ev.firstStrike) {
      popText(striker.pos.x, striker.pos.y, `${ABILITIES[ev.firstStrike].name}!`, ABILITY_COLOR);
      await sleep(AIM_RESULT_MS);
    }
    if (ev.by === 1) {
      await showAim(striker.pos, target.pos, strikerSide);
    }
    const { x, y } = target.pos;
    if (ev.result === 'hit') {
      popText(x, y, String(ev.dmg), '#ffd24a');
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
  if (r.events.length) await showResults(r.events, r.attacker);
}

async function runAi() {
  const game = session.game;
  session.busy = true;
  let guard = 0;
  while (game.turn.side === FOE && game.winner === null && guard++ < 50) {
    await sleep(500);
    for (const act of decide(game, AI_PROFILE)) {
      if (game.turn.side !== FOE || game.winner !== null) break;
      if (act.type === 'attack') {
        const atk = activeUnit(game);
        const me = game.units[ME];
        // 적 공격: 조준 → 대응 시트 → 판정 → 결과
        await showAim(atk.pos, me.pos, FOE);
        const defense = await askDefense(act.weapon);
        await exec(act, defense);
      } else {
        await exec(act);
      }
      await sleep(250);
    }
  }
  session.busy = false;
  session.awaitingReaction = null;
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
  // 내 공격: 조준·시트는 onWeapon 쪽에서 이미 끝남 → 판정 → 결과
  await exec(act, act.type === 'attack' ? chooseDefense(game, act.weapon, AI_PROFILE) : undefined);
  session.busy = false;
  // 위에서 좁혀진 타입은 await 을 거치며 달라졌으므로 함수로 다시 읽는다.
  if (!isOver() && turnSide() === FOE) await runAi();
  if (isOver()) onFinish();
}

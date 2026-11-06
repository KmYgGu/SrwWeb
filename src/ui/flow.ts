/** 턴 진행: 사람의 입력 → 규칙 실행 → 연출 → AI 차례. 규칙 자체는 core 가 한다. */
import { ABILITIES } from '../core/abilities';
import { chooseDefense, decide, PROFILES } from '../ai/ai';
import type { DefenseChoice, StrikeEvent } from '../core/exchange';
import { perform } from '../core/game';
import type { Action } from '../core/types';
import { popText } from './board';
import { askDefense } from './sheets';
import { FOE, ME, session, sleep } from './session';

const AI_PROFILE = PROFILES.balanced;

function showEvents(events: StrikeEvent[], attacker: number) {
  const game = session.game;
  for (const ev of events) {
    const target = game.units[ev.by === 0 ? 1 - attacker : attacker];
    const text =
      ev.result === 'hit'
        ? String(ev.dmg)
        : ev.result === 'miss'
          ? 'MISS'
          : ev.result === 'flash'
            ? '섬광'
            : ABILITIES[ev.ability!].name;
    popText(target.pos.x, target.pos.y, text, ev.result === 'hit' ? '#ffd24a' : '#ffffff');
  }
}

async function exec(act: Action, defense?: DefenseChoice) {
  const r = perform(session.game, act, defense);
  if (!r.ok) {
    console.warn(r.error);
    return;
  }
  if (r.events.length) {
    showEvents(r.events, r.attacker);
    await sleep(900);
  }
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

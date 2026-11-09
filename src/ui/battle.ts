import { applySpiritFor, canMove, castableFor, createGame, moveRange } from '../core/game';
import { samePos, tileKey } from '../core/map';
import { SPIRITS } from '../core/spirits';
import type { RosterEntry, SpiritId } from '../core/types';
import { draw, initBoard, layout, tileAt } from './board';
import { playerAct, setFinishHandler, showAim } from './flow';
import { refreshHud, resetHud } from './hud';
import { chooseAttack } from './battleSheet';
import { pickSpirit } from './sheets';
import { showUnitInfo } from './unitInfo';
import { FOE, ME, session, sleep } from './session';
import { SPIRIT_FX_MS } from './spiritFx';

const app = () => document.getElementById('app')!;

function frame() {
  const canvas = document.getElementById('board');
  if (!canvas?.isConnected) return;
  draw();
  refreshHud();
  requestAnimationFrame(frame);
}

/** 연출/AI 중이어도 대응 대기(맵에서 정신)면 유닛 정보·정신은 허용 */
const inputLocked = () => session.busy && !session.awaitingReaction;

async function onBoardClick(e: MouseEvent) {
  const game = session.game;
  if (game.winner !== null) return;
  const { x, y } = tileAt(e);
  // 유닛 정보: 대응 대기 중에도 허용. 일반 busy(이동·AI 연출) 중에는 막음.
  const unit = game.units.find((u) => samePos(u.pos, { x, y }));
  if (unit) {
    if (session.busy && !session.awaitingReaction) return;
    await showUnitInfo(unit);
    return;
  }
  if (inputLocked() || session.awaitingReaction) return;
  if (game.turn.side !== ME || !canMove(game)) return;
  if (!moveRange(game).has(tileKey(x, y))) return;
  await playerAct({ type: 'move', to: { x, y } });
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const game = session.game;
  if (game.winner !== null) return;
  if (session.busy && !session.awaitingReaction) return;
  const { x, y } = tileAt(e);
  const unit = game.units.find((u) => samePos(u.pos, { x, y }));
  if (unit) void showUnitInfo(unit);
}

async function onWeapon() {
  const game = session.game;
  if (session.busy || session.awaitingReaction || game.turn.side !== ME || game.turn.acted) return;
  // 내 공격: 조준 → 공격 시트 → 확정 시 판정·결과
  session.busy = true;
  const me = game.units[ME];
  const foe = game.units[FOE];
  await showAim(me.pos, foe.pos, ME);
  session.busy = false;
  const weapon = await chooseAttack();
  if (weapon !== null) await playerAct({ type: 'attack', weapon });
}

async function castSpiritAsMe(id: SpiritId) {
  const game = session.game;
  if (!castableFor(game, ME, id)) return;
  applySpiritFor(game, ME, id);
  game.log.push(`${game.units[ME].def.name}: 「${SPIRITS[id].name}」`);
  session.spiritFx = { side: ME, id, t0: performance.now() };
  await sleep(SPIRIT_FX_MS);
  session.spiritFx = null;
}

async function onSpirit() {
  const game = session.game;
  if (game.winner !== null) return;
  // 대응 대기: 내 유닛 기준으로 정신 사용(액티브가 적이어도)
  if (session.awaitingReaction) {
    const id = await pickSpirit(ME);
    if (id !== null) await castSpiritAsMe(id);
    return;
  }
  if (session.busy || game.turn.side !== ME) return;
  const id = await pickSpirit(ME);
  if (id !== null) await playerAct({ type: 'spirit', id });
}

function onEndOrReact() {
  if (session.awaitingReaction) {
    session.awaitingReaction.reopen();
    return;
  }
  void playerAct({ type: 'wait' });
}

function showResult(onExit: () => void) {
  const game = session.game;
  const title = game.winner === 'draw' ? '무승부' : game.winner === ME ? '승리!' : '패배...';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="result"><h2>${title}</h2><p>${game.round} 라운드</p>
    <button class="primary" id="again" style="width:100%">처음으로</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#again')!.addEventListener('click', () => {
    el.remove();
    onExit();
  });
}

let resizeHandler: (() => void) | null = null;

/** 전투 화면을 만든다. onExit 은 결과 화면에서 '처음으로'를 눌렀을 때 불린다. */
export function startBattle(a: RosterEntry, b: RosterEntry, mapId: string, onExit: () => void) {
  session.game = createGame(a, b, (Math.random() * 2 ** 31) | 0, mapId);
  session.floaters.length = 0;
  session.busy = false;
  session.awaitingReaction = null;
  resetHud();
  app().innerHTML = `
    <div id="boardWrap">
      <div id="stage">
        <canvas id="board"></canvas>
        <div class="corner me" id="meCorner"></div>
        <div class="corner foe" id="foeCorner"></div>
        <div id="aiWait" hidden>상대의 턴입니다</div>
        <div id="mapLegend" aria-hidden="true">
          <span class="leg move"><i></i>이동</span>
          <span class="leg range-me"><i></i>내 사거리</span>
          <span class="leg range-foe"><i></i>상대 사거리</span>
        </div>
      </div>
    </div>
    <div class="details"><div class="side me" id="meInfo"></div><div class="side foe" id="foeInfo"></div></div>
    <div id="log"></div>
    <div class="cmds">
      <button id="bAtk">공격</button>
      <button id="bSp">정신</button>
      <button id="bEnd">턴 종료</button>
    </div>`;
  const canvas = document.getElementById('board') as HTMLCanvasElement;
  initBoard(canvas);
  canvas.addEventListener('click', onBoardClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  document.getElementById('bAtk')!.addEventListener('click', onWeapon);
  document.getElementById('bSp')!.addEventListener('click', onSpirit);
  document.getElementById('bEnd')!.addEventListener('click', onEndOrReact);
  resizeHandler = layout;
  window.addEventListener('resize', resizeHandler);
  setFinishHandler(() => showResult(onExit));
  requestAnimationFrame(frame);
}

/** 전투 화면을 떠날 때 전역에 걸어 둔 것을 정리한다. */
export function leaveBattle() {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
}

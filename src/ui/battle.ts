import { canMove, createGame, moveRange } from '../core/game';
import { samePos, tileKey } from '../core/map';
import type { RosterEntry } from '../core/types';
import { draw, initBoard, layout, tileAt } from './board';
import { playerAct, setFinishHandler } from './flow';
import { refreshHud, resetHud } from './hud';
import { chooseAttack } from './battleSheet';
import { pickSpirit } from './sheets';
import { showUnitInfo } from './unitInfo';
import { ME, session } from './session';

const app = () => document.getElementById('app')!;

function frame() {
  const canvas = document.getElementById('board');
  if (!canvas?.isConnected) return;
  draw();
  refreshHud();
  requestAnimationFrame(frame);
}

async function onBoardClick(e: MouseEvent) {
  const game = session.game;
  if (session.busy || game.winner !== null) return;
  const { x, y } = tileAt(e);
  // 유닛이 선 칸을 누르면 그 유닛의 정보를 보여 준다(내 유닛이든 상대든).
  const unit = game.units.find((u) => samePos(u.pos, { x, y }));
  if (unit) {
    await showUnitInfo(unit);
    return;
  }
  if (game.turn.side !== ME || !canMove(game)) return;
  if (!moveRange(game).has(tileKey(x, y))) return;
  await playerAct({ type: 'move', to: { x, y } });
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const game = session.game;
  if (session.busy || game.winner !== null) return;
  const { x, y } = tileAt(e);
  const unit = game.units.find((u) => samePos(u.pos, { x, y }));
  if (unit) void showUnitInfo(unit);
}

async function onWeapon() {
  const game = session.game;
  if (session.busy || game.turn.side !== ME || game.turn.acted) return;
  const weapon = await chooseAttack();
  if (weapon !== null) await playerAct({ type: 'attack', weapon });
}

async function onSpirit() {
  if (session.busy || session.game.turn.side !== ME) return;
  const id = await pickSpirit();
  if (id !== null) await playerAct({ type: 'spirit', id });
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
  resetHud();
  app().innerHTML = `
    <div id="boardWrap">
      <div id="stage">
        <canvas id="board"></canvas>
        <div class="corner me" id="meCorner"></div>
        <div class="corner foe" id="foeCorner"></div>
        <div id="aiWait" hidden>상대 행동 중…</div>
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
  document.getElementById('bEnd')!.addEventListener('click', () => void playerAct({ type: 'wait' }));
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

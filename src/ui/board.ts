import { GRID_H, GRID_W, TERRAINS } from '../core/data';
import { effMaxRange, fighterOf } from '../core/exchange';
import { canMove, moveRange } from '../core/game';
import { dist } from '../core/map';
import type { Pos, Unit } from '../core/types';
import { ME, session } from './session';

let canvas: HTMLCanvasElement;
let g: CanvasRenderingContext2D;
let tile = 40;

export function initBoard(el: HTMLCanvasElement) {
  canvas = el;
  g = el.getContext('2d')!;
  layout();
}

/** 칸 크기는 들어갈 수 있는 영역에 맞춘다. 기기마다 해상도가 달라서 고정값을 쓰지 않는다. */
export function layout() {
  const wrap = document.getElementById('boardWrap');
  const stage = document.getElementById('stage');
  if (!wrap || !stage) return;
  tile = Math.max(24, Math.floor(Math.min(wrap.clientWidth / GRID_W, wrap.clientHeight / GRID_H)));
  stage.style.width = `${tile * GRID_W}px`;
  stage.style.height = `${tile * GRID_H}px`;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${tile * GRID_W}px`;
  canvas.style.height = `${tile * GRID_H}px`;
  canvas.width = tile * GRID_W * dpr;
  canvas.height = tile * GRID_H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function tileAt(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.floor((e.clientX - rect.left) / tile), y: Math.floor((e.clientY - rect.top) / tile) };
}

export function popText(x: number, y: number, text: string, color = '#ffffff') {
  session.floaters.push({ x, y, text, t0: performance.now(), color });
}

export function draw() {
  const game = session.game;
  g.clearRect(0, 0, tile * GRID_W, tile * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const id = game.grid[y][x];
      g.fillStyle = TERRAINS[id].color;
      g.fillRect(x * tile, y * tile, tile, tile);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(x * tile, y * tile, tile, tile);
      if (id !== 'plain') {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `${tile * 0.28}px sans-serif`;
        g.textAlign = 'left';
        g.fillText(TERRAINS[id].name, x * tile + 3, y * tile + tile * 0.3);
      }
    }
  }
  if (!session.busy && game.winner === null && game.turn.side === ME && canMove(game)) {
    g.fillStyle = 'rgba(74,163,255,0.35)';
    for (const k of moveRange(game).keys()) g.fillRect((k % GRID_W) * tile, Math.floor(k / GRID_W) * tile, tile, tile);
  }
  for (const u of game.units) drawWeaponRange(u);
  for (const u of game.units) drawUnit(u);
  drawFloaters();
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 이동 연출 중인 유닛은 경로를 따라 미끄러지는 위치, 아니면 실제 위치 */
function visualPos(u: Unit): Pos {
  const a = session.anim;
  if (!a || a.side !== u.side) return u.pos;
  const p = (performance.now() - a.t0) / a.dur;
  if (p >= 1 || a.path.length < 2) return u.pos;
  const f = easeInOut(Math.max(0, p)) * (a.path.length - 1);
  const i = Math.min(a.path.length - 2, Math.floor(f));
  const k = f - i;
  return { x: a.path[i].x + (a.path[i + 1].x - a.path[i].x) * k, y: a.path[i].y + (a.path[i + 1].y - a.path[i].y) * k };
}

const RANGE_COLOR = { me: 'rgba(255, 214, 74, 0.22)', foe: 'rgba(255, 90, 80, 0.22)' };
const RANGE_LINE = { me: 'rgba(255, 214, 74, 0.9)', foe: 'rgba(255, 90, 80, 0.9)' };

/** 가장 최근에 쓴 무기의 사거리. 내 것과 상대 것 모두 보여 줘서 서로의 위협 범위를 읽게 한다. */
function drawWeaponRange(u: Unit) {
  if (u.lastWeapon === null) return;
  if (session.anim?.side === u.side) return;
  const w = u.def.weapons[u.lastWeapon];
  const max = effMaxRange(fighterOf(u), w);
  const key = u.side === ME ? 'me' : 'foe';
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const d = dist(u.pos, { x, y });
      if (d < w.minRange || d > max) continue;
      g.fillStyle = RANGE_COLOR[key];
      g.fillRect(x * tile, y * tile, tile, tile);
      g.strokeStyle = RANGE_LINE[key];
      g.strokeRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
    }
  }
}

function drawUnit(u: Unit) {
  const game = session.game;
  const p = visualPos(u);
  const cx = p.x * tile + tile / 2;
  const cy = p.y * tile + tile / 2;
  g.fillStyle = u.side === ME ? '#2f78d0' : '#d0453a';
  g.strokeStyle = game.turn.side === u.side && game.winner === null ? '#fff' : '#000';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, tile * 0.38, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${tile * 0.4}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(u.def.name[0], cx, cy);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillRect(p.x * tile + 3, p.y * tile + tile - 6, tile - 6, 4);
  g.fillStyle = '#5bd68a';
  g.fillRect(p.x * tile + 3, p.y * tile + tile - 6, (tile - 6) * (u.hp / u.def.hp), 4);
  g.lineWidth = 1;
}

function drawFloaters() {
  const now = performance.now();
  const list = session.floaters;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    const p = (now - f.t0) / 1000;
    if (p > 1) {
      list.splice(i, 1);
      continue;
    }
    g.globalAlpha = 1 - p * 0.6;
    g.fillStyle = f.color;
    g.font = `bold ${tile * 0.42}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(f.text, f.x * tile + tile / 2, f.y * tile + tile * 0.4 - p * tile * 0.5);
    g.globalAlpha = 1;
  }
}

import { GRID_H, GRID_W, TERRAINS } from '../core/data';
import { effMaxRange, fighterOf } from '../core/exchange';
import { canMove, hasMoved, moveRange } from '../core/game';
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
  drawStartMarker();
  for (const u of game.units) drawWeaponRange(u);
  for (const u of game.units) drawUnit(u);
  drawAim();
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

/**
 * 사거리는 칠하지 않고 바깥 경계선만 긋는다(이동 범위의 색 면과 구별되고 눈이 덜 피곤하다).
 * 내 것은 금색 실선, 상대 것은 붉은 점선.
 */
const RANGE_STYLE = {
  me: { fill: 'rgba(255, 214, 74, 0.07)', line: '#ffd24a', dash: [] as number[] },
  foe: { fill: 'rgba(255, 90, 80, 0.07)', line: '#ff6b5e', dash: [7, 5] },
};

/** 가장 최근에 쓴 무기의 사거리. 내 것과 상대 것 모두 보여 줘서 서로의 위협 범위를 읽게 한다. */
function drawWeaponRange(u: Unit) {
  if (u.lastWeapon === null) return;
  if (session.anim?.side === u.side) return;
  const w = u.def.weapons[u.lastWeapon];
  const max = effMaxRange(fighterOf(u), w);
  const style = RANGE_STYLE[u.side === ME ? 'me' : 'foe'];
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    const d = dist(u.pos, { x, y });
    return d >= w.minRange && d <= max;
  };

  g.fillStyle = style.fill;
  g.strokeStyle = style.line;
  g.lineWidth = 3;
  g.setLineDash(style.dash);
  g.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!inside(x, y)) continue;
      g.fillRect(x * tile, y * tile, tile, tile);
      // 이웃이 범위 밖인 변만 긋는다. 선은 칸 안쪽으로 살짝 들여서 그어 이웃 칸의 선과 겹치지 않게 한다.
      const inset = 1.5;
      if (!inside(x, y - 1)) {
        g.moveTo(x * tile, y * tile + inset);
        g.lineTo((x + 1) * tile, y * tile + inset);
      }
      if (!inside(x, y + 1)) {
        g.moveTo(x * tile, (y + 1) * tile - inset);
        g.lineTo((x + 1) * tile, (y + 1) * tile - inset);
      }
      if (!inside(x - 1, y)) {
        g.moveTo(x * tile + inset, y * tile);
        g.lineTo(x * tile + inset, (y + 1) * tile);
      }
      if (!inside(x + 1, y)) {
        g.moveTo((x + 1) * tile - inset, y * tile);
        g.lineTo((x + 1) * tile - inset, (y + 1) * tile);
      }
    }
  }
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 1;
}

/** 이동을 다시 고를 수 있다는 걸 보이려고, 이번 행동을 시작한 칸을 점선 원으로 남긴다. */
function drawStartMarker() {
  const game = session.game;
  if (session.busy || game.winner !== null || game.turn.side !== ME || game.turn.acted || !hasMoved(game)) return;
  const s = game.turn.startPos;
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 2;
  g.setLineDash([4, 4]);
  g.beginPath();
  g.arc((s.x + 0.5) * tile, (s.y + 0.5) * tile, tile * 0.36, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 1;
}

const AIM_COLOR = { me: '#7fe0ff', foe: '#ff6b5e' };
const TICKS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 조준선: 십자선이 공격하는 쪽에서 맞는 쪽으로 날아가 도착하면 조여들며 잠깐 멈춘다. */
function drawAim() {
  const a = session.aim;
  if (!a) return;
  const el = performance.now() - a.t0;
  const p = Math.min(1, el / a.travel);
  const e = 1 - (1 - p) ** 2;
  const fx = (a.from.x + 0.5) * tile;
  const fy = (a.from.y + 0.5) * tile;
  const hx = fx + ((a.to.x + 0.5) * tile - fx) * e;
  const hy = fy + ((a.to.y + 0.5) * tile - fy) * e;
  const locked = p >= 1;
  const pulse = locked ? 1 + 0.1 * Math.sin((el - a.travel) / 35) : 1;
  const r = tile * (locked ? 0.34 : 0.5) * pulse;
  const color = AIM_COLOR[a.side === ME ? 'me' : 'foe'];
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.moveTo(fx, fy);
  g.lineTo(hx, hy);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = locked ? 3 : 2;
  g.beginPath();
  g.arc(hx, hy, r, 0, Math.PI * 2);
  g.stroke();
  const tick = r * 0.45;
  g.beginPath();
  for (const [dx, dy] of TICKS) {
    g.moveTo(hx + dx * (r - tick * 0.2), hy + dy * (r - tick * 0.2));
    g.lineTo(hx + dx * (r + tick), hy + dy * (r + tick));
  }
  g.stroke();
  if (locked) {
    g.beginPath();
    g.arc(hx, hy, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
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

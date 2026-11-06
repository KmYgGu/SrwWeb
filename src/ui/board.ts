import { GRID_H, GRID_W, TERRAINS } from '../core/data';
import { canMove, moveRange } from '../core/game';
import type { Unit } from '../core/types';
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
  const wrap = canvas.parentElement;
  if (!wrap) return;
  tile = Math.max(24, Math.floor(Math.min(wrap.clientWidth / GRID_W, wrap.clientHeight / GRID_H)));
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
  for (const u of game.units) drawUnit(u);
  drawFloaters();
}

function drawUnit(u: Unit) {
  const game = session.game;
  const cx = u.pos.x * tile + tile / 2;
  const cy = u.pos.y * tile + tile / 2;
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
  g.fillRect(u.pos.x * tile + 3, u.pos.y * tile + tile - 6, tile - 6, 4);
  g.fillStyle = '#5bd68a';
  g.fillRect(u.pos.x * tile + 3, u.pos.y * tile + tile - 6, (tile - 6) * (u.hp / u.def.hp), 4);
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

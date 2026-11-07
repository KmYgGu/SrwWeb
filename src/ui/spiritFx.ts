/**
 * 정신 커맨드를 썼을 때 맵의 유닛 위에 뜨는 작은 이펙트와 이름.
 * 표가 SpiritId 전부를 요구하므로, 새 정신을 추가하면 이펙트를 고르기 전에는 컴파일되지 않는다.
 */
import { SPIRITS } from '../core/spirits';
import type { SpiritId } from '../core/types';

export const SPIRIT_FX_MS = 750;

/** r 은 유닛 반지름 기준 길이, p 는 진행도(0~1). 호출 전에 색·투명도가 정해져 있다. */
type Shape = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number) => void;

const line = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
};

const ring = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  g.beginPath();
  g.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
  g.stroke();
};

/** 필중: 네 방향에서 조준 눈금이 조여든다 */
const crosshair: Shape = (g, cx, cy, r, p) => {
  const d = r * (1.7 - 0.7 * Math.min(1, p * 2));
  ring(g, cx, cy, d);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    line(g, cx + dx * d * 0.7, cy + dy * d * 0.7, cx + dx * d * 1.3, cy + dy * d * 1.3);
  }
};

/** 섬광: 빛살이 사방으로 터진다 */
const burst: Shape = (g, cx, cy, r, p) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const inner = r * (0.8 + p);
    const outer = inner + r * (i % 2 ? 0.4 : 0.8);
    line(g, cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  }
};

/** 불굴: 육각형 방패가 번진다 */
const hexShield: Shape = (g, cx, cy, r, p) => {
  const d = r * (1.1 + 0.3 * p);
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  g.closePath();
  g.stroke();
};

/** 철벽: 네모난 벽이 겹으로 둘러선다 */
const wall: Shape = (g, cx, cy, r, p) => {
  for (const k of [1.15, 1.45]) {
    const d = r * k * Math.min(1, 0.6 + p * 1.5);
    g.strokeRect(cx - d, cy - d, d * 2, d * 2);
  }
};

/** 집중: 동심원이 안으로 모인다 */
const converge: Shape = (g, cx, cy, r, p) => {
  for (let i = 0; i < 3; i++) ring(g, cx, cy, r * (0.5 + ((i / 3 + 1 - p) % 1) * 1.3));
};

/** 기합: 꺾쇠가 위로 치솟는다 */
const chevrons: Shape = (g, cx, cy, r, p) => {
  for (let i = 0; i < 3; i++) {
    const y = cy + r * (1.1 - i * 0.6 - p * 1.2);
    g.beginPath();
    g.moveTo(cx - r * 0.7, y + r * 0.4);
    g.lineTo(cx, y - r * 0.2);
    g.lineTo(cx + r * 0.7, y + r * 0.4);
    g.stroke();
  }
};

/** 열혈: 불꽃이 피어오른다 */
const flames: Shape = (g, cx, cy, r, p) => {
  for (let i = 0; i < 5; i++) {
    const x = cx + r * (-1 + i * 0.5);
    const rise = (p + i * 0.37) % 1;
    const y = cy + r * (1 - rise * 2.2);
    const s = r * 0.32 * (1 - rise * 0.6);
    g.beginPath();
    g.moveTo(x, y - s * 1.6);
    g.quadraticCurveTo(x + s, y, x, y + s);
    g.quadraticCurveTo(x - s, y, x, y - s * 1.6);
    g.fill();
  }
};

/** 신속: 속도선이 가로로 스친다 */
const streaks: Shape = (g, cx, cy, r, p) => {
  [-0.8, -0.27, 0.27, 0.8].forEach((k, i) => {
    const x = cx + r * (1.8 - ((p * 1.5 + i * 0.3) % 1) * 3.6);
    line(g, x, cy + r * k, x + r * 1.1, cy + r * k);
  });
};

/** 간파: 눈이 떠진다 */
const eye: Shape = (g, cx, cy, r, p) => {
  const open = r * 0.9 * Math.min(1, p * 2.5);
  const w = r * 1.5;
  g.beginPath();
  g.moveTo(cx - w, cy);
  g.quadraticCurveTo(cx, cy - open * 1.5, cx + w, cy);
  g.quadraticCurveTo(cx, cy + open * 1.5, cx - w, cy);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, open * 0.4, 0, Math.PI * 2);
  g.fill();
};

/** 수복: 십자가 떠오른다 */
const plusses: Shape = (g, cx, cy, r, p) => {
  [-0.9, 0, 0.9].forEach((k, i) => {
    const rise = (p + i * 0.33) % 1;
    const x = cx + r * k;
    const y = cy + r * (0.9 - rise * 2);
    const s = r * 0.32;
    line(g, x - s, y, x + s, y);
    line(g, x, y - s, x, y + s);
  });
};

/** 보급: 아래에서 막대가 차오른다 */
const fillBars: Shape = (g, cx, cy, r, p) => {
  [-0.8, 0, 0.8].forEach((k, i) => {
    const h = r * 2 * Math.min(1, Math.max(0, p * 2 - i * 0.25));
    g.fillRect(cx + r * k - r * 0.2, cy + r - h, r * 0.4, h);
  });
};

/** 재동: 화살표가 한 바퀴 돈다 */
const spin: Shape = (g, cx, cy, r, p) => {
  const d = r * 1.3;
  const a = p * Math.PI * 2;
  g.beginPath();
  g.arc(cx, cy, d, a, a + Math.PI * 1.5);
  g.stroke();
  const end = a + Math.PI * 1.5;
  const hx = cx + Math.cos(end) * d;
  const hy = cy + Math.sin(end) * d;
  for (const turn of [Math.PI * 0.8, -Math.PI * 0.8]) {
    const back = end + Math.PI / 2 + turn;
    line(g, hx, hy, hx + Math.cos(back) * r * 0.5, hy + Math.sin(back) * r * 0.5);
  }
};

const FX: Record<SpiritId, { color: string; shape: Shape }> = {
  sure: { color: '#ffd24a', shape: crosshair },
  flash: { color: '#ffffff', shape: burst },
  fortitude: { color: '#ffa94d', shape: hexShield },
  ironwall: { color: '#9fb4d8', shape: wall },
  focus: { color: '#7fe0ff', shape: converge },
  spirit: { color: '#ff8a5c', shape: chevrons },
  passion: { color: '#ff5240', shape: flames },
  haste: { color: '#8df0a0', shape: streaks },
  insight: { color: '#c79bff', shape: eye },
  repair: { color: '#5bd68a', shape: plusses },
  supply: { color: '#4aa3ff', shape: fillBars },
  again: { color: '#fff07a', shape: spin },
};

/** 유닛 중심(cx, cy)에 이펙트를, 그 위에 정신 이름을 그린다. 이름은 맵 밖으로 나가지 않는다. */
export function drawSpiritFx(
  g: CanvasRenderingContext2D,
  id: SpiritId,
  p: number,
  cx: number,
  cy: number,
  tile: number,
  boardWidth: number,
) {
  const fx = FX[id];
  g.save();
  g.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2;
  g.strokeStyle = fx.color;
  g.fillStyle = fx.color;
  g.lineWidth = Math.max(2, tile * 0.05);
  g.lineCap = 'round';
  fx.shape(g, cx, cy, tile * 0.38, p);

  const name = SPIRITS[id].name;
  g.font = `bold ${Math.max(12, tile * 0.34)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(name).width + 12;
  const h = Math.max(18, tile * 0.46);
  const x = Math.min(boardWidth - w / 2, Math.max(w / 2, cx));
  // 맨 윗줄에서는 위에 자리가 없으므로 아래에 띄워 유닛을 가리지 않게 한다.
  const above = cy - tile * 0.72;
  const y = above >= h / 2 ? above : cy + tile * 0.72;
  g.fillStyle = 'rgba(5, 8, 16, 0.85)';
  g.fillRect(x - w / 2, y - h / 2, w, h);
  g.strokeStyle = fx.color;
  g.lineWidth = 1;
  g.strokeRect(x - w / 2, y - h / 2, w, h);
  g.fillStyle = fx.color;
  g.fillText(name, x, y);
  g.restore();
}

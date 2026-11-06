import { GRID_H, GRID_W, TERRAINS } from './data';
import type { MoveClass, Pos, TerrainDef, TerrainId } from './types';

export const tileKey = (x: number, y: number) => y * GRID_W + x;
export const keyPos = (k: number): Pos => ({ x: k % GRID_W, y: Math.floor(k / GRID_W) });
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export function terrainAt(grid: TerrainId[][], p: Pos): TerrainDef {
  return TERRAINS[grid[p.y][p.x]];
}

export interface ReachNode {
  cost: number;
  prev: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 이동 가능한 칸과 비용. 상대 유닛이 선 칸은 지나갈 수도 설 수도 없다. */
export function reachable(
  grid: TerrainId[][],
  moveClass: MoveClass,
  from: Pos,
  budget: number,
  blocked: Pos | null,
): Map<number, ReachNode> {
  const start = tileKey(from.x, from.y);
  const best = new Map<number, ReachNode>([[start, { cost: 0, prev: -1 }]]);
  const open: number[] = [start];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (best.get(open[i])!.cost < best.get(open[bi])!.cost) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const curCost = best.get(cur)!.cost;
    const cx = cur % GRID_W;
    const cy = Math.floor(cur / GRID_W);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      if (blocked && blocked.x === nx && blocked.y === ny) continue;
      const t = TERRAINS[grid[ny][nx]];
      if (moveClass === 'ground' && !t.groundPass) continue;
      const step = moveClass === 'air' ? 1 : t.cost;
      const nc = curCost + step;
      if (nc > budget) continue;
      const nk = tileKey(nx, ny);
      const old = best.get(nk);
      if (!old || nc < old.cost) {
        best.set(nk, { cost: nc, prev: cur });
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return best;
}

export function pathTo(reach: Map<number, ReachNode>, to: Pos): Pos[] {
  const path: Pos[] = [];
  let k = tileKey(to.x, to.y);
  while (k !== -1 && reach.has(k)) {
    path.push(keyPos(k));
    k = reach.get(k)!.prev;
  }
  return path.reverse();
}

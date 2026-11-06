/**
 * 맵 데이터. 위쪽 7줄(마지막 줄이 가운데 줄)만 적으면 나머지는 180도 회전해서 만든다.
 * 어느 쪽에서 시작해도 불리하지 않다.
 * . 평지  f 숲  m 산  c 도시  ~ 바다
 */
import { GRID_H, GRID_W } from './data';
import type { Pos, TerrainId } from './types';

export interface MapDef {
  id: string;
  name: string;
  top: string[];
  /** [0번 쪽(아래), 1번 쪽(위)] 시작 칸 */
  spawns: [Pos, Pos];
}

export const MAPS: MapDef[] = [
  {
    id: 'river',
    name: '강변',
    top: ['..f...m..', '.c..f....', 'f..mm..c.', '..~~..f..', '.m.~.f..c', '.......f.', 'f..~~~..f'],
    spawns: [
      { x: 4, y: 11 },
      { x: 4, y: 1 },
    ],
  },
  {
    id: 'highland',
    name: '고지',
    top: ['.........', '.f..c..f.', '..c...c..', '.....f...', '.m.f.....', '.....c...', '..m.f.m..'],
    spawns: [
      { x: 4, y: 11 },
      { x: 4, y: 1 },
    ],
  },
];

const CHAR_TERRAIN: Record<string, TerrainId> = {
  '.': 'plain',
  f: 'forest',
  m: 'mountain',
  c: 'city',
  '~': 'sea',
};

export const mapById = (id: string): MapDef => MAPS.find((m) => m.id === id) ?? MAPS[0];

export function buildGrid(map: MapDef): TerrainId[][] {
  const half = (GRID_H + 1) / 2;
  if (map.top.length !== half) throw new Error(`map ${map.id}: top 은 ${half}줄이어야 한다`);
  const rows = [...map.top];
  for (let i = half - 2; i >= 0; i--) rows.push([...map.top[i]].reverse().join(''));
  const grid = rows.map((r, y) => {
    if (r.length !== GRID_W) throw new Error(`map ${map.id}: ${y}번째 줄 길이가 ${GRID_W}이 아니다`);
    return [...r].map((ch) => {
      const t = CHAR_TERRAIN[ch];
      if (!t) throw new Error(`map ${map.id}: 알 수 없는 문자 '${ch}'`);
      return t;
    });
  });
  for (const p of map.spawns) {
    if (grid[p.y][p.x] === 'sea') throw new Error(`map ${map.id}: 시작 칸이 바다다`);
  }
  return grid;
}

/** 유닛 능력치 육각형 그래프. 축은 표에 한 번만 적고, 크기는 로스터 안에서의 상대값으로 정한다. */
import { ROSTER } from '../core/data';
import type { RosterEntry } from '../core/types';

const AXES: { label: string; value: (r: RosterEntry) => number }[] = [
  { label: '체력', value: (r) => r.unit.hp },
  { label: 'EN', value: (r) => r.unit.en },
  { label: '격투', value: (r) => r.pilot.melee },
  { label: '사격', value: (r) => r.pilot.shoot },
  { label: '방어', value: (r) => r.unit.armor * (0.5 + r.pilot.defense / 200) },
  { label: '기동', value: (r) => r.unit.mobility + r.pilot.react + r.unit.move * 10 },
];

/** 가장 낮은 유닛도 그래프가 찌그러져 사라지지 않게 남기는 길이 */
const FLOOR = 0.25;
const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 62;

function ratio(axis: (typeof AXES)[number], r: RosterEntry): number {
  const values = ROSTER.map(axis.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? 1 : FLOOR + (1 - FLOOR) * ((axis.value(r) - min) / (max - min));
}

function point(i: number, length: number): [number, number] {
  const angle = -Math.PI / 2 + (i * Math.PI * 2) / AXES.length;
  return [CENTER + Math.cos(angle) * length, CENTER + Math.sin(angle) * length];
}

const polygon = (lengths: number[]) =>
  lengths.map((l, i) => point(i, l).map((n) => n.toFixed(1)).join(',')).join(' ');

export function statRadar(r: RosterEntry): string {
  const guides = [1 / 3, 2 / 3, 1]
    .map((k) => `<polygon class="radar-guide" points="${polygon(AXES.map(() => RADIUS * k))}"/>`)
    .join('');
  const spokes = AXES.map((_, i) => {
    const [x, y] = point(i, RADIUS);
    return `<line class="radar-guide" x1="${CENTER}" y1="${CENTER}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');
  const labels = AXES.map((a, i) => {
    const [x, y] = point(i, RADIUS + 18);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${a.label}</text>`;
  }).join('');
  const shape = polygon(AXES.map((a) => RADIUS * ratio(a, r)));
  return `<svg class="radar" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${r.unit.name} 능력치">
    ${guides}${spokes}<polygon class="radar-shape" points="${shape}"/>${labels}
  </svg>`;
}

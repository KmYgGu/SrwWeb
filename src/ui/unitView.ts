import type { Unit } from '../core/types';

/**
 * 유닛 전신 그림은 public/units/<기체 id>.png 에 넣으면 나타난다.
 * 파일이 없으면 이름 첫 글자만 있는 빈 칸이 남는다.
 */
export const figureOf = (unit: { id: string; name: string }) =>
  `<div class="figure"><div class="ph">${unit.name[0]}</div><img src="${import.meta.env.BASE_URL}units/${unit.id}.png" alt=""></div>`;

export const figure = (u: Unit) => figureOf(u.def);

export const gauge = (kind: 'hp' | 'en', label: string, cur: number, max: number) =>
  `<div class="gauge"><b>${label}</b><div class="bar ${kind}"><i style="width:${(cur / max) * 100}%"></i><span>${cur}</span></div></div>`;

/** 발동 중인 정신. 없으면 없다고 적는다. */
export const spiritChips = (labels: string[]) =>
  labels.length > 0
    ? labels.map((x) => `<span class="chip">${x}</span>`).join('')
    : '<span class="chip dim">발동 중인 정신 없음</span>';

import { ROSTER } from '../core/data';
import { MAPS } from '../core/maps';
import type { RosterEntry } from '../core/types';

let pickMe = ROSTER[0];
/** null 이면 나와 다른 기체를 무작위로 */
let pickFoe: RosterEntry | null = null;
let pickMap = MAPS[0].id;

type Start = (me: RosterEntry, foe: RosterEntry, mapId: string) => void;

const card = (label: string, sub: string, sel: boolean, attr: string, value: string) =>
  `<button class="card ${sel ? 'sel' : ''}" data-${attr}="${value}"><b>${label}</b><small>${sub}</small></button>`;

export function showTitle(onStart: Start) {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="title">
      <h1>1:1 전투 프로토타입</h1>
      <p>직접 조작 vs AI. 이동 → 공격, 정신 커맨드는 기체마다 6개를 1회씩.</p>
      <h2>내 기체</h2>
      <div class="cards">${ROSTER.map((r) => card(r.name, r.blurb, r.id === pickMe.id, 'me', r.id)).join('')}</div>
      <h2>상대 기체</h2>
      <div class="cards">
        ${card('랜덤', '나와 다른 기체가 나온다', pickFoe === null, 'foe', 'random')}
        ${ROSTER.map((r) => card(r.name, r.blurb, pickFoe?.id === r.id, 'foe', r.id)).join('')}
      </div>
      <h2>맵</h2>
      <div class="cards">${MAPS.map((m) => card(m.name, '', m.id === pickMap, 'map', m.id)).join('')}</div>
      <button class="primary" id="start" style="width:100%">전투 시작</button>
    </div>`;
  const pick = (attr: string, fn: (v: string) => void) =>
    app.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((b) =>
      b.addEventListener('click', () => {
        fn(b.dataset[attr]!);
        showTitle(onStart);
      }),
    );
  pick('me', (v) => (pickMe = ROSTER.find((r) => r.id === v)!));
  pick('foe', (v) => (pickFoe = v === 'random' ? null : ROSTER.find((r) => r.id === v)!));
  pick('map', (v) => (pickMap = v));
  document.getElementById('start')!.addEventListener('click', () => {
    const others = ROSTER.filter((r) => r.id !== pickMe.id);
    onStart(pickMe, pickFoe ?? others[Math.floor(Math.random() * others.length)], pickMap);
  });
}

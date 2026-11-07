import { GRID_W, ROSTER, TERRAINS } from '../core/data';
import { buildGrid, MAPS } from '../core/maps';
import { tileKey } from '../core/map';
import type { RosterEntry } from '../core/types';

const RANDOM = 'random';

let pickMe: RosterEntry | null = null;
let pickFoe: RosterEntry | typeof RANDOM | null = null;
let mapIndex = 0;
let panelOpen = false;

type Start = (me: RosterEntry, foe: RosterEntry, mapId: string) => void;

/**
 * 유닛 프로필 그림은 public/profiles/<기체 id>.png 에 넣으면 나타난다.
 * 맵의 상반신(portraits), 연출 창의 전신(units)과는 다른 그림이다.
 */
const profileImage = (r: RosterEntry) => `${import.meta.env.BASE_URL}profiles/${r.unit.id}.png`;

const tile = (attr: string, value: string, name: string, sel: boolean, picture: string) =>
  `<button class="tile ${sel ? 'sel' : ''}" data-${attr}="${value}">
    <span class="tile-img"><span class="square">${picture}</span></span>
    <span class="tile-name">${name}</span>
  </button>`;

const unitTile = (attr: string, r: RosterEntry, sel: boolean) =>
  tile(attr, r.id, r.unit.name, sel, `<span class="ph">${r.unit.name[0]}</span><img src="${profileImage(r)}" alt="" onerror="this.remove()">`);

/** 줄 수를 유닛 수에서 정해, 유닛이 늘어도 칸이 작아질 뿐 화면을 넘지 않게 한다. */
function section(title: string, cls: string, tiles: string[]): string {
  const rows = Math.ceil(tiles.length / 3);
  return `<section class="pick ${cls}">
    <h2>${title}</h2>
    <div class="tiles" style="grid-template-rows:repeat(${rows},minmax(0,1fr))">${tiles.join('')}</div>
  </section>`;
}

function mapPreview(): string {
  const map = MAPS[mapIndex];
  const grid = buildGrid(map);
  const spawnClass = new Map([
    [tileKey(map.spawns[0].x, map.spawns[0].y), 'me'],
    [tileKey(map.spawns[1].x, map.spawns[1].y), 'foe'],
  ]);
  const cells = grid
    .flatMap((row, y) =>
      row.map((t, x) => {
        const spawn = spawnClass.get(tileKey(x, y));
        return `<i style="background:${TERRAINS[t].color}">${spawn ? `<b class="${spawn}"></b>` : ''}</i>`;
      }),
    )
    .join('');
  return `<div class="mapgrid" style="grid-template-columns:repeat(${GRID_W},1fr)">${cells}</div>`;
}

function stagePanel(): string {
  const single = MAPS.length < 2 ? 'disabled' : '';
  return `<div class="stage-back" id="stageBack">
    <div class="stage-panel">
      <h2>스테이지 선택</h2>
      <div class="stage-row">
        <button class="arrow" id="prevMap" aria-label="이전 스테이지" ${single}>&lt;</button>
        <div class="mapview" id="mapView">${mapPreview()}</div>
        <button class="arrow" id="nextMap" aria-label="다음 스테이지" ${single}>&gt;</button>
      </div>
      <div class="stage-name" id="mapName">${MAPS[mapIndex].name}</div>
      <div class="row2">
        <button id="closeStage">뒤로</button>
        <button class="primary" id="start">전투 시작</button>
      </div>
    </div>
  </div>`;
}

function wirePanel(app: HTMLElement, onStart: Start) {
  const turn = (step: number) => {
    mapIndex = (mapIndex + step + MAPS.length) % MAPS.length;
    app.querySelector('#mapView')!.innerHTML = mapPreview();
    app.querySelector('#mapName')!.textContent = MAPS[mapIndex].name;
  };
  const close = () => {
    panelOpen = false;
    render(onStart);
  };
  app.querySelector('#prevMap')!.addEventListener('click', () => turn(-1));
  app.querySelector('#nextMap')!.addEventListener('click', () => turn(1));
  app.querySelector('#closeStage')!.addEventListener('click', close);
  app.querySelector('#stageBack')!.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'stageBack') close();
  });
  app.querySelector('#start')!.addEventListener('click', () => {
    const others = ROSTER.filter((r) => r.id !== pickMe!.id);
    const foe = pickFoe === RANDOM ? others[Math.floor(Math.random() * others.length)] : pickFoe!;
    onStart(pickMe!, foe, MAPS[mapIndex].id);
  });
}

function render(onStart: Start) {
  const app = document.getElementById('app')!;
  const ready = pickMe !== null && pickFoe !== null;
  app.innerHTML = `
    <div class="select">
      ${section('내 유닛', 'me', ROSTER.map((r) => unitTile('me', r, r.id === pickMe?.id)))}
      ${section('상대 유닛', 'foe', [
        ...ROSTER.map((r) => unitTile('foe', r, pickFoe !== RANDOM && r.id === pickFoe?.id)),
        tile('foe', RANDOM, '랜덤', pickFoe === RANDOM, '<span class="ph">?</span>'),
      ])}
      <button class="primary" id="openStage" ${ready ? '' : 'disabled'}>스테이지 선택</button>
    </div>
    ${ready && panelOpen ? stagePanel() : ''}`;

  const pick = (attr: string, choose: (v: string) => void) =>
    app.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((b) =>
      b.addEventListener('click', () => {
        choose(b.dataset[attr]!);
        panelOpen = true; // 둘 다 고른 순간 패널이 열린다(아직 하나면 render 가 띄우지 않는다)
        render(onStart);
      }),
    );
  pick('me', (v) => (pickMe = ROSTER.find((r) => r.id === v)!));
  pick('foe', (v) => (pickFoe = v === RANDOM ? RANDOM : ROSTER.find((r) => r.id === v)!));
  app.querySelector('#openStage')!.addEventListener('click', () => {
    panelOpen = true;
    render(onStart);
  });
  if (ready && panelOpen) wirePanel(app, onStart);
}

export function showTitle(onStart: Start) {
  render(onStart);
}

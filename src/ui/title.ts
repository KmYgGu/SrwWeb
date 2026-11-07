import { GRID_W, ROSTER, TERRAINS } from '../core/data';
import { buildGrid, MAPS } from '../core/maps';
import { tileKey } from '../core/map';
import type { RosterEntry } from '../core/types';

const RANDOM = 'random';
const COLUMNS = 3;

type Slot = 'me' | 'foe';

let pickMe: RosterEntry | null = null;
let pickFoe: RosterEntry | typeof RANDOM | null = null;
/** 유닛을 누르면 들어갈 자리 */
let activeSlot: Slot = 'me';
let mapIndex = 0;
let panelOpen = false;

type Start = (me: RosterEntry, foe: RosterEntry, mapId: string) => void;

/**
 * 유닛 프로필 그림은 public/profiles/<기체 id>.png 에 넣으면 나타난다.
 * 맵의 상반신(portraits), 연출 창의 전신(units)과는 다른 그림이다.
 */
const profileImage = (r: RosterEntry) => `${import.meta.env.BASE_URL}profiles/${r.unit.id}.png`;

const picture = (r: RosterEntry) =>
  `<span class="ph">${r.unit.name[0]}</span><img src="${profileImage(r)}" alt="" onerror="this.remove()">`;

const RANDOM_PICTURE = '<span class="ph">?</span>';

function slotButton(slot: Slot, label: string, pick: RosterEntry | typeof RANDOM | null): string {
  const name = pick === null ? '선택 안 함' : pick === RANDOM ? '랜덤' : pick.unit.name;
  const pic = pick === null ? '' : pick === RANDOM ? RANDOM_PICTURE : picture(pick);
  return `<button class="slot ${slot} ${activeSlot === slot ? 'active' : ''}" data-slot="${slot}">
    <span class="square">${pic}</span>
    <span class="slot-text"><small>${label}</small><b>${name}</b></span>
  </button>`;
}

function tile(value: string, name: string, pic: string, isMe: boolean, isFoe: boolean, disabled = false): string {
  const marks = `${isMe ? '<em class="me">나</em>' : ''}${isFoe ? '<em class="foe">상대</em>' : ''}`;
  return `<button class="tile ${isMe ? 'is-me' : isFoe ? 'is-foe' : ''}" data-unit="${value}" ${disabled ? 'disabled' : ''}>
    <span class="tile-img"><span class="square">${pic}${marks}</span></span>
    <span class="tile-name">${name}</span>
  </button>`;
}

/** 칸은 정사각형 그림 + 이름 높이까지만 커지고, 화면이 낮으면 그만큼 줄어든다. 유닛이 늘어도 스크롤이 생기지 않는다. */
function unitGrid(): string {
  const tiles = [
    ...ROSTER.map((r) => tile(r.id, r.unit.name, picture(r), r.id === pickMe?.id, pickFoe !== RANDOM && r.id === pickFoe?.id)),
    // 랜덤은 상대 자리에만 넣을 수 있다.
    tile(RANDOM, '랜덤', RANDOM_PICTURE, false, pickFoe === RANDOM, activeSlot === 'me'),
  ];
  const rows = Math.ceil(tiles.length / COLUMNS);
  const rowMax = `calc((100cqw - ${(COLUMNS - 1) * 6}px) / ${COLUMNS} + 26px)`;
  return `<div class="tiles-wrap"><div class="tiles" style="grid-template-rows:repeat(${rows},minmax(0,${rowMax}))">${tiles.join('')}</div></div>`;
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

function choose(value: string) {
  if (activeSlot === 'me') {
    pickMe = ROSTER.find((r) => r.id === value)!;
    activeSlot = 'foe'; // 내 유닛을 고르면 바로 상대를 고를 차례다
  } else {
    pickFoe = value === RANDOM ? RANDOM : ROSTER.find((r) => r.id === value)!;
  }
}

function render(onStart: Start) {
  const app = document.getElementById('app')!;
  const ready = pickMe !== null && pickFoe !== null;
  app.innerHTML = `
    <div class="select">
      <div class="slots">
        ${slotButton('me', '내 유닛', pickMe)}
        ${slotButton('foe', '상대 유닛', pickFoe)}
      </div>
      ${unitGrid()}
      <button class="primary" id="openStage" ${ready ? '' : 'disabled'}>스테이지 선택</button>
    </div>
    ${panelOpen ? stagePanel() : ''}`;

  app.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) =>
    b.addEventListener('click', () => {
      activeSlot = b.dataset.slot as Slot;
      render(onStart);
    }),
  );
  app.querySelectorAll<HTMLElement>('[data-unit]').forEach((b) =>
    b.addEventListener('click', () => {
      choose(b.dataset.unit!);
      render(onStart);
    }),
  );
  app.querySelector('#openStage')!.addEventListener('click', () => {
    panelOpen = true;
    render(onStart);
  });
  if (panelOpen) wirePanel(app, onStart);
}

export function showTitle(onStart: Start) {
  panelOpen = false; // 패널은 스테이지 선택 버튼을 눌렀을 때만 열린다
  render(onStart);
}

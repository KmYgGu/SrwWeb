import { GRID_W, ROSTER, TERRAINS } from '../core/data';
import { buildGrid, MAPS } from '../core/maps';
import { tileKey } from '../core/map';
import type { RosterEntry } from '../core/types';
import { animateRadar, radarFrame } from './statRadar';
import { figureOf } from './unitView';

const RANDOM = 'random';
const COLUMNS = 4;

type Slot = 'me' | 'foe';
type Pick = RosterEntry | typeof RANDOM | null;

let pickMe: Pick = null;
let pickFoe: Pick = null;
/** 유닛을 누르면 들어갈 자리 */
let activeSlot: Slot = 'me';
let mapIndex = 0;

type Start = (me: RosterEntry, foe: RosterEntry, mapId: string) => void;

/**
 * 유닛 프로필 그림은 public/profiles/<기체 id>.png 에 넣으면 나타난다.
 * 맵의 상반신(portraits), 연출 창의 전신(units)과는 다른 그림이다.
 */
const profileImage = (r: RosterEntry) => `${import.meta.env.BASE_URL}profiles/${r.unit.id}.png`;

const picture = (r: RosterEntry) =>
  `<span class="ph">${r.unit.name[0]}</span><img src="${profileImage(r)}" alt="" onerror="this.remove()">`;

const RANDOM_PICTURE = '<span class="ph">?</span>';

const slotButton = (slot: Slot, label: string) =>
  `<button class="slot ${slot}" data-slot="${slot}">
    <span class="square"></span>
    <span class="slot-text"><small>${label}</small><b></b></span>
  </button>`;

const tile = (value: string, name: string, pic: string) =>
  `<button class="tile" data-unit="${value}">
    <span class="tile-img"><span class="square">${pic}<em class="me" hidden>나</em><em class="foe" hidden>상대</em></span></span>
    <span class="tile-name">${name}</span>
  </button>`;

/** 칸은 정사각형 그림 + 이름 높이까지만 커지고, 화면이 낮으면 그만큼 줄어든다. 유닛이 늘어도 스크롤이 생기지 않는다. */
function unitGrid(): string {
  const tiles = [...ROSTER.map((r) => tile(r.id, r.unit.name, picture(r))), tile(RANDOM, '랜덤', RANDOM_PICTURE)];
  const rows = Math.ceil(tiles.length / COLUMNS);
  const rowMax = `calc((100cqw - ${(COLUMNS - 1) * 6}px) / ${COLUMNS} + 26px)`;
  // 격자가 필요한 만큼만 차지하고 남는 높이는 위의 유닛 정보 칸이 쓴다(.select 의 너비 기준).
  const height = `calc(${rows} * ((100cqw - ${(COLUMNS - 1) * 6}px) / ${COLUMNS} + 26px) + ${(rows - 1) * 6}px)`;
  return `<div class="tiles-wrap" style="flex-basis:${height}"><div class="tiles" style="grid-template-columns:repeat(${COLUMNS},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,${rowMax}))">${tiles.join('')}</div></div>`;
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

function randomExcept(unit: RosterEntry | null): RosterEntry {
  const others = ROSTER.filter((r) => r.id !== unit?.id);
  return others[Math.floor(Math.random() * others.length)];
}

function openPanel(app: HTMLElement, onStart: Start) {
  app.insertAdjacentHTML('beforeend', stagePanel());
  const back = app.querySelector<HTMLElement>('#stageBack')!;
  const turn = (step: number) => {
    mapIndex = (mapIndex + step + MAPS.length) % MAPS.length;
    back.querySelector('#mapView')!.innerHTML = mapPreview();
    back.querySelector('#mapName')!.textContent = MAPS[mapIndex].name;
  };
  // 뒤로 가면 상대 유닛을 고르기 전으로 돌아간다.
  const close = () => {
    back.remove();
    pickFoe = null;
    activeSlot = 'foe';
    paint(app);
  };
  back.querySelector('#prevMap')!.addEventListener('click', () => turn(-1));
  back.querySelector('#nextMap')!.addEventListener('click', () => turn(1));
  back.querySelector('#closeStage')!.addEventListener('click', close);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('#start')!.addEventListener('click', () => {
    // 랜덤은 전투를 시작할 때 정하고, 양쪽이 같은 유닛이 되지 않게 한다.
    const fixedMe = pickMe === RANDOM ? null : pickMe;
    const fixedFoe = pickFoe === RANDOM ? null : pickFoe;
    const me = fixedMe ?? randomExcept(fixedFoe);
    onStart(me, fixedFoe ?? randomExcept(me), MAPS[mapIndex].id);
  });
}

function paintSlot(app: HTMLElement, slot: Slot, pick: Pick) {
  const el = app.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
  el.classList.toggle('active', activeSlot === slot);
  // 고른 유닛이 그대로면 그림을 건드리지 않는다.
  const id = pick === null ? '' : pick === RANDOM ? RANDOM : pick.id;
  if (el.dataset.pick === id) return;
  el.dataset.pick = id;
  el.querySelector('.square')!.innerHTML = pick === null ? '' : pick === RANDOM ? RANDOM_PICTURE : picture(pick);
  el.querySelector('b')!.textContent = pick === null ? '선택 안 함' : pick === RANDOM ? '랜덤' : pick.unit.name;
}

/** 화면은 한 번만 만들고, 선택이 바뀌면 달라진 표시만 고친다. 다시 만들면 그림을 새로 불러오느라 깜빡인다. */
function paint(app: HTMLElement) {
  paintSlot(app, 'me', pickMe);
  paintSlot(app, 'foe', pickFoe);
  const idOf = (pick: Pick) => (pick === null ? null : pick === RANDOM ? RANDOM : pick.id);
  const meId = idOf(pickMe);
  const foeId = idOf(pickFoe);
  app.querySelectorAll<HTMLElement>('[data-unit]').forEach((b) => {
    const id = b.dataset.unit!;
    const isMe = id === meId;
    const isFoe = id === foeId;
    b.classList.toggle('is-me', isMe);
    b.classList.toggle('is-foe', isFoe && !isMe);
    b.querySelector<HTMLElement>('em.me')!.hidden = !isMe;
    b.querySelector<HTMLElement>('em.foe')!.hidden = !isFoe;
  });
}

/**
 * 유닛 정보 칸. 마지막으로 본 유닛을 계속 보여 주고, 랜덤처럼 유닛이 아닌 칸은 무시한다.
 * 그래프는 그대로 두고 수치만 바꿔야 이전 유닛의 모양에서 이어서 변한다.
 */
function showPeek(app: HTMLElement, id: string) {
  const unit = ROSTER.find((r) => r.id === id);
  const peek = app.querySelector<HTMLElement>('#peek')!;
  if (!unit || peek.dataset.showing === unit.id) return;
  peek.dataset.showing = unit.id;
  if (!peek.firstElementChild) {
    peek.innerHTML = `<div class="figure"></div><div class="peek-info"><b></b>${radarFrame()}<p></p></div>`;
  }
  peek.querySelector('.figure')!.outerHTML = figureOf(unit.unit);
  peek.querySelector('.peek-info b')!.textContent = unit.unit.name;
  peek.querySelector('.peek-info p')!.textContent = unit.blurb;
  animateRadar(peek.querySelector('.radar')!, unit);
}

function choose(app: HTMLElement, value: string, onStart: Start) {
  if (activeSlot === 'me') {
    pickMe = value === RANDOM ? RANDOM : ROSTER.find((r) => r.id === value)!;
    activeSlot = 'foe'; // 내 유닛을 고르면 바로 상대를 고를 차례다
  } else {
    pickFoe = value === RANDOM ? RANDOM : ROSTER.find((r) => r.id === value)!;
    if (pickMe === null) activeSlot = 'me';
  }
  paint(app);
  // 양쪽이 다 차면 곧바로 스테이지를 고른다.
  if (pickMe !== null && pickFoe !== null) openPanel(app, onStart);
}

export function showTitle(onStart: Start) {
  // 전투에서 돌아오면 내 유닛은 남기고 상대부터 다시 고른다.
  pickFoe = null;
  activeSlot = pickMe === null ? 'me' : 'foe';
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="select">
      <div class="slots">${slotButton('me', '내 유닛')}${slotButton('foe', '상대 유닛')}</div>
      <div class="peek" id="peek"></div>
      ${unitGrid()}
    </div>`;
  app.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) =>
    b.addEventListener('click', () => {
      activeSlot = b.dataset.slot as Slot;
      paint(app);
    }),
  );
  app.querySelectorAll<HTMLElement>('[data-unit]').forEach((b) => {
    b.addEventListener('click', () => {
      showPeek(app, b.dataset.unit!); // 호버가 없는 터치 기기에서는 누른 유닛을 보여 준다
      choose(app, b.dataset.unit!, onStart);
    });
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') showPeek(app, b.dataset.unit!);
    });
  });
  paint(app);
}

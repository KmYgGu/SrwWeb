import './style.css';
import { chooseDefense, decide, PROFILES } from '../ai/ai';
import { ABILITIES, GRID_H, GRID_W, ROSTER, SPIRITS, TERRAINS } from '../core/data';
import { calcStrike, counterWeapons, fighterOf, type DefenseChoice, type StrikeEvent } from '../core/exchange';
import {
  activeUnit,
  anyCastable,
  canMove,
  castable,
  createGame,
  envOf,
  moveRange,
  perform,
  weaponStatus,
} from '../core/game';
import { tileKey } from '../core/map';
import type { Action, GameState, RosterEntry, Unit } from '../core/types';

const ME = 0;
const FOE = 1;
const app = document.getElementById('app')!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let game: GameState;
let busy = false;
let canvas: HTMLCanvasElement;
let ctx2d: CanvasRenderingContext2D;
let tile = 40;
const floaters: { x: number; y: number; text: string; t0: number; color: string }[] = [];

let pickMe = ROSTER[0];
let pickFoe: RosterEntry | null = null;

// ---------- 시작 화면 ----------
function showTitle() {
  const card = (r: RosterEntry, sel: boolean, id: string) =>
    `<button class="card ${sel ? 'sel' : ''}" data-${id}="${r.id}"><b>${r.name}</b><small>${r.blurb}</small></button>`;
  app.innerHTML = `
    <div class="title">
      <h1>1:1 전투 프로토타입</h1>
      <p>직접 조작 vs AI. 이동 → 공격, 정신 커맨드는 기체마다 6개를 1회씩.</p>
      <h2>내 기체</h2>
      <div class="cards">${ROSTER.map((r) => card(r, r.id === pickMe.id, 'me')).join('')}</div>
      <h2>상대 기체</h2>
      <div class="cards">
        <button class="card ${pickFoe === null ? 'sel' : ''}" data-foe="random"><b>랜덤</b><small>나와 다른 기체가 나온다</small></button>
        ${ROSTER.map((r) => card(r, pickFoe?.id === r.id, 'foe')).join('')}
      </div>
      <button class="primary" id="start" style="width:100%">전투 시작</button>
    </div>`;
  app.querySelectorAll<HTMLElement>('[data-me]').forEach((b) =>
    b.addEventListener('click', () => {
      pickMe = ROSTER.find((r) => r.id === b.dataset.me)!;
      showTitle();
    }),
  );
  app.querySelectorAll<HTMLElement>('[data-foe]').forEach((b) =>
    b.addEventListener('click', () => {
      pickFoe = b.dataset.foe === 'random' ? null : ROSTER.find((r) => r.id === b.dataset.foe)!;
      showTitle();
    }),
  );
  document.getElementById('start')!.addEventListener('click', () => {
    const others = ROSTER.filter((r) => r.id !== pickMe.id);
    const foe = pickFoe ?? others[Math.floor(Math.random() * others.length)];
    startBattle(pickMe, foe);
  });
}

// ---------- 전투 화면 ----------
function startBattle(a: RosterEntry, b: RosterEntry) {
  game = createGame(a, b, (Math.random() * 2 ** 31) | 0);
  floaters.length = 0;
  busy = false;
  app.innerHTML = `
    <div class="hud foe" id="foeHud"></div>
    <div id="boardWrap"><canvas id="board"></canvas></div>
    <div id="log"></div>
    <div class="hud me" id="meHud"></div>
    <div class="cmds">
      <button id="bAtk">공격</button>
      <button id="bSp">정신</button>
      <button id="bEnd">턴 종료</button>
    </div>`;
  canvas = document.getElementById('board') as HTMLCanvasElement;
  ctx2d = canvas.getContext('2d')!;
  canvas.addEventListener('click', onBoardClick);
  window.addEventListener('resize', layout);
  document.getElementById('bAtk')!.addEventListener('click', openWeapons);
  document.getElementById('bSp')!.addEventListener('click', openSpirits);
  document.getElementById('bEnd')!.addEventListener('click', () => void playerAct({ type: 'wait' }));
  layout();
  requestAnimationFrame(frame);
}

function layout() {
  const wrap = document.getElementById('boardWrap');
  if (!wrap || !canvas) return;
  tile = Math.max(24, Math.floor(Math.min(wrap.clientWidth / GRID_W, wrap.clientHeight / GRID_H)));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${tile * GRID_W}px`;
  canvas.style.height = `${tile * GRID_H}px`;
  canvas.width = tile * GRID_W * dpr;
  canvas.height = tile * GRID_H * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame() {
  if (!canvas.isConnected) return;
  draw();
  refreshPanels();
  requestAnimationFrame(frame);
}

function draw() {
  const g = ctx2d;
  g.clearRect(0, 0, tile * GRID_W, tile * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      g.fillStyle = TERRAINS[game.grid[y][x]].color;
      g.fillRect(x * tile, y * tile, tile, tile);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(x * tile, y * tile, tile, tile);
      const id = game.grid[y][x];
      if (id !== 'plain') {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `${tile * 0.28}px sans-serif`;
        g.textAlign = 'left';
        g.fillText(TERRAINS[id].name, x * tile + 3, y * tile + tile * 0.3);
      }
    }
  }
  if (!busy && game.winner === null && game.turn.side === ME && canMove(game)) {
    g.fillStyle = 'rgba(74,163,255,0.35)';
    for (const k of moveRange(game).keys()) g.fillRect((k % GRID_W) * tile, Math.floor(k / GRID_W) * tile, tile, tile);
  }
  for (const u of game.units) drawUnit(u);
  const now = performance.now();
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    const p = (now - f.t0) / 1000;
    if (p > 1) {
      floaters.splice(i, 1);
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

function drawUnit(u: Unit) {
  const g = ctx2d;
  const cx = u.pos.x * tile + tile / 2;
  const cy = u.pos.y * tile + tile / 2;
  const mine = u.side === ME;
  g.fillStyle = mine ? '#2f78d0' : '#d0453a';
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

function buffChips(u: Unit): string {
  const b = u.buffs;
  const c: string[] = [];
  if (b.sure) c.push('필중');
  if (b.flash) c.push('섬광');
  if (b.takenMul !== 1) c.push(`피격×${b.takenMul}`);
  if (b.dealtMul !== 1) c.push(`공격×${b.dealtMul}`);
  if (b.focus) c.push('집중');
  if (b.pierce) c.push('간파');
  return c.map((x) => `<span class="chip">${x}</span>`).join('');
}

function panel(u: Unit): string {
  const abil = u.pilot.abilities.map((a) => ABILITIES[a].name).join(' · ');
  return `<div class="row"><b>${u.def.name} / ${u.pilot.name}</b><span>HP ${u.hp}/${u.def.hp}</span></div>
    <div class="bar hp"><i style="width:${(u.hp / u.def.hp) * 100}%"></i></div>
    <div class="row"><span>EN ${u.en}/${u.def.en}</span><span>SP ${u.sp}</span><span>${abil}</span></div>
    <div class="bar en"><i style="width:${(u.en / u.def.en) * 100}%"></i></div>
    <div class="chips">${buffChips(u)}</div>`;
}

let lastPanel = '';
function refreshPanels() {
  const html = panel(game.units[FOE]) + '|' + panel(game.units[ME]);
  const mine = game.turn.side === ME && !busy && game.winner === null;
  const key = html + mine + game.log.length;
  if (key === lastPanel) return;
  lastPanel = key;
  document.getElementById('foeHud')!.innerHTML = panel(game.units[FOE]);
  document.getElementById('meHud')!.innerHTML = panel(game.units[ME]);
  const log = document.getElementById('log')!;
  log.innerHTML = game.log.slice(-30).map((l) => `<div>${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  (document.getElementById('bAtk') as HTMLButtonElement).disabled = !mine || game.turn.acted;
  (document.getElementById('bSp') as HTMLButtonElement).disabled = !mine || !anyCastable(game);
  (document.getElementById('bEnd') as HTMLButtonElement).disabled = !mine;
}

// ---------- 시트(모달) ----------
function sheet<T>(title: string, build: (close: (v: T | null) => void, box: HTMLElement) => void): Promise<T | null> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.innerHTML = `<div><h3>${title}</h3><div class="body"></div></div>`;
    const close = (v: T | null) => {
      el.remove();
      resolve(v);
    };
    el.addEventListener('click', (e) => {
      if (e.target === el) close(null);
    });
    document.body.appendChild(el);
    build(close, el.querySelector('.body')!);
  });
}

function strikeText(atk: Unit, def: Unit, wi: number, evade = false, guard = false): string {
  const w = atk.def.weapons[wi];
  const st = calcStrike(envOf(game), fighterOf(atk), fighterOf(def), w, evade, guard);
  return st.flash ? '명중 0% (섬광)' : `명중 ${Math.round(st.hit * 100)}% · 피해 ${st.dmg}`;
}

const STATUS_TEXT = { ok: '', en: 'EN 부족', ammo: '탄 없음', p: '이동 후 불가(P)', range: '사거리 밖' };

async function openWeapons() {
  if (busy || game.turn.side !== ME || game.turn.acted) return;
  const me = activeUnit(game);
  const foe = game.units[FOE];
  const wi = await sheet<number>('무기 선택', (close, box) => {
    me.def.weapons.forEach((w, i) => {
      const st = weaponStatus(game, me, i);
      const b = document.createElement('button');
      b.className = 'opt' + (st === 'ok' ? '' : ' bad');
      b.disabled = st !== 'ok';
      const cost = [w.enCost ? `EN ${w.enCost}` : '', w.ammo !== null ? `탄 ${me.ammo[i]}` : '', w.isP ? 'P' : ''].filter(Boolean).join(' · ');
      b.innerHTML = `<b>${w.name}</b> 사거리 ${w.minRange}-${w.maxRange} · 위력 ${w.power} ${cost ? '· ' + cost : ''}
        <small>${st === 'ok' ? strikeText(me, foe, i) : STATUS_TEXT[st]}</small>`;
      b.addEventListener('click', () => close(i));
      box.appendChild(b);
    });
  });
  if (wi !== null) await playerAct({ type: 'attack', weapon: wi });
}

async function openSpirits() {
  if (busy || game.turn.side !== ME) return;
  const me = activeUnit(game);
  const id = await sheet<string>(`정신 커맨드 (SP ${me.sp})`, (close, box) => {
    for (const sid of me.pilot.spirits) {
      const d = SPIRITS[sid];
      const used = me.used.includes(sid);
      const b = document.createElement('button');
      b.className = 'opt';
      b.disabled = !castable(game, sid);
      b.innerHTML = `<b>${d.name}</b> SP ${d.cost}${used ? ' · 사용함' : ''}<small>${d.desc}</small>`;
      b.addEventListener('click', () => close(sid));
      box.appendChild(b);
    }
  });
  if (id !== null) await playerAct({ type: 'spirit', id: id as keyof typeof SPIRITS });
}

async function askDefense(wi: number): Promise<DefenseChoice> {
  const atk = activeUnit(game);
  const me = game.units[ME];
  const w = atk.def.weapons[wi];
  const fa = fighterOf(atk);
  const fd = fighterOf(me);
  const r = await sheet<DefenseChoice>(`${atk.def.name}의 ${w.name} — 어떻게 받을까?`, (close, box) => {
    for (const cw of counterWeapons(fd, fa)) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = `<b>반격: ${me.def.weapons[cw].name}</b><small>상대에게 ${strikeText(me, atk, cw)} · 받는 공격 ${strikeText(atk, me, wi)}</small>`;
      b.addEventListener('click', () => close({ kind: 'counter', weapon: cw }));
      box.appendChild(b);
    }
    const g = document.createElement('button');
    g.className = 'opt';
    g.innerHTML = `<b>방어</b><small>받는 피해 절반, 반격 없음 · ${strikeText(atk, me, wi, false, true)}</small>`;
    g.addEventListener('click', () => close({ kind: 'guard' }));
    const e = document.createElement('button');
    e.className = 'opt';
    e.innerHTML = `<b>회피</b><small>명중률 절반, 반격 없음 · ${strikeText(atk, me, wi, true, false)}</small>`;
    e.addEventListener('click', () => close({ kind: 'evade' }));
    box.append(g, e);
  });
  return r ?? { kind: 'guard' };
}

// ---------- 진행 ----------
function show(events: StrikeEvent[], attacker: number) {
  for (const ev of events) {
    const target = ev.by === 0 ? 1 - attacker : attacker;
    const u = game.units[target];
    const text =
      ev.result === 'hit' ? String(ev.dmg) : ev.result === 'miss' ? 'MISS' : ev.result === 'flash' ? '섬광' : ev.result === 'bunshin' ? '분신' : '배리어';
    floaters.push({ x: u.pos.x, y: u.pos.y, text, t0: performance.now(), color: ev.result === 'hit' ? '#ffd24a' : '#ffffff' });
  }
}

async function exec(act: Action, defense?: DefenseChoice) {
  const r = perform(game, act, defense);
  if (!r.ok) {
    console.warn(r.error);
    return;
  }
  if (r.events.length) {
    show(r.events, r.attacker);
    await sleep(900);
  }
}

async function playerAct(act: Action) {
  if (busy || game.turn.side !== ME || game.winner !== null) return;
  busy = true;
  await exec(act, act.type === 'attack' ? chooseDefense(game, act.weapon, PROFILES.balanced) : undefined);
  busy = false;
  await afterAction();
}

async function afterAction() {
  if (game.winner !== null) return showResult();
  if (game.turn.side === FOE) await runAi();
  if (game.winner !== null) showResult();
}

async function runAi() {
  busy = true;
  const prof = PROFILES.balanced;
  let guard = 0;
  while (game.turn.side === FOE && game.winner === null && guard++ < 50) {
    await sleep(500);
    for (const act of decide(game, prof)) {
      if (game.turn.side !== FOE || game.winner !== null) break;
      const defense = act.type === 'attack' ? await askDefense(act.weapon) : undefined;
      await exec(act, defense);
      await sleep(250);
    }
  }
  busy = false;
}

async function onBoardClick(e: MouseEvent) {
  if (busy || game.winner !== null || game.turn.side !== ME || !canMove(game)) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / tile);
  const y = Math.floor((e.clientY - rect.top) / tile);
  if (!moveRange(game).has(tileKey(x, y))) return;
  await playerAct({ type: 'move', to: { x, y } });
}

function showResult() {
  const win = game.winner === ME;
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="result"><h2>${game.winner === 'draw' ? '무승부' : win ? '승리!' : '패배...'}</h2>
    <p>${game.round} 라운드</p><button class="primary" id="again" style="width:100%">처음으로</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#again')!.addEventListener('click', () => {
    el.remove();
    window.removeEventListener('resize', layout);
    showTitle();
  });
}

showTitle();

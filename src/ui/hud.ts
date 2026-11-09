import { ABILITIES } from '../core/abilities';
import { anyCastable, weaponStatus } from '../core/game';
import { PERSONALITIES } from '../core/personalities';
import { activeEffectLabels } from '../core/spirits';
import type { Unit } from '../core/types';
import { FOE, ME, session } from './session';
import { spiritChips } from './unitView';

/**
 * 초상화 그림은 public/portraits/<파일럿 id>.png 에 넣으면 나타난다.
 */
const portraitUrl = (u: Unit) => `${import.meta.env.BASE_URL}portraits/${u.pilot.id}.png`;

const gauge = (kind: 'hp' | 'en', label: string, cur: number, max: number) =>
  `<div class="gauge"><b>${label}</b><div class="bar ${kind}"><i style="width:${(cur / max) * 100}%"></i><span>${cur}</span></div></div>`;

/** 초상화 옆 세로 SP 막대. 숫자는 막대 아래(잘리지 않게). */
const spBar = (u: Unit) => {
  const max = u.pilot.sp;
  const pct = max <= 0 ? 0 : (u.sp / max) * 100;
  return `<div class="spwrap" title="SP ${u.sp}/${max}"><div class="spbar"><i style="height:${pct}%"></i></div><span class="spnum">${u.sp}</span></div>`;
};

function corner(u: Unit, side: 'me' | 'foe'): string {
  const pic = `<div class="pic"><div class="ph">${u.pilot.name[0]}</div>
      <img src="${portraitUrl(u)}" alt=""></div>`;
  const gauges = `<div class="gauges">${gauge('hp', 'HP', u.hp, u.def.hp)}${gauge('en', 'EN', u.en, u.def.en)}</div>`;
  const sp = spBar(u);
  // 아군은 초상|SP, 적은 SP|초상 순으로 바깥쪽에 SP 가 오게 한다.
  const top = side === 'me' ? `${pic}${sp}` : `${sp}${pic}`;
  return `<div class="corner-row">${top}</div>${gauges}`;
}

const buffChips = (u: Unit) => spiritChips(activeEffectLabels(u));

function info(u: Unit): string {
  const abil = u.pilot.abilities.map((a) => ABILITIES[a].name).join(' · ');
  const lw = u.lastWeapon === null ? null : u.def.weapons[u.lastWeapon];
  const last = lw ? `<small>최근 무기: ${lw.name} (사거리 ${lw.minRange}-${lw.maxRange})</small>` : '';
  const pers = PERSONALITIES[u.pilot.personality].name;
  return `<b>${u.def.name} / ${u.pilot.name}</b> · 기력 ${u.morale}<small>${pers} · ${abil}</small>${last}<div class="chips">${buffChips(u)}</div>`;
}

/** 전투 로그에서 눈에 띄게 할 줄 */
function logClass(line: string): string {
  if (line.startsWith('승자:') || line.includes('시간 종료')) return 'log-end';
  if (line.includes('「')) return 'log-spirit';
  if (/\d+\s*피해/.test(line)) return 'log-dmg';
  if (line.includes('빗나감') || line.includes('섬광') || line.includes('회피')) return 'log-miss';
  return '';
}

const $ = (id: string) => document.getElementById(id)!;
let last = '';

/** 상태가 바뀐 때만 DOM 을 다시 그린다(매 프레임 호출해도 싸다). */
export function refreshHud() {
  const game = session.game;
  const me = game.units[ME];
  const foe = game.units[FOE];
  const mine = game.turn.side === ME && !session.busy && game.winner === null;
  const html = [corner(me, 'me'), corner(foe, 'foe'), info(me), info(foe)];
  const key = `${html.join('|')}|${mine}|${game.turn.acted}|${game.log.length}|${me.pos.x},${me.pos.y},${foe.pos.x},${foe.pos.y}|${session.busy}|${game.turn.side}`;
  if (key === last) return;
  last = key;
  $('meCorner').innerHTML = html[0];
  $('foeCorner').innerHTML = html[1];
  $('meInfo').innerHTML = html[2];
  $('foeInfo').innerHTML = html[3];
  const log = $('log');
  log.innerHTML = game.log
    .slice(-40)
    .map((l) => {
      const cls = logClass(l);
      return `<div${cls ? ` class="${cls}"` : ''}>${l}</div>`;
    })
    .join('');
  log.scrollTop = log.scrollHeight;
  const atk = $('bAtk') as HTMLButtonElement;
  atk.disabled = !mine || game.turn.acted;
  // 지금 자리에서 쓸 수 있는 무기가 있으면 공격 버튼 색을 바꿔 알린다(이동한 뒤 닿는지 바로 알 수 있다).
  atk.classList.toggle('ready', mine && !game.turn.acted && me.def.weapons.some((_, i) => weaponStatus(game, me, i) === 'ok'));
  ($('bSp') as HTMLButtonElement).disabled = !mine || !anyCastable(game);
  const end = $('bEnd') as HTMLButtonElement;
  end.disabled = !mine;
  // 공격을 마쳤으면 턴 종료가 다음 할 일이라는 걸 눈에 띄게 한다.
  end.classList.toggle('primary', mine && game.turn.acted);

  const wait = document.getElementById('aiWait');
  if (wait) wait.hidden = !(session.busy && game.turn.side === FOE && game.winner === null);
}

export function resetHud() {
  last = '';
}

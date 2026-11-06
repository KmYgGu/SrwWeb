import { ABILITIES } from '../core/abilities';
import { anyCastable } from '../core/game';
import type { Unit } from '../core/types';
import { FOE, ME, session } from './session';

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

const $ = (id: string) => document.getElementById(id)!;
let last = '';

/** 상태가 바뀐 때만 DOM 을 다시 그린다(매 프레임 호출해도 싸다). */
export function refreshHud() {
  const game = session.game;
  const mine = game.turn.side === ME && !session.busy && game.winner === null;
  const foe = panel(game.units[FOE]);
  const me = panel(game.units[ME]);
  const key = `${foe}|${me}|${mine}|${game.turn.acted}|${game.log.length}`;
  if (key === last) return;
  last = key;
  $('foeHud').innerHTML = foe;
  $('meHud').innerHTML = me;
  const log = $('log');
  log.innerHTML = game.log.slice(-30).map((l) => `<div>${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  ($('bAtk') as HTMLButtonElement).disabled = !mine || game.turn.acted;
  ($('bSp') as HTMLButtonElement).disabled = !mine || !anyCastable(game);
  ($('bEnd') as HTMLButtonElement).disabled = !mine;
}

export function resetHud() {
  last = '';
}

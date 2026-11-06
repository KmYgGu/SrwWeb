import { calcStrike, counterWeapons, fighterOf, type DefenseChoice } from '../core/exchange';
import { activeUnit, castable, envOf, weaponStatus } from '../core/game';
import { SPIRITS } from '../core/spirits';
import type { SpiritId, Unit } from '../core/types';
import { FOE, ME, session } from './session';

/** 아래에서 올라오는 선택창. 고르면 값을, 바깥을 누르면 null 을 돌려준다. */
export function sheet<T>(title: string, build: (close: (v: T | null) => void, box: HTMLElement) => void): Promise<T | null> {
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
  const st = calcStrike(envOf(session.game), fighterOf(atk), fighterOf(def), atk.def.weapons[wi], evade, guard);
  return st.flash ? '명중 0% (섬광)' : `명중 ${Math.round(st.hit * 100)}% · 피해 ${st.dmg}`;
}

const STATUS_TEXT = { ok: '', en: 'EN 부족', ammo: '탄 없음', p: '이동 후 불가(P)', range: '사거리 밖' };

export function pickWeapon(): Promise<number | null> {
  const game = session.game;
  const me = activeUnit(game);
  const foe = game.units[FOE];
  return sheet<number>('무기 선택', (close, box) => {
    me.def.weapons.forEach((w, i) => {
      const st = weaponStatus(game, me, i);
      const b = document.createElement('button');
      b.className = 'opt' + (st === 'ok' ? '' : ' bad');
      b.disabled = st !== 'ok';
      const cost = [w.enCost ? `EN ${w.enCost}` : '', w.ammo !== null ? `탄 ${me.ammo[i]}` : '', w.isP ? 'P' : '']
        .filter(Boolean)
        .join(' · ');
      b.innerHTML = `<b>${w.name}</b> 사거리 ${w.minRange}-${w.maxRange} · 위력 ${w.power} ${cost ? '· ' + cost : ''}
        <small>${st === 'ok' ? strikeText(me, foe, i) : STATUS_TEXT[st]}</small>`;
      b.addEventListener('click', () => close(i));
      box.appendChild(b);
    });
  });
}

export function pickSpirit(): Promise<SpiritId | null> {
  const game = session.game;
  const me = activeUnit(game);
  return sheet<SpiritId>(`정신 커맨드 (SP ${me.sp})`, (close, box) => {
    for (const id of me.pilot.spirits) {
      const d = SPIRITS[id];
      const b = document.createElement('button');
      b.className = 'opt';
      b.disabled = !castable(game, id);
      b.innerHTML = `<b>${d.name}</b> SP ${d.cost}${me.used.includes(id) ? ' · 사용함' : ''}<small>${d.desc}</small>`;
      b.addEventListener('click', () => close(id));
      box.appendChild(b);
    }
  });
}

/** 공격을 받을 때 반격·방어·회피를 고른다. 창을 닫으면 방어로 처리한다. */
export async function askDefense(weapon: number): Promise<DefenseChoice> {
  const game = session.game;
  const atk = activeUnit(game);
  const me = game.units[ME];
  const w = atk.def.weapons[weapon];
  const fa = fighterOf(atk);
  const fd = fighterOf(me);
  const r = await sheet<DefenseChoice>(`${atk.def.name}의 ${w.name} — 어떻게 받을까?`, (close, box) => {
    const add = (html: string, choice: DefenseChoice) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = html;
      b.addEventListener('click', () => close(choice));
      box.appendChild(b);
    };
    for (const cw of counterWeapons(fd, fa)) {
      add(
        `<b>반격: ${me.def.weapons[cw].name}</b><small>상대에게 ${strikeText(me, atk, cw)} · 받는 공격 ${strikeText(atk, me, weapon)}</small>`,
        { kind: 'counter', weapon: cw },
      );
    }
    add(`<b>방어</b><small>받는 피해 절반, 반격 없음 · ${strikeText(atk, me, weapon, false, true)}</small>`, { kind: 'guard' });
    add(`<b>회피</b><small>명중률 절반, 반격 없음 · ${strikeText(atk, me, weapon, true, false)}</small>`, { kind: 'evade' });
  });
  return r ?? { kind: 'guard' };
}

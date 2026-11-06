/**
 * 공격이 오가기 직전의 최종 선택 화면.
 *  - 내가 공격할 때: 무기를 고르고 곧바로 확정한다(무기 선택과 확인이 한 화면).
 *  - 상대가 공격할 때: 반격·방어·회피를 고른다.
 * 두 경우 모두 양쪽 유닛의 정보(발동 중인 정신만)와 양쪽의 명중률을 한눈에 보이게 하고,
 * 격추할 수 있으면 맞는 쪽 체력 위에 OVERKILL 을 띄운다.
 */
import { ABILITIES } from '../core/abilities';
import { calcStrike, counterWeapons, fighterOf, maxStrikeDamage, type DefenseChoice, type Env, type Fighter } from '../core/exchange';
import { activeUnit, envOf, weaponStatus } from '../core/game';
import { PERSONALITIES } from '../core/personalities';
import { activeSpiritLabels } from '../core/spirits';
import type { Unit } from '../core/types';
import { FOE, ME, session } from './session';
import { addEffectsToggle, sheet, strikeText } from './sheets';
import { figure, gauge, spiritChips } from './unitView';

function unitCard(u: Unit, role: 'me' | 'foe'): string {
  const abilities = u.pilot.abilities.map((a) => ABILITIES[a].name).join(' · ');
  const weapons = u.def.weapons.map((w) => `${w.name} ${w.minRange}-${w.maxRange}`).join(' · ');
  return `<div class="ucard ${role}">
    ${figure(u)}
    <b>${u.def.name} / ${u.pilot.name}</b>
    <div class="ko" hidden>OVERKILL</div>
    ${gauge('hp', 'HP', u.hp, u.def.hp)}
    ${gauge('en', 'EN', u.en, u.def.en)}
    <small>기력 ${u.morale} · SP ${u.sp} · ${PERSONALITIES[u.pilot.personality].name}</small>
    <small>${abilities}</small>
    ${role === 'foe' ? `<small>무기: ${weapons}</small>` : ''}
    <small>발동 중인 정신</small>
    <div class="chips">${spiritChips(activeSpiritLabels(u))}</div>
    <div class="hit"></div>
  </div>`;
}

const duel = (me: Unit, foe: Unit) => `<div class="duel">${unitCard(me, 'me')}${unitCard(foe, 'foe')}</div>`;

/** 격추할 수 있을 때 맞는 쪽 카드의 체력 위에 OVERKILL 을 띄운다. */
function setOverkill(box: HTMLElement, role: 'me' | 'foe', on: boolean) {
  box.querySelector<HTMLElement>(`.ucard.${role} .ko`)!.hidden = !on;
}

/** 카드 맨 아래의 큰 명중률 표시 */
function setHit(box: HTMLElement, role: 'me' | 'foe', label: string, value: string) {
  box.querySelector<HTMLElement>(`.ucard.${role} .hit`)!.innerHTML = `${value}<small>${label}</small>`;
}

const pct = (h: number) => `${Math.round(h * 100)}%`;

function hitOf(env: Env, atk: Fighter, def: Fighter, wi: number): number {
  return calcStrike(env, atk, def, atk.u.def.weapons[wi], false, false).hit;
}

/** def 가 atk 의 공격에 반격한다면 쓸 만한 무기(기대 피해가 가장 큰 것). 쓸 수 있는 무기가 없으면 null. */
function bestCounter(env: Env, def: Fighter, atk: Fighter): { wi: number; hit: number } | null {
  let best: { wi: number; hit: number; e: number } | null = null;
  for (const wi of counterWeapons(def, atk)) {
    const st = calcStrike(env, def, atk, def.u.def.weapons[wi], false, false);
    if (!best || st.hit * st.dmg > best.e) best = { wi, hit: st.hit, e: st.hit * st.dmg };
  }
  return best;
}

function setCounterHit(box: HTMLElement, role: 'me' | 'foe', env: Env, def: Fighter, atk: Fighter) {
  const c = bestCounter(env, def, atk);
  if (c) setHit(box, role, `반격: ${def.u.def.weapons[c.wi].name}`, pct(c.hit));
  else setHit(box, role, '반격', '불가');
}

const STATUS_TEXT = { ok: '', en: 'EN 부족', ammo: '탄 없음', morale: '기력 부족', p: '이동 후 불가(P)', range: '사거리 밖' };

/**
 * 내 공격. 무기를 고르면 그 무기의 결과가 바로 보이고, 공격을 누르면 확정한다.
 * 크리티컬 없이 한 번 맞혀서 격추할 수 있을 때만 OVERKILL 이 뜬다.
 */
export function chooseAttack(): Promise<number | null> {
  const game = session.game;
  const me = activeUnit(game);
  const foe = game.units[FOE];
  const env = envOf(game);
  const fm = fighterOf(me);
  const fo = fighterOf(foe);
  const usable = me.def.weapons.map((_, i) => weaponStatus(game, me, i) === 'ok');
  const kills = me.def.weapons.map((_, i) => maxStrikeDamage(env, fm, fo, i, false) >= foe.hp);
  // 처음 고른 상태: 쓸 수 있는 무기 중 기대 피해가 가장 큰 것
  let selected: number | null = null;
  let bestExpected = -1;
  me.def.weapons.forEach((w, i) => {
    if (!usable[i]) return;
    const st = calcStrike(env, fm, fo, w, false, false);
    if (st.hit * st.dmg > bestExpected) {
      bestExpected = st.hit * st.dmg;
      selected = i;
    }
  });

  return sheet<number>(
    '공격 선택',
    (close, box) => {
      box.insertAdjacentHTML('beforeend', duel(me, foe));
      setCounterHit(box, 'foe', env, fo, fm);
      const rows: HTMLButtonElement[] = [];
      const list = document.createElement('div');
      list.className = 'weapons';
      me.def.weapons.forEach((w, i) => {
        const st = weaponStatus(game, me, i);
        const b = document.createElement('button');
        b.className = 'opt' + (st === 'ok' ? '' : ' bad');
        b.disabled = st !== 'ok';
        const cost = [w.enCost ? `EN ${w.enCost}` : '', w.ammo !== null ? `탄 ${me.ammo[i]}` : '', w.isP ? 'P' : '', w.minMorale ? `기력 ${w.minMorale}↑` : '']
          .filter(Boolean)
          .join(' · ');
        const tag = kills[i] ? ' <span class="tag">격추 가능</span>' : '';
        b.innerHTML = `<b>${w.name}</b> 사거리 ${w.minRange}-${w.maxRange} · 위력 ${w.power}${cost ? ' · ' + cost : ''}
          <small>${st === 'ok' ? strikeText(me, foe, i) + tag : STATUS_TEXT[st]}</small>`;
        b.addEventListener('click', () => {
          selected = i;
          paint();
        });
        rows.push(b);
        list.appendChild(b);
      });
      box.appendChild(list);
      addEffectsToggle(box);
      const row = document.createElement('div');
      row.className = 'row2 sticky';
      row.innerHTML = '<button id="no">취소</button><button class="primary" id="yes">공격</button>';
      const yes = row.querySelector<HTMLButtonElement>('#yes')!;
      row.querySelector('#no')!.addEventListener('click', () => close(null));
      yes.addEventListener('click', () => close(selected));
      box.appendChild(row);

      const paint = () => {
        rows.forEach((b, i) => b.classList.toggle('selected', i === selected));
        setOverkill(box, 'foe', selected !== null && kills[selected]);
        if (selected === null) setHit(box, 'me', '무기를 고르세요', '—');
        else setHit(box, 'me', me.def.weapons[selected].name, pct(hitOf(env, fm, fo, selected)));
        yes.disabled = selected === null;
      };
      paint();
    },
    { tall: true },
  );
}

/**
 * 상대의 공격을 받을 때 반격·방어·회피를 고른다. 창을 닫으면 방어로 처리한다.
 * 크리티컬이 없는 대신 추격까지 더한 최대 피해로 내가 격추될 수 있으면 내 체력 위에 OVERKILL 이 뜬다.
 */
export async function askDefense(weapon: number): Promise<DefenseChoice> {
  const game = session.game;
  const atk = activeUnit(game);
  const me = game.units[ME];
  const w = atk.def.weapons[weapon];
  const env = envOf(game);
  const fa = fighterOf(atk);
  const fd = fighterOf(me);
  const lethal = maxStrikeDamage(env, fa, fd, weapon, true) >= me.hp;
  const lethalGuarded = maxStrikeDamage(env, fa, fd, weapon, true, true) >= me.hp;
  const r = await sheet<DefenseChoice>(
    `${atk.def.name}의 ${w.name} — 어떻게 받을까?`,
    (close, box) => {
      box.insertAdjacentHTML('beforeend', duel(me, atk));
      setOverkill(box, 'me', lethal);
      setHit(box, 'foe', w.name, pct(hitOf(env, fa, fd, weapon)));
      setCounterHit(box, 'me', env, fd, fa);
      const list = document.createElement('div');
      list.className = 'weapons';
      const add = (html: string, choice: DefenseChoice, danger: boolean) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = html.replace('</small>', `${danger ? ' <span class="tag">격추 위험</span>' : ''}</small>`);
        b.addEventListener('click', () => close(choice));
        list.appendChild(b);
      };
      for (const cw of counterWeapons(fd, fa)) {
        add(
          `<b>반격: ${me.def.weapons[cw].name}</b><small>상대에게 ${strikeText(me, atk, cw)} · 받는 공격 ${strikeText(atk, me, weapon)}</small>`,
          { kind: 'counter', weapon: cw },
          lethal,
        );
      }
      add(`<b>방어</b><small>받는 피해 절반, 반격 없음 · ${strikeText(atk, me, weapon, false, true)}</small>`, { kind: 'guard' }, lethalGuarded);
      add(`<b>회피</b><small>명중률 절반, 반격 없음 · ${strikeText(atk, me, weapon, true, false)}</small>`, { kind: 'evade' }, lethal);
      box.appendChild(list);
      addEffectsToggle(box);
    },
    { tall: true },
  );
  return r ?? { kind: 'guard' };
}

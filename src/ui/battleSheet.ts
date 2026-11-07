/**
 * 공격이 오가기 직전의 최종 선택 화면.
 *  - 내가 공격할 때: 무기를 고르고 곧바로 확정한다(무기 선택과 확인이 한 화면).
 *  - 상대가 공격할 때: 반격·방어·회피를 고른다.
 * 두 경우 모두 양쪽 유닛의 정보(발동 중인 정신만)와 명중률·피해를 한눈에 보이게 하고,
 * 잃을 수 있는 HP·EN 은 게이지에서 깜빡이며, 격추될 수 있으면 그쪽 체력 위에 OVERKILL 을 띄운다.
 */
import { bestCounter, chooseDefense } from '../ai/ai';
import { ABILITIES } from '../core/abilities';
import { TERRAINS } from '../core/data';
import { calcStrike, counterWeapons, fighterOf, gradeOf, maxStrikeDamage, worstLoss, type DefenseChoice, type Env, type Fighter } from '../core/exchange';
import { activeUnit, envOf, weaponStatus } from '../core/game';
import { PERSONALITIES } from '../core/personalities';
import { activeSpiritLabels } from '../core/spirits';
import type { Unit } from '../core/types';
import { AI_PROFILE, FOE, ME, session } from './session';
import { addEffectsToggle, sheet, strikeText } from './sheets';
import { showUnitInfo } from './unitInfo';
import { figure, gauge, spiritChips } from './unitView';

type Role = 'me' | 'foe';

function unitCard(u: Unit, role: Role): string {
  const abilities = u.pilot.abilities.map((a) => ABILITIES[a].name).join(' · ');
  const active = activeSpiritLabels(u);
  return `<div class="ucard ${role}">
    ${figure(u)}
    <b>${u.def.name} / ${u.pilot.name}</b>
    <div class="ko" hidden>OVERKILL</div>
    ${gauge('hp', 'HP', u.hp, u.def.hp)}
    ${gauge('en', 'EN', u.en, u.def.en)}
    <small>기력 ${u.morale} · SP ${u.sp} · ${PERSONALITIES[u.pilot.personality].name}</small>
    <small>${abilities}</small>
    ${active.length > 0 ? '<small>발동 중인 정신</small>' : ''}
    <div class="chips">${spiritChips(active)}</div>
    <div class="hit"></div>
  </div>`;
}

/** 유닛 그림을 누르면 그 유닛의 모든 정보를 위에 겹쳐 보여 준다. 닫으면 이 선택 화면으로 돌아온다. */
function wireInfo(box: HTMLElement, me: Unit, foe: Unit) {
  box.querySelector('.ucard.me .figure')!.addEventListener('click', () => void showUnitInfo(me));
  box.querySelector('.ucard.foe .figure')!.addEventListener('click', () => void showUnitInfo(foe));
}

const duel = (me: Unit, foe: Unit) => `<div class="duel">${unitCard(me, 'me')}${unitCard(foe, 'foe')}</div>`;

/** 격추할 수 있을 때 맞는 쪽 카드의 체력 위에 OVERKILL 을 띄운다. */
function setOverkill(box: HTMLElement, role: Role, on: boolean) {
  box.querySelector<HTMLElement>(`.ucard.${role} .ko`)!.hidden = !on;
}

/** 카드 맨 아래의 큰 명중률 표시. 피해 줄은 내용이 없어도 자리를 지켜서, 고르는 도중 아래 버튼이 움직이지 않게 한다. */
function setHit(box: HTMLElement, role: Role, label: string, value: string, dmg?: number) {
  box.querySelector<HTMLElement>(`.ucard.${role} .hit`)!.innerHTML =
    `${value}<small>${label || '&nbsp;'}</small><small>${dmg === undefined ? '&nbsp;' : `피해 ${dmg}`}</small>`;
}

const pct = (h: number) => `${Math.round(h * 100)}%`;

/** 게이지에서 잃을 수 있는 구간을 깜빡이게 한다. 잃을 것이 없으면 숨긴다. */
function setLoss(box: HTMLElement, role: Role, kind: 'hp' | 'en', cur: number, max: number, loss: number) {
  const bar = box.querySelector<HTMLElement>(`.ucard.${role} .bar.${kind}`)!;
  let mark = bar.querySelector<HTMLElement>('.loss');
  if (!mark) {
    mark = document.createElement('em');
    mark.className = 'loss';
    bar.querySelector('span')!.before(mark);
  }
  const lost = Math.min(cur, loss);
  mark.hidden = lost <= 0;
  mark.style.left = `${((cur - lost) / max) * 100}%`;
  mark.style.width = `${(lost / max) * 100}%`;
}

/** 화면의 한쪽 카드와 그 유닛의 전투 스냅샷 */
interface Side {
  role: Role;
  f: Fighter;
}

/**
 * 공격 무기와 받는 쪽의 선택이 정해졌을 때 두 카드를 그린다. 공격·방어 화면 모두 이것 하나로 그린다.
 * 게이지와 OVERKILL 은 worstLoss 에서 나오므로 전투 규칙과 어긋나지 않는다.
 */
function paintExchange(box: HTMLElement, env: Env, atk: Side, def: Side, wi: number, choice: DefenseChoice) {
  const guard = choice.kind === 'guard';
  const w = atk.f.u.def.weapons[wi];
  setHit(box, atk.role, w.name, pct(calcStrike(env, atk.f, def.f, w, choice.kind === 'evade', guard).hit), maxStrikeDamage(env, atk.f, def.f, wi, false, guard));
  if (choice.kind === 'counter') {
    const cw = def.f.u.def.weapons[choice.weapon];
    setHit(box, def.role, `반격: ${cw.name}`, pct(calcStrike(env, def.f, atk.f, cw, false, false).hit), maxStrikeDamage(env, def.f, atk.f, choice.weapon, false));
  } else if (guard) {
    setHit(box, def.role, '받는 피해 절반', '방어');
  } else {
    setHit(box, def.role, '명중률 절반', '회피');
  }
  const loss = worstLoss(env, atk.f, def.f, wi, choice);
  for (const [side, l] of [[atk, loss.atk], [def, loss.def]] as const) {
    const u = side.f.u;
    setLoss(box, side.role, 'hp', side.f.hp, u.def.hp, l.hp);
    setLoss(box, side.role, 'en', side.f.en, u.def.en, l.en);
    setOverkill(box, side.role, l.hp >= side.f.hp);
  }
}

/** 무기가 쓰는 자원과 특수 효과 */
function weaponTags(u: Unit, wi: number): string[] {
  const w = u.def.weapons[wi];
  return [
    w.enCost ? `EN ${w.enCost}` : '',
    w.ammo !== null ? `탄 ${u.ammo[wi]}` : '',
    w.isP ? 'P' : '',
    w.minMorale ? `기력 ${w.minMorale}↑` : '',
  ].filter(Boolean);
}

/** 지금 선 곳의 적응 등급과 그 보너스. 무기마다 다른 값이 아니라 유닛이 선 곳에 따라 정해진다. */
function adaptText(env: Env, f: Fighter): string {
  const air = f.u.def.moveClass === 'air';
  const key = air ? 'air' : env.grid[f.pos.y][f.pos.x];
  const place = air ? '공중' : TERRAINS[env.grid[f.pos.y][f.pos.x]].name;
  const g = gradeOf(env, f);
  const bonus = [g.hit ? `명중 ${g.hit > 0 ? '+' : ''}${g.hit}` : '', g.dmg !== 1 ? `피해 ×${g.dmg}` : ''].filter(Boolean).join(' ');
  return `${place} ${f.u.def.adapt[key]}${bonus ? ` (${bonus})` : ''}`;
}

const DRAG_STEP_PX = 28;
const DRAG_SLOP_PX = 8;
const WHEEL_GAP_MS = 120;

/**
 * 버튼 하나로 여러 값을 고른다. 휠을 누르거나 굴리면, 또는 위아래로 끌면 step 을 부른다.
 * 끌었을 때는 누른 것으로 치지 않으므로 무기를 바꾸다가 확정되는 일이 없다.
 */
function wireCycle(el: HTMLElement, step: (dir: 1 | -1) => void, tap: () => void) {
  let lastWheel = 0;
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < WHEEL_GAP_MS) return;
      lastWheel = now;
      step(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );
  // 휠 누르기: 막지 않으면 브라우저의 자동 스크롤이 시작된다.
  el.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  el.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    step(1);
  });

  let anchorY: number | null = null;
  let dragged = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    anchorY = e.clientY;
    dragged = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (anchorY === null) return;
    const dy = e.clientY - anchorY;
    if (!dragged && Math.abs(dy) >= DRAG_SLOP_PX) {
      dragged = true;
      el.setPointerCapture(e.pointerId);
    }
    if (Math.abs(dy) < DRAG_STEP_PX) return;
    const dir = dy < 0 ? 1 : -1;
    step(dir);
    anchorY -= dir * DRAG_STEP_PX;
  });
  const release = () => {
    anchorY = null;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('click', () => {
    if (!dragged) tap();
    dragged = false;
  });
}

const STATUS_TEXT = { ok: '', en: 'EN 부족', ammo: '탄 없음', morale: '기력 부족', p: '이동 후 불가(P)', range: '사거리 밖' };

/**
 * 내 공격. 무기를 고르면 그 무기의 결과가 바로 보이고, 공격을 누르면 확정한다.
 */
export function chooseAttack(): Promise<number | null> {
  const game = session.game;
  const me = activeUnit(game);
  const foe = game.units[FOE];
  const env = envOf(game);
  const fm = fighterOf(me);
  const fo = fighterOf(foe);
  const usable = me.def.weapons.map((_, i) => weaponStatus(game, me, i) === 'ok');
  // 상대의 반응은 무기마다 정해져 있다. 실제 공격 때도 같은 판단을 하므로 미리 보여 줄 수 있다.
  const reactions = me.def.weapons.map((_, i): DefenseChoice => (usable[i] ? chooseDefense(game, i, AI_PROFILE) : { kind: 'guard' }));
  const kills = me.def.weapons.map((_, i) => usable[i] && worstLoss(env, fm, fo, i, reactions[i]).def.hp >= foe.hp);
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
      wireInfo(box, me, foe);
      const rows: HTMLButtonElement[] = [];
      const list = document.createElement('div');
      list.className = 'weapons';
      me.def.weapons.forEach((w, i) => {
        const st = weaponStatus(game, me, i);
        const b = document.createElement('button');
        b.className = 'opt' + (st === 'ok' ? '' : ' bad');
        b.disabled = st !== 'ok';
        const cost = weaponTags(me, i).join(' · ');
        const tag = kills[i] ? ' <span class="tag">격추 가능</span>' : '';
        b.innerHTML = `<b>${w.name}</b> 사거리 ${w.minRange}-${w.maxRange} · 위력 ${w.power}${cost ? ' · ' + cost : ''}
          <small>${st === 'ok' ? strikeText(me, foe, i, reactions[i].kind === 'evade', reactions[i].kind === 'guard') + tag : STATUS_TEXT[st]}</small>`;
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
        if (selected === null) {
          setHit(box, 'me', '무기를 고르세요', '—');
          setHit(box, 'foe', '', '—');
        } else {
          paintExchange(box, env, { role: 'me', f: fm }, { role: 'foe', f: fo }, selected, reactions[selected]);
        }
        yes.disabled = selected === null;
      };
      paint();
    },
    { tall: true },
  );
}

/**
 * 상대의 공격을 받을 때 반격·방어·회피를 고른다. 창을 닫으면 방어로 처리한다.
 * 반격은 버튼 하나에 추천 무기를 띄워 두고, 휠이나 드래그로 다른 무기로 바꾼다.
 * 두 카드는 지금 보고 있는 선택의 결과를 보여 준다. 방어·회피 위에 올리거나 누르는 동안은 그 결과로 바뀐다.
 */
export async function askDefense(weapon: number): Promise<DefenseChoice> {
  const game = session.game;
  const atk = activeUnit(game);
  const me = game.units[ME];
  const w = atk.def.weapons[weapon];
  const env = envOf(game);
  const fa = fighterOf(atk);
  const fd = fighterOf(me);
  const counters = counterWeapons(fd, fa);
  const recommended = bestCounter(game, weapon, AI_PROFILE);
  const lost = (choice: DefenseChoice) => worstLoss(env, fa, fd, weapon, choice).def.hp >= me.hp;
  const r = await sheet<DefenseChoice>(
    `${atk.def.name}의 ${w.name} — 어떻게 받을까?`,
    (close, box) => {
      box.insertAdjacentHTML('beforeend', duel(me, atk));
      wireInfo(box, me, atk);
      const show = (choice: DefenseChoice) => paintExchange(box, env, { role: 'foe', f: fa }, { role: 'me', f: fd }, weapon, choice);

      const list = document.createElement('div');
      list.className = 'weapons';

      let current = recommended;
      const resting = (): DefenseChoice => (current === null ? { kind: 'guard' } : { kind: 'counter', weapon: current });
      const counter = document.createElement('button');
      counter.className = 'opt' + (counters.length > 1 ? ' cycling' : '');
      counter.disabled = current === null;
      const paintCounter = () => {
        if (current === null) {
          counter.innerHTML = '<b>반격 불가</b><small>쓸 수 있는 무기가 없습니다</small>';
          return;
        }
        const notes = [adaptText(env, fd), ...weaponTags(me, current)].join(' · ');
        const pos = counters.length > 1 ? `<span class="cycle-mark">▲<b>${counters.indexOf(current) + 1}/${counters.length}</b>▼</span>` : '';
        const tag = current === recommended && counters.length > 1 ? ' <span class="tag">추천</span>' : '';
        counter.innerHTML = `<b>반격: ${me.def.weapons[current].name}</b>${tag}<small>${notes}</small>${pos}`;
      };
      paintCounter();
      const confirm = () => close(resting());
      if (counters.length > 1) {
        counter.title = '휠 또는 위아래 드래그로 무기 변경';
        wireCycle(
          counter,
          (dir) => {
            current = counters[(counters.indexOf(current!) + dir + counters.length) % counters.length];
            paintCounter();
            show(resting());
          },
          confirm,
        );
      } else {
        counter.addEventListener('click', confirm);
      }
      list.appendChild(counter);

      const add = (name: string, text: string, choice: DefenseChoice) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = `<b>${name}</b><small>${text}${lost(choice) ? ' <span class="tag">격추 위험</span>' : ''}</small>`;
        b.addEventListener('click', () => close(choice));
        b.addEventListener('pointerenter', () => show(choice));
        b.addEventListener('pointerdown', () => show(choice));
        b.addEventListener('pointerleave', () => show(resting()));
        list.appendChild(b);
      };
      add('방어', `받는 피해 절반, 반격 없음 · ${strikeText(atk, me, weapon, false, true)}`, { kind: 'guard' });
      add('회피', `명중률 절반, 반격 없음 · ${strikeText(atk, me, weapon, true, false)}`, { kind: 'evade' });
      box.appendChild(list);
      addEffectsToggle(box);
      show(resting());
    },
    { tall: true },
  );
  return r ?? { kind: 'guard' };
}

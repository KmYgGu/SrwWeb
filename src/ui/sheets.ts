import { fighterOf, forecastStrike, type DefenseChoice } from '../core/exchange';
import { activeUnit, castable, envOf } from '../core/game';
import { SPIRITS } from '../core/spirits';
import type { SpiritId, Unit } from '../core/types';
import { saveSettings, settings } from './settings';
import { session } from './session';

/**
 * 아래에서 올라오는 선택창. 고르면 값을, 바깥을 누르면 null 을 돌려준다.
 * tall 은 유닛 정보까지 담는 큰 창(공격·방어 선택)에 쓴다.
 */
export function sheet<T>(
  title: string,
  build: (close: (v: T | null) => void, box: HTMLElement) => void,
  opts: { tall?: boolean } = {},
): Promise<T | null> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.innerHTML = `<div class="${opts.tall ? 'tall' : ''}"><h3>${title}</h3><div class="body"></div></div>`;
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

/**
 * 연출 켜기/끄기. 전투 연출(컷인 등)은 아직 없어서 어느 쪽을 골라도 꺼진 상태로 진행된다
 * (실제로 쓸지는 settings.ts 의 effectsEnabled 가 정한다).
 */
export function addEffectsToggle(box: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.className = 'fx';
  wrap.innerHTML = `<span>연출</span>
    <div class="toggle"><button data-fx="on">켜기</button><button data-fx="off">끄기</button></div>
    <p class="note">전투 연출(컷인 등)은 아직 준비 중이라 어느 쪽을 골라도 꺼진 상태로 진행됩니다.</p>`;
  const paint = () =>
    wrap.querySelectorAll<HTMLElement>('[data-fx]').forEach((b) => b.classList.toggle('sel', (b.dataset.fx === 'on') === settings.effects));
  wrap.querySelectorAll<HTMLElement>('[data-fx]').forEach((b) =>
    b.addEventListener('click', () => {
      settings.effects = b.dataset.fx === 'on';
      saveSettings();
      paint();
    }),
  );
  paint();
  box.appendChild(wrap);
}

export function strikeText(atk: Unit, def: Unit, wi: number, choice: DefenseChoice): string {
  const f = forecastStrike(envOf(session.game), fighterOf(atk), fighterOf(def), wi, choice);
  if (f.flash) return `명중 0% (섬광) · 예상 대응: ${f.reaction}`;
  return `명중 ${Math.round(f.hit * 100)}% · 피해 ${f.dmg} · 예상 대응: ${f.reaction}`;
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

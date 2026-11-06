import { ABILITIES } from '../core/abilities';
import { mapById } from '../core/maps';
import { PERSONALITIES } from '../core/personalities';
import { SPIRITS } from '../core/spirits';
import type { RosterEntry } from '../core/types';
import { saveSettings, settings } from './settings';

function card(title: string, r: RosterEntry, cls: 'me' | 'foe'): string {
  const u = r.unit;
  const p = r.pilot;
  const pers = PERSONALITIES[p.personality];
  const weapons = u.weapons
    .map((w) => {
      const tags = [w.isP ? 'P' : '', w.minMorale ? `기력 ${w.minMorale}↑` : ''].filter(Boolean).join(' · ');
      return `<li>${w.name} <small>위력 ${w.power} · 사거리 ${w.minRange}-${w.maxRange}${tags ? ' · ' + tags : ''}</small></li>`;
    })
    .join('');
  const spirits = p.spirits.map((id) => `${SPIRITS[id].name}(${SPIRITS[id].cost})`).join(' · ');
  const abilities = p.abilities.map((id) => ABILITIES[id].name).join(' · ');
  return `<div class="cfm ${cls}">
    <h3>${title}</h3>
    <b>${u.name} / ${p.name}</b>
    <small>HP ${u.hp} · EN ${u.en} · 장갑 ${u.armor} · 이동 ${u.move}${u.moveClass === 'air' ? ' (공중)' : ''}</small>
    <small>성격 ${pers.name} — ${pers.desc}</small>
    <small>능력: ${abilities}</small>
    <small>정신(SP ${p.sp}): ${spirits}</small>
    <ul>${weapons}</ul>
  </div>`;
}

/** 전투에 들어가기 전의 최종 선택 화면. 시작하면 onStart, 돌아가면 onBack. */
export function showConfirm(me: RosterEntry, foe: RosterEntry, mapId: string, onBack: () => void, onStart: () => void) {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="title">
      <h1>최종 확인</h1>
      <p>맵: ${mapById(mapId).name}</p>
      ${card('내 기체', me, 'me')}
      ${card('상대 기체', foe, 'foe')}
      <h2>연출</h2>
      <div class="toggle">
        <button data-fx="on" class="${settings.effects ? 'sel' : ''}">켜기</button>
        <button data-fx="off" class="${settings.effects ? '' : 'sel'}">끄기</button>
      </div>
      <p class="note">전투 연출(컷인 등)은 아직 준비 중이라 어느 쪽을 골라도 꺼진 상태로 진행됩니다.</p>
      <div class="row2">
        <button id="back">뒤로</button>
        <button class="primary" id="go">전투 시작</button>
      </div>
    </div>`;
  app.querySelectorAll<HTMLElement>('[data-fx]').forEach((b) =>
    b.addEventListener('click', () => {
      settings.effects = b.dataset.fx === 'on';
      saveSettings();
      showConfirm(me, foe, mapId, onBack, onStart);
    }),
  );
  document.getElementById('back')!.addEventListener('click', onBack);
  document.getElementById('go')!.addEventListener('click', onStart);
}

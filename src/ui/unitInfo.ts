/** 맵에서 유닛을 눌렀을 때 뜨는 정보 화면. 내 유닛이든 상대 유닛이든 같은 모양이다. */
import { ABILITIES } from '../core/abilities';
import { TERRAINS } from '../core/data';
import { PERSONALITIES } from '../core/personalities';
import { activeEffectLabels, SPIRITS } from '../core/spirits';
import type { TerrainId, Unit } from '../core/types';
import { sheet } from './sheets';
import { figure, gauge, spiritChips } from './unitView';

const GROUND_TERRAINS: TerrainId[] = ['plain', 'forest', 'mountain', 'city'];

function adaptText(u: Unit): string {
  if (u.def.moveClass === 'air') return `공중 ${u.def.adapt.air}`;
  return GROUND_TERRAINS.map((t) => `${TERRAINS[t].name} ${u.def.adapt[t]}`).join(' · ');
}

export function showUnitInfo(u: Unit): Promise<null> {
  const pers = PERSONALITIES[u.pilot.personality];
  const last = u.lastWeapon === null ? '없음' : u.def.weapons[u.lastWeapon].name;
  const abilities = u.pilot.abilities.map((id) => `<li><b>${ABILITIES[id].name}</b> <small>${ABILITIES[id].desc}</small></li>`).join('');
  const spirits = u.pilot.spirits
    .map((id) => {
      const d = SPIRITS[id];
      return `<li class="${u.used.includes(id) ? 'used' : ''}"><b>${d.name}</b> <small>SP ${d.cost}${u.used.includes(id) ? ' · 사용함' : ''} — ${d.desc}</small></li>`;
    })
    .join('');
  const weapons = u.def.weapons
    .map((w, i) => {
      const tags = [
        w.enCost ? `EN ${w.enCost}` : '',
        w.ammo !== null ? `탄 ${u.ammo[i]}/${w.ammo}` : '',
        w.isP ? 'P(이동 후 불가)' : '',
        w.minMorale ? `기력 ${w.minMorale}↑` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<li><b>${w.name}</b> <small>${w.kind === 'melee' ? '격투' : '사격'} · 위력 ${w.power} · 사거리 ${w.minRange}-${w.maxRange} · 명중 ${w.accuracy}${tags ? ' · ' + tags : ''}</small></li>`;
    })
    .join('');

  return sheet<null>(
    `${u.def.name} / ${u.pilot.name}`,
    (close, box) => {
      box.innerHTML = `
        ${figure(u)}
        <div class="info">
          ${gauge('hp', 'HP', u.hp, u.def.hp)}
          ${gauge('en', 'EN', u.en, u.def.en)}
          <small>기력 ${u.morale} · SP ${u.sp} · 최근 무기: ${last}</small>
          <div class="chips">${spiritChips(activeEffectLabels(u))}</div>
          <h4>기체</h4>
          <small>장갑 ${u.def.armor} · 운동성 ${u.def.mobility} · 이동 ${u.def.move}${u.def.moveClass === 'air' ? ' (공중)' : ''}</small>
          <small>지형 적응: ${adaptText(u)}</small>
          <h4>파일럿</h4>
          <small>격투 ${u.pilot.melee} · 사격 ${u.pilot.shoot} · 반응 ${u.pilot.react} · 방어 ${u.pilot.defense}</small>
          <small>성격 ${pers.name} — ${pers.desc}</small>
          <h4>특수 능력</h4><ul>${abilities}</ul>
          <h4>정신 커맨드</h4><ul>${spirits}</ul>
          <h4>무기</h4><ul>${weapons}</ul>
        </div>
        <div class="row2 sticky"><span></span><button class="primary" id="close">닫기</button></div>`;
      box.querySelector('#close')!.addEventListener('click', () => close(null));
    },
    { tall: true },
  );
}

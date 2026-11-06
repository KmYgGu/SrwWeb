/**
 * 성격과 기력.
 * 기력은 전투 중에만 변하는 수치다. 성격이 "어떤 일이 벌어졌을 때 얼마나 오르내리는가"를 정한다.
 * 수치는 슈퍼로봇대전 D 의 성격표를 따랐다. 1:1 이라 아군·적 격추 항목은 쓰지 않는다.
 *
 * 기력이 하는 일(모두 미세하게):
 *  - 명중: 양쪽 기력 차이 × hitPerPoint
 *  - 피해: 내 기력이 기준(100)보다 높은 만큼 × dmgPerPoint
 *  - 추격: 양쪽 기력 차이가 followGap 이상이면 공격하는 쪽이 한 번 더 공격(RULES.followGap)
 *  - 필살기: 무기의 minMorale 이상일 때만 쓸 수 있다
 */
import type { PersonalityId } from './types';

export const MORALE = {
  base: 100,
  min: 50,
  max: 150,
  /** 양쪽 기력 차이 1점당 명중률(%p) */
  hitPerPoint: 0.1,
  /** 기준보다 1점 높을 때마다 늘어나는 피해 비율 */
  dmgPerPoint: 0.002,
  /** 필살기를 쓰는 데 필요한 기력 */
  finisher: 120,
};

export const clampMorale = (v: number) => Math.min(MORALE.max, Math.max(MORALE.min, v));

export interface PersonalityDef {
  name: string;
  desc: string;
  /** 내 공격이 맞았을 때 */
  onHit: number;
  /** 내 공격이 빗나가거나 무효화됐을 때 */
  onMiss: number;
  /** 상대 공격을 피하거나 무효화했을 때 */
  onDodge: number;
  /** 상대 공격에 맞았을 때 */
  onDamaged: number;
}

export const PERSONALITIES: Record<PersonalityId, PersonalityDef> = {
  superBold: {
    name: '초강기',
    desc: '맞혀도 맞아도 크게 오르고, 빗나가면 크게 떨어진다. 근접전이 어울린다.',
    onHit: 2,
    onMiss: -2,
    onDodge: 0,
    onDamaged: 2,
  },
  bold: {
    name: '강기',
    desc: '무슨 일이든 안정적으로 오른다. 어떤 기체와도 무난하다.',
    onHit: 1,
    onMiss: -1,
    onDodge: 1,
    onDamaged: 1,
  },
  normal: {
    name: '보통',
    desc: '기력이 잘 오르지 않는다. 맞았을 때만 조금 오른다.',
    onHit: 0,
    onMiss: 0,
    onDodge: 0,
    onDamaged: 1,
  },
  cautious: {
    name: '신중',
    desc: '피할 때 가장 많이 오른다. 빗나가면 조금 떨어진다.',
    onHit: 1,
    onMiss: -1,
    onDodge: 2,
    onDamaged: 1,
  },
  cool: {
    name: '냉정',
    desc: '맞히고 피할 때 오르고, 맞으면 떨어진다. 맞히고 빠지는 운용이 어울린다.',
    onHit: 2,
    onMiss: -1,
    onDodge: 2,
    onDamaged: -1,
  },
};

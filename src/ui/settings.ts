/** 화면 설정. 브라우저에 저장하지만, 저장소를 못 쓰는 환경에서도 동작한다. */
const KEY = 'srw.settings';

export interface Settings {
  /** 전투 연출(컷인 등) 켜기 */
  effects: boolean;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { effects: Boolean(JSON.parse(raw).effects) };
  } catch {
    // 저장소를 못 쓰면 기본값으로 간다.
  }
  return { effects: false };
}

export const settings: Settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장은 편의일 뿐이라 실패해도 넘어간다.
  }
}

/** 전투 연출(컷인 등)은 아직 만들지 않았다. 만들고 나서 true 로 바꾸면 설정이 효력을 가진다. */
const EFFECTS_IMPLEMENTED = false;

/** 연출을 실제로 쓸지. 지금은 설정과 상관없이 항상 꺼져 있다. */
export const effectsEnabled = () => EFFECTS_IMPLEMENTED && settings.effects;

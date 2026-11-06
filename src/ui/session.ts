import type { GameState, Pos, Side } from '../core/types';

/** 사람이 조종하는 쪽과 AI 가 조종하는 쪽 */
export const ME = 0;
export const FOE = 1;

export interface Floater {
  x: number;
  y: number;
  text: string;
  t0: number;
  color: string;
}

/** 이동 연출. 규칙상 이동은 이미 끝난 일이고, 화면이 그 경로를 따라가며 보여주기만 한다. */
export interface MoveAnim {
  side: Side;
  path: Pos[];
  t0: number;
  dur: number;
}

/** 한 칸에 걸리는 시간. 길면 전체가 MAX 를 넘지 않게 빨라진다(어떤 거리든 1초 안에 도착). */
const MOVE_MS_PER_STEP = 110;
const MOVE_MS_MIN = 200;
const MOVE_MS_MAX = 900;
export const moveDuration = (steps: number) => Math.min(MOVE_MS_MAX, Math.max(MOVE_MS_MIN, steps * MOVE_MS_PER_STEP));

/** 화면 여러 모듈이 같이 보는 진행 상태 */
export const session = {
  game: null as unknown as GameState,
  /** 연출이나 AI 차례 중이라 입력을 받지 않는 동안 true */
  busy: false,
  floaters: [] as Floater[],
  anim: null as MoveAnim | null,
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

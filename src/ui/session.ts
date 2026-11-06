import type { GameState } from '../core/types';

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

/** 화면 여러 모듈이 같이 보는 진행 상태 */
export const session = {
  game: null as unknown as GameState,
  /** 연출이나 AI 차례 중이라 입력을 받지 않는 동안 true */
  busy: false,
  floaters: [] as Floater[],
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

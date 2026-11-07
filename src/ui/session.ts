import type { GameState, Pos, Side, SpiritId } from '../core/types';

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

/**
 * 조준선 연출. 공격하는 쪽에서 맞는 쪽으로 십자선이 날아가 도착하면 잠깐 멈춘다.
 * 이동 연출보다 빠르되(칸당 시간이 짧고 상한도 낮다) 눈에 보일 만큼은 걸린다.
 */
export interface AimAnim {
  from: Pos;
  to: Pos;
  side: Side;
  t0: number;
  travel: number;
  hold: number;
}

const AIM_MS_PER_TILE = 45;
const AIM_MS_MIN = 160;
const AIM_MS_MAX = 420;
export const AIM_HOLD_MS = 220;
/** 조준선이 도착한 뒤 결과 글자를 읽을 시간 */
export const AIM_RESULT_MS = 380;
export const aimTravel = (tiles: number) => Math.min(AIM_MS_MAX, Math.max(AIM_MS_MIN, tiles * AIM_MS_PER_TILE));

/** 화면 여러 모듈이 같이 보는 진행 상태 */
export const session = {
  game: null as unknown as GameState,
  /** 연출이나 AI 차례 중이라 입력을 받지 않는 동안 true */
  busy: false,
  floaters: [] as Floater[],
  anim: null as MoveAnim | null,
  aim: null as AimAnim | null,
  /** 지금 보여 주는 정신 커맨드 이펙트 */
  spiritFx: null as { side: Side; id: SpiritId; t0: number } | null,
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

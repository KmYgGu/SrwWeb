export type Side = 0 | 1;

export interface Pos {
  x: number;
  y: number;
}

export type TerrainId = 'plain' | 'forest' | 'mountain' | 'city' | 'sea';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type MoveClass = 'ground' | 'air';
/** 적응 등급을 매기는 키. 공중 유닛은 어느 지형 위에서도 'air' 하나만 본다. */
export type AdaptKey = TerrainId | 'air';
export type WeaponKind = 'melee' | 'shoot';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** 지상 유닛이 들어가는 데 드는 이동력 */
  cost: number;
  groundPass: boolean;
  /** 지상 유닛의 회피 보너스(%p) */
  eva: number;
  /** 지상 유닛의 장갑 보너스(비율) */
  armor: number;
  color: string;
}

export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  power: number;
  minRange: number;
  maxRange: number;
  accuracy: number;
  enCost: number;
  /** null 이면 탄수 제한 없음 */
  ammo: number | null;
  /** P무기: 이동한 뒤에는 공격할 수 없다(반격에는 쓸 수 있다) */
  isP: boolean;
}

export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  en: number;
  armor: number;
  /** 운동성. 100 이 기준, 높을수록 잘 피한다 */
  mobility: number;
  move: number;
  moveClass: MoveClass;
  adapt: Record<AdaptKey, Grade>;
  weapons: WeaponDef[];
}

export type AbilityId =
  | 'counter'
  | 'hitAway'
  | 'bunshin'
  | 'shield'
  | 'barrier'
  | 'sniper'
  | 'regen'
  | 'agile';

export type SpiritId =
  | 'sure'
  | 'flash'
  | 'fortitude'
  | 'ironwall'
  | 'focus'
  | 'spirit'
  | 'passion'
  | 'haste'
  | 'insight'
  | 'repair'
  | 'supply'
  | 'again';

export interface PilotDef {
  id: string;
  name: string;
  melee: number;
  shoot: number;
  /** 기량: 명중, 추격 판정 */
  skill: number;
  /** 반응: 회피 */
  react: number;
  defense: number;
  sp: number;
  spirits: SpiritId[];
  abilities: AbilityId[];
}

export interface RosterEntry {
  id: string;
  name: string;
  blurb: string;
  unit: UnitDef;
  pilot: PilotDef;
}

/** 정신 커맨드가 남기는 상태. 쓰이거나 때가 되면 사라진다. */
export interface Buffs {
  /** 다음 공격 필중 */
  sure: boolean;
  /** 다음 피격 1회 회피 */
  flash: boolean;
  /** 다음 피격 1회 피해 배율 */
  takenMul: number;
  /** 다음 공격 1회 피해 배율 */
  dealtMul: number;
  /** 내 다음 턴 시작까지 명중·회피 보너스 */
  focus: boolean;
  /** 다음 공격은 상대의 지형 회피 보너스를 무시 */
  pierce: boolean;
}

export interface Unit {
  side: Side;
  def: UnitDef;
  pilot: PilotDef;
  pos: Pos;
  hp: number;
  en: number;
  ammo: (number | null)[];
  sp: number;
  used: SpiritId[];
  buffs: Buffs;
}

export interface TurnState {
  side: Side;
  /** 이번 행동에서 공격 전에 이동했는가(P무기 판정) */
  movedBefore: boolean;
  acted: boolean;
  /** 공격 후 이동(히트&어웨이)을 이미 썼는가 */
  movedAfter: boolean;
  mpLeft: number;
}

export interface GameState {
  grid: TerrainId[][];
  units: [Unit, Unit];
  turn: TurnState;
  round: number;
  /** 마지막으로 공격이 오간 라운드. 교착이 길어지면 AI가 위험을 감수하게 만든다 */
  lastClash: number;
  winner: Side | 'draw' | null;
  rngState: number;
  log: string[];
}

export type Action =
  | { type: 'spirit'; id: SpiritId }
  | { type: 'move'; to: Pos }
  | { type: 'attack'; weapon: number }
  | { type: 'wait' };

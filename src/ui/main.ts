import './style.css';
import { leaveBattle, startBattle } from './battle';
import { session } from './session';
import { showTitle } from './title';

function toTitle() {
  leaveBattle();
  showTitle((me, foe, mapId) => startBattle(me, foe, mapId, toTitle));
}

toTitle();

// 개발 중에만 브라우저 콘솔에서 상태를 들여다볼 수 있게 한다(배포 빌드에는 들어가지 않는다).
if (import.meta.env.DEV) (window as unknown as { __srw: unknown }).__srw = { session };

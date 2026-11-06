import './style.css';
import { leaveBattle, startBattle } from './battle';
import { showConfirm } from './confirm';
import { session } from './session';
import { showTitle } from './title';

function toTitle() {
  leaveBattle();
  // 고른 뒤에는 바로 싸우지 않고 최종 확인 화면을 거친다. 돌아가면 방금 고른 선택이 그대로 남아 있다.
  showTitle((me, foe, mapId) =>
    showConfirm(me, foe, mapId, toTitle, () => startBattle(me, foe, mapId, toTitle)),
  );
}

toTitle();

// 개발 중에만 브라우저 콘솔에서 상태를 들여다볼 수 있게 한다(배포 빌드에는 들어가지 않는다).
if (import.meta.env.DEV) (window as unknown as { __srw: unknown }).__srw = { session };

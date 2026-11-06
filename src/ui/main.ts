import './style.css';
import { leaveBattle, startBattle } from './battle';
import { showTitle } from './title';

function toTitle() {
  leaveBattle();
  showTitle((me, foe, mapId) => startBattle(me, foe, mapId, toTitle));
}

toTitle();

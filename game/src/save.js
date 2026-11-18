// Save and load: money, mission progress, health and cars stolen survive a
// visit in this browser's localStorage. A corrupt or missing save starts fresh.
function loadSave() {
  try {
    var raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function saveGame(state) {
  try {
    var data = {
      money: state.player.money,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      health: Math.round(state.player.health),
      carsStolen: state.stats.carsStolen,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Storage can be off: nothing to clear.
  }
}

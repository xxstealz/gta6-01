// Missions and story: five jobs in order, each with a waypoint, a timer or an
// escape phase, plus two side activities (taxi fares and cash pickups) that pay
// between missions. Completing all five finishes the story.
function currentMission(state) {
  return MISSIONS[state.missionIndex] || null;
}

// Where the mission marker points right now (stages move the target).
function missionTarget(state, mission) {
  if (!mission) return null;
  if (mission.id === 'hot-wheels' && state.missionStage === 'deliver') return { x: 480, y: 480, label: 'Bengkel Ana' };
  if (mission.id === 'taxi-rush' && state.missionStage === 'drive') return { x: 1920, y: 480, label: 'Bandara Utara' };
  if (mission.id === 'last-escape' && state.escapeTimer >= mission.escapeSeconds) return mission.target;
  return mission.target;
}

function startMission(state, index) {
  var mission = MISSIONS[index];
  if (!mission) return;
  state.missionIndex = index;
  state.missionStage = 'go';
  state.missionTimer = mission.timer || 0;
  state.escapeTimer = 0;
  state.missionMessage = mission.brief;
  state.message = mission.title;
  state.messageTimer = 4;
  if (mission.id === 'last-escape') {
    addWanted(state, 3);
    spawnHostile(state, state.player.x + 300, state.player.y - 200);
    spawnHostile(state, state.player.x - 300, state.player.y + 200);
    spawnHostile(state, state.player.x + 100, state.player.y + 320);
  }
}

function completeMission(state) {
  var mission = currentMission(state);
  if (!mission) return;
  state.player.money += mission.reward;
  state.missionsDone += 1;
  state.audio.cash();
  state.audio.missionDone();
  state.message = 'Misi selesai! +$' + mission.reward;
  state.messageTimer = 4;
  state.missionStage = 'done';
  if (state.missionIndex + 1 >= MISSIONS.length) {
    state.screen = 'complete';
    state.audio.missionDone();
    return;
  }
  startMission(state, state.missionIndex + 1);
}

function updateMissions(state, dt) {
  var mission = currentMission(state);
  if (!mission || state.screen !== 'play') return;
  var player = state.player;
  var target = mission.target;
  var dist = distance(player.x, player.y, target.x, target.y);
  if (mission.timer) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      state.message = 'Waktu habis! Misi diulang dari awal.';
      state.messageTimer = 3;
      startMission(state, state.missionIndex);
      return;
    }
  }
  if (mission.id === 'last-escape') {
    state.escapeTimer += dt;
    if (state.escapeTimer >= mission.escapeSeconds && dist < 160) {
      completeMission(state);
      return;
    }
    if (state.escapeTimer < mission.escapeSeconds) {
      state.missionMessage = 'Bertahan dari polisi: ' + Math.ceil(mission.escapeSeconds - state.escapeTimer) + ' detik lagi, lalu ke Markas.';
      return;
    }
    state.missionMessage = 'Sekarang kabur ke Markas!';
  }
  if (mission.id === 'hot-wheels') {
    // Stage 1: reach the marina. Stage 2: steal the yellow sport car and drive it back.
    if (state.missionStage === 'go' && dist < 140) {
      state.missionStage = 'steal';
      state.missionMessage = 'Itu dia mobil sport kuningnya. Masuk dan bawa ke Bengkel Ana!';
      state.message = 'Curi mobil sport itu (E di dekat mobil)!';
      state.messageTimer = 3;
    }
    if (state.missionStage === 'steal' && state.playerCar && state.playerCar.kind === 'sport') {
      state.missionStage = 'deliver';
      state.missionMessage = 'Mobil didapat! Antar ke Bengkel Ana di barat.';
    }
    if (state.missionStage === 'deliver') {
      var garage = { x: 480, y: 480 };
      if (distance(player.x, player.y, garage.x, garage.y) < 150) completeMission(state);
      return;
    }
    return;
  }
  if (mission.id === 'taxi-rush') {
    if (state.missionStage === 'go' && dist < 140) {
      state.missionStage = 'drive';
      state.missionMessage = 'Penumpang naik! Antar ke Bandara Utara secepatnya.';
      state.message = 'Penumpang naik — gas ke bandara!';
      state.messageTimer = 3;
    }
    if (state.missionStage === 'drive') {
      var airport = { x: 1920, y: 480 };
      if (distance(player.x, player.y, airport.x, airport.y) < 150) {
        var tip = state.playerCar ? 60 : 0;
        state.player.money += tip;
        completeMission(state);
      }
      return;
    }
    return;
  }
  if (dist < 150) completeMission(state);
}

// Side activity: cash pickups scattered around the city pay $25 each.
function spawnCashPickups(state) {
  var spots = [
    { x: 720, y: 720 }, { x: 2400, y: 720 }, { x: 1200, y: 1920 }, { x: 2880, y: 1200 },
    { x: 960, y: 1440 }, { x: 3360, y: 1920 }, { x: 1680, y: 2400 }, { x: 2400, y: 2400 },
  ];
  for (var i = 0; i < spots.length; i += 1) {
    state.pickups.push({ x: spots[i].x, y: spots[i].y, kind: 'cash', amount: 25, bob: 0 });
  }
  state.pickups.push({ x: 480, y: 600, kind: 'health', amount: 40, bob: 0 });
  state.pickups.push({ x: 1920, y: 1560, kind: 'ammo', amount: 24, bob: 0 });
  state.pickups.push({ x: 3360, y: 600, kind: 'health', amount: 40, bob: 0 });
}

function updatePickups(state, dt) {
  for (var i = 0; i < state.pickups.length; i += 1) state.pickups[i].bob += dt * 3;
  state.pickups = state.pickups.filter(function (pickup) {
    if (distance(state.player.x, state.player.y, pickup.x, pickup.y) < 36) {
      if (pickup.kind === 'cash') {
        state.player.money += pickup.amount;
        state.message = '+$' + pickup.amount + ' uang jalanan!';
      } else if (pickup.kind === 'health') {
        state.player.health = Math.min(100, state.player.health + pickup.amount);
        state.message = 'Kesehatan +40';
      } else if (pickup.kind === 'ammo') {
        state.player.ammo += pickup.amount;
        state.message = 'Amunisi +' + pickup.amount;
      }
      state.messageTimer = 2;
      state.audio.pickup();
      return false;
    }
    return true;
  });
}

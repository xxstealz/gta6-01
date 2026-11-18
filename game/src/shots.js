// Screenshot staging behind ?shot=start|chase|mission|city (with &seed=N).
// Each scene plays the real game forward from a fresh world with a scripted
// driver, so the frame is what real play looks like and the same seed always
// gives the same frame. The loop keeps running after staging and the page sets
// window.__shotReady once the first 3D frame has rendered, so a screenshot
// tool knows the frame is done.
function scriptedDrive(state, seconds, steer) {
  var steps = Math.round(seconds / STEP);
  for (var i = 0; i < steps; i += 1) {
    state.input.held.up = true;
    state.input.held.left = steer < 0;
    state.input.held.right = steer > 0;
    state.update(STEP);
    state.input.held.up = false;
    state.input.held.left = false;
    state.input.held.right = false;
  }
}

function stageShot(name, state) {
  state.reset();
  if (name === 'chase') {
    // Wanted 3, Rico in the yellow sport car heading WEST through downtown
    // at dusk (sun setting ahead, towers and neon in frame), police closing
    // in, helicopter overhead with its searchlight.
    startMission(state, 4);
    state.screen = 'play';
    state.clockMinutes = 18 * 60 + 25;
    var sport = null;
    for (var i = 0; i < state.cars.length; i += 1) {
      if (state.cars[i].kind === 'sport' && state.cars[i].color === '#f1c40f') sport = state.cars[i];
    }
    if (sport) {
      sport.x = 2400;
      sport.y = 1200;
      sport.angle = Math.PI;
      sport.driver = 'player';
      state.playerCar = sport;
      state.player.x = sport.x;
      state.player.y = sport.y;
      state.camYaw = Math.PI;
    }
    for (var j = 0; j < 3; j += 1) spawnPoliceCar(state);
    scriptedDrive(state, 3.5, 0);
    // The scripted drive can clip a pedestrian; pin the wanted level back
    // to the 3 stars the chase is staged for.
    state.player.wanted = 3;
    state.wantedTimer = 0;
    // Re-stage the police as a flanking chase ahead of Rico: a cruiser that
    // rams from behind would hide the player's car from the camera.
    var fwdX = Math.cos(state.player.angle);
    var fwdY = Math.sin(state.player.angle);
    var cruisers = state.cars.filter(function (c) { return c.driver === 'police'; });
    for (var ci = 0; ci < cruisers.length; ci += 1) {
      // Offsets are in city-plane units (10 plane units = 1 3D unit): the
      // cruisers must sit several car-lengths ahead, not one.
      var side = ci === 0 ? -60 : ci === 1 ? 60 : 0;
      var ahead = ci === 2 ? 420 : 300;
      cruisers[ci].x = state.player.x + fwdX * ahead - fwdY * side;
      cruisers[ci].y = state.player.y + fwdY * ahead + fwdX * side;
      cruisers[ci].angle = Math.atan2(state.player.y - cruisers[ci].y, state.player.x - cruisers[ci].x);
      cruisers[ci].speed = 220;
    }
    if (state.world3d) state.world3d.shotCam = { dist: 19, height: 5.0, lookY: 1.3 };
    // Park the helicopter overhead-ahead of Rico so its searchlight is in
    // frame (during the scripted drive it lags far behind the car).
    if (state.heli) {
      state.heli.x = state.player.x - 60;
      state.heli.y = state.player.y - 300;
    }
    state.messageTimer = 0;
    return 'play';
  }
  if (name === 'mission') {
    // On foot on the north-south road, walking toward Ana's garage beacon,
    // mission 1, no police in the way — Rico, the beacon, traffic and
    // pedestrians all in frame. (Rico stands ON the road: inside a block a
    // building roof would hide him from the camera.)
    startMission(state, 0);
    state.screen = 'play';
    state.clockMinutes = 16 * 60 + 30;
    state.player.x = 720;
    state.player.y = 840;
    state.player.angle = Math.atan2(480 - 840, 480 - 720);
    state.camYaw = Math.atan2(480 - 840, 480 - 720);
    state.player.wanted = 0;
    state.messageTimer = 0;
    for (var k = 0; k < 120; k += 1) state.update(STEP);
    return 'play';
  }
  if (name === 'city') {
    // Golden-hour wide shot: Rico drives the taxi north up the downtown
    // boulevard, towers and neon ahead, beach behind.
    startMission(state, 2);
    state.screen = 'play';
    state.clockMinutes = 17 * 60 + 40;
    var taxi = null;
    for (var m = 0; m < state.cars.length; m += 1) {
      if (state.cars[m].kind === 'taxi') taxi = state.cars[m];
    }
    if (taxi) {
      taxi.x = 1680;
      taxi.y = 2400;
      taxi.angle = -Math.PI / 2;
      taxi.driver = 'player';
      state.playerCar = taxi;
      state.player.x = taxi.x;
      state.player.y = taxi.y;
      state.camYaw = -Math.PI / 2;
    }
    if (state.world3d) state.world3d.shotCam = { dist: 22, height: 13, lookY: 2 };
    scriptedDrive(state, 2, 0);
    // Keep the city shot clean: no wanted stars from the scripted drive.
    state.player.wanted = 0;
    state.wantedTimer = 0;
    state.messageTimer = 0;
    return 'play';
  }
  // Default: the title screen over a living city at golden hour. Simulate
  // with the screen on title so no mission can complete while the city wakes up.
  state.screen = 'title';
  state.clockMinutes = 17 * 60 + 10;
  for (var n = 0; n < 300; n += 1) state.update(STEP);
  state.screen = 'title';
  return 'title';
}

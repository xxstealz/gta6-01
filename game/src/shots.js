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
      // cruisers sit a few car-lengths ahead, close enough to read in a
      // low street-level frame instead of vanishing down the road.
      var side = ci === 0 ? -35 : ci === 1 ? 35 : 0;
      var ahead = ci === 2 ? 200 : 140;
      cruisers[ci].x = state.player.x + fwdX * ahead - fwdY * side;
      cruisers[ci].y = state.player.y + fwdY * ahead + fwdX * side;
      cruisers[ci].angle = Math.atan2(state.player.y - cruisers[ci].y, state.player.x - cruisers[ci].x);
      cruisers[ci].speed = 220;
    }
    // STREET-LEVEL chase cam: low (2.7) and close (10) behind the sport
    // car, looking slightly up — the yellow car fills the frame, cruisers
    // ahead, towers looming over the road, not a top-down road shot.
    if (state.world3d) state.world3d.shotCam = { dist: 10, height: 2.7, lookY: 2.1 };
    // Park the helicopter overhead-ahead of Rico so its searchlight is in
    // frame (during the scripted drive it lags far behind the car): ahead
    // and slightly to the side, high in the sky the low camera looks up at.
    if (state.heli) {
      state.heli.x = state.player.x - 260;
      state.heli.y = state.player.y - 40;
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
    // Stage a few pedestrians on the road around Rico so the mission frame
    // shows people next to buildings and cars: humanoid figures, not boxes.
    var nearSpots = [[760, 900], [690, 780], [800, 760], [660, 920], [740, 700]];
    for (var ns = 0; ns < nearSpots.length; ns += 1) {
      state.peds.push({
        x: nearSpots[ns][0], y: nearSpots[ns][1],
        angle: state.rng() * Math.PI * 2, speed: 40,
        color: PED_COLORS[ns % PED_COLORS.length],
        pants: ['#2c2c34', '#2c3e50', '#5d4037', '#34495e', '#7a6a53'][ns],
        skin: ['#e8b98a', '#c98d5f', '#8d5524', '#f2c9a0', '#d9a066'][ns],
        hair: ['#2c2018', '#111111', '#6b4423', '#b0b0b0', '#c0392b'][ns],
        hat: [null, 'cap', null, 'helmet', 'beanie'][ns],
        hatColor: ['#e74c3c', '#f1c40f', '#2e86c1', '#ffffff', '#27ae60'][ns],
        bag: ns % 2 === 0, bagColor: '#8e44ad',
        heightScale: 0.95 + ns * 0.03,
        targetX: 720, targetY: 480, fleeing: false, hostile: false,
        shootTimer: 0, health: 30, walkPhase: ns * 1.3,
      });
    }
    // STREET-LEVEL mission cam: very low (2.4) and close (6.5) behind Rico,
    // looking slightly up — Rico and the pedestrians are BIG, the beacon
    // and the towers rise above them.
    if (state.world3d) state.world3d.shotCam = { dist: 6.5, height: 2.4, lookY: 1.9 };
    for (var k = 0; k < 120; k += 1) state.update(STEP);
    return 'play';
  }
  if (name === 'city') {
    // Golden-hour street shot: Rico drives the taxi north up the downtown
    // boulevard, LOW camera close behind the taxi looking UP at the towers
    // and neon ahead — skyscrapers towering over the street, pedestrians on
    // the sidewalks in front of them, so the scale reads instantly.
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
    // Pedestrians on the sidewalks ahead of the taxi, in loud shirts, so
    // the frame shows people at the foot of the towers, not an empty road.
    // Sidewalk strips are narrow (road edge to building line): x 1738 on
    // the east side, 1620 on the west — any further out and the tower face
    // hides them from a low camera. Spots sit just ahead of where the taxi
    // ends up after the short drive, so the taxi never overtakes them.
    var citySpots = [[1738, 2150], [1620, 2080], [1738, 1980], [1620, 1900], [1738, 1830]];
    for (var cs = 0; cs < citySpots.length; cs += 1) {
      state.peds.push({
        x: citySpots[cs][0], y: citySpots[cs][1],
        angle: state.rng() * Math.PI * 2, speed: 40,
        color: PED_COLORS[cs % PED_COLORS.length],
        pants: ['#2c2c34', '#2c3e50', '#5d4037', '#34495e', '#7a6a53'][cs],
        skin: ['#e8b98a', '#c98d5f', '#8d5524', '#f2c9a0', '#d9a066'][cs],
        hair: ['#2c2018', '#111111', '#6b4423', '#b0b0b0', '#c0392b'][cs],
        hat: [null, 'cap', 'helmet', null, 'beanie'][cs],
        hatColor: ['#e74c3c', '#f1c40f', '#2e86c1', '#ffffff', '#27ae60'][cs],
        bag: cs % 2 === 0, bagColor: '#8e44ad',
        heightScale: 0.95 + cs * 0.03,
        targetX: citySpots[cs][0], targetY: citySpots[cs][1] - 200, fleeing: false, hostile: false,
        shootTimer: 0, health: 30, walkPhase: cs * 1.3,
      });
    }
    if (state.world3d) state.world3d.shotCam = { dist: 11, height: 3.0, lookY: 3.4 };
    // Short drive on purpose: a full 2 s drive at 100 km/h overtakes the
    // staged pedestrians and leaves the frame empty of people.
    scriptedDrive(state, 1.2, 0);
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

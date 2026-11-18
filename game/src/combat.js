// On-foot combat and car entry: punching, shooting in the camera's facing
// direction (third-person crosshair), and stealing or entering the nearest car
// with E. Shooting always faces the player toward the camera forward, the way
// a third-person shooter does.
function tryEnterCar(state) {
  var player = state.player;
  if (state.playerCar) {
    // Exit: step out beside the car and leave it parked.
    var car = state.playerCar;
    car.driver = 'parked';
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
    player.angle = car.angle;
    state.playerCar = null;
    return;
  }
  var found = nearestCar(state, player.x, player.y, 70);
  if (!found) return;
  if (found.driver === 'parked' && found.kind !== 'police') {
    // Stealing a parked car in view of the law raises wanted.
    if (state.player.wanted < 5 && state.cars.some(function (c) { return c.driver === 'police' && distance(c.x, c.y, player.x, player.y) < 700; })) {
      addWanted(state, WANTED.steal);
    } else if (state.missionIndex === 1) {
      addWanted(state, 1);
    }
    state.stats.carsStolen += 1;
    state.message = found.kind === 'sport' ? 'Mobil sport dicuri!' : 'Mobil dicuri — hati-hati polisi!';
    state.messageTimer = 2.5;
  }
  if (found.driver === 'traffic') {
    addWanted(state, WANTED.steal);
    state.stats.carsStolen += 1;
    state.message = 'Kamu membajak mobil di jalan! Wanted naik.';
    state.messageTimer = 2.5;
    scarePeds(state, found.x, found.y, 300);
  }
  found.driver = 'player';
  state.playerCar = found;
  player.x = found.x;
  player.y = found.y;
  player.angle = found.angle;
  state.audio.pickup();
}

function updatePlayerCombat(state, input, dt) {
  var player = state.player;
  player.punchTimer = Math.max(0, (player.punchTimer || 0) - dt);
  if (state.playerCar) return;
  if (input.consume('punch') && player.punchTimer <= 0) {
    player.punchTimer = PLAYER.punchCooldown;
    state.audio.punch();
    var reach = PLAYER.punchRange + 14;
    for (var i = 0; i < state.peds.length; i += 1) {
      if (distance(player.x, player.y, state.peds[i].x, state.peds[i].y) < reach) {
        state.peds[i].health -= PLAYER.punchDamage;
        spawnSparks(state, state.peds[i].x, state.peds[i].y, 4);
      }
    }
    for (var j = 0; j < state.cops.length; j += 1) {
      if (distance(player.x, player.y, state.cops[j].x, state.cops[j].y) < reach) {
        state.cops[j].health -= PLAYER.punchDamage;
        addWanted(state, 1);
      }
    }
  }
  if (input.mouse.clicked && player.ammo > 0) {
    // Consume the click at once: a slow frame can run several fixed steps,
    // and one click must fire exactly one bullet.
    input.mouse.clicked = false;
    // Aim where the camera looks: the crosshair in the middle of the screen.
    var angle = state.camYaw + Math.PI / 2;
    player.angle = angle;
    player.ammo -= 1;
    fireBullet(state, player.x, player.y, angle, 'player');
    // Muzzle flash at the gun's tip.
    spawnSparks(state, player.x + Math.cos(angle) * 26, player.y + Math.sin(angle) * 26, 8);
    state.audio.shot();
    state.wantedTimer = 0;
    if (state.player.wanted === 0) addWanted(state, WANTED.shoot);
    scarePeds(state, player.x, player.y, 320);
  }
}

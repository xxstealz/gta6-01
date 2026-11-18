// Wanted level and police: stars rise with crime and fall when the player lays
// low. Police cars spawn at the city edge, chase and ram; foot cops chase on
// foot and try to bust the player when they get close.
function addWanted(state, stars) {
  state.player.wanted = clamp(state.player.wanted + stars, 0, WANTED.maxStars);
  state.wantedTimer = 0;
}

function spawnPoliceCar(state) {
  var player = state.player;
  var angle = state.rng() * Math.PI * 2;
  var x = clamp(player.x + Math.cos(angle) * 900, 120, WORLD.width - 120);
  var y = clamp(player.y + Math.sin(angle) * 900, 120, WORLD.height - 120);
  var car = makeCar(state.rng, x, y, Math.atan2(player.y - y, player.x - x), 'police', '#2f6fd0');
  car.driver = 'police';
  car.maxSpeed = 620;
  state.cars.push(car);
  return car;
}

function spawnFootCop(state, x, y) {
  state.cops.push({
    x: x,
    y: y,
    angle: 0,
    speed: 150,
    health: 40,
    bustTimer: 0,
    walkPhase: 0,
  });
}

function updatePolice(state, dt) {
  var player = state.player;
  var wanted = player.wanted;
  // Police helicopter: from 3 stars up it hovers over the player with a searchlight.
  if (wanted >= 3) {
    if (!state.heli) state.heli = { x: player.x + 420, y: player.y - 420, rotor: 0 };
    var heli = state.heli;
    var tx = player.x + 90;
    var ty = player.y - 110;
    heli.x += (tx - heli.x) * Math.min(1, dt * 1.2);
    heli.y += (ty - heli.y) * Math.min(1, dt * 1.2);
    heli.rotor = (heli.rotor || 0) + dt * 30;
  } else if (state.heli) {
    state.heli = null;
  }
  var phase = timePhase(state.clockMinutes);
  var nightBoost = phase.name === 'night' ? 1.6 : 1;
  // Spawn pressure scales with stars: 1 star = 1 car, 5 stars = 4 cars + foot cops.
  var wantCars = wanted === 0 ? 0 : Math.min(4, wanted);
  var policeCars = state.cars.filter(function (c) { return c.driver === 'police'; });
  if (policeCars.length < wantCars && state.rng() < dt * 0.8 * nightBoost) spawnPoliceCar(state);
  if (wanted >= 2 && state.cops.length < wanted - 1 && state.rng() < dt * 0.5) {
    spawnFootCop(state, player.x + (state.rng() - 0.5) * 700, player.y + (state.rng() - 0.5) * 700);
  }
  for (var i = 0; i < policeCars.length; i += 1) {
    var car = policeCars[i];
    var targetX = state.playerCar ? state.playerCar.x : player.x;
    var targetY = state.playerCar ? state.playerCar.y : player.y;
    var wantAngle = Math.atan2(targetY - car.y, targetX - car.x);
    var turn = angleDifference(wantAngle, car.angle);
    car.angle += clamp(turn, -2.4 * dt, 2.4 * dt);
    var dist = distance(car.x, car.y, targetX, targetY);
    var targetSpeed = dist > 90 ? car.maxSpeed : 260;
    car.speed += clamp(targetSpeed - car.speed, -500 * dt, 420 * dt);
    car.wheelSpin += car.speed * dt * 0.05;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    // Ramming the player's car damages it; ramming the player hurts them.
    if (state.playerCar && dist < 52) {
      state.playerCar.health -= 22 * dt;
      state.playerCar.speed *= 1 - 0.4 * dt;
      if (state.rng() < dt * 2) state.audio.crash();
    }
    if (!state.playerCar && dist < 30) {
      player.health -= 18 * dt;
      state.message = 'Polisi menangkapmu! Lari!';
      state.messageTimer = 1.5;
    }
  }
  // Foot cops chase and, up close, hold the player: stand still too long and busted.
  for (var j = 0; j < state.cops.length; j += 1) {
    var cop = state.cops[j];
    var d = distance(cop.x, cop.y, player.x, player.y);
    if (state.playerCar) {
      cop.bustTimer = 0;
      continue;
    }
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    if (d > 26) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.walkPhase += dt * 7;
      cop.bustTimer = 0;
    } else {
      cop.bustTimer += dt;
      player.health -= 6 * dt;
      if (cop.bustTimer > 2.5) state.busted = true;
    }
  }
  state.cops = state.cops.filter(function (cop) { return cop.health > 0; });
  // Wanted decays only when no police car is near and no crime just happened.
  // At night the heat lingers longer.
  state.wantedTimer += dt;
  var nearestPolice = policeCars.reduce(function (m, c) { return Math.min(m, distance(c.x, c.y, player.x, player.y)); }, Infinity);
  var decayAfter = WANTED.decaySeconds * (phase.name === 'night' ? 1.5 : 1);
  if (wanted > 0 && state.wantedTimer > decayAfter && nearestPolice > 650) {
    player.wanted -= 1;
    state.wantedTimer = 0;
    state.message = 'Wanted turun — polisi kehilangan jejakmu.';
    state.messageTimer = 2.5;
  }
  // Police cars give up and despawn once the heat is off.
  if (wanted === 0) {
    state.cars = state.cars.filter(function (c) { return c.driver !== 'police' || distance(c.x, c.y, player.x, player.y) < 1200; });
    if (state.cops.length > 0 && state.rng() < dt) state.cops.pop();
  }
}

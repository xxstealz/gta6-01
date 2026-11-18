// Cars: player driving physics, parked cars to steal, and traffic that follows
// the road grid, keeps its lane, brakes for the car ahead and turns at junctions.
// Positions live on the city plane (x, y in 2D units); the 3D renderer maps
// them onto the street. angle 0 points east (+x), PI/2 points south (+y).
var nextCarId = 1;

function makeCar(random, x, y, angle, kind, color) {
  var car = {
    id: nextCarId,
    x: x,
    y: y,
    angle: angle,
    speed: 0,
    kind: kind || 'sedan',
    color: color || pick(random, CAR_COLORS),
    driver: 'parked',
    health: CAR.health,
    maxSpeed: kind === 'sport' ? CAR.maxSpeed * 1.25 : kind === 'truck' ? CAR.maxSpeed * 0.7 : CAR.maxSpeed,
    smoking: false,
    brakeLight: false,
    honkTimer: 0,
    wheelSpin: 0,
  };
  nextCarId += 1;
  return car;
}

function spawnParkedCars(state) {
  var random = state.rng;
  var spots = [
    { x: 3360, y: 430, kind: 'sport', color: '#f1c40f' },
    { x: 720, y: 430, kind: 'sedan', color: '#2e86c1' },
    { x: 1200, y: 910, kind: 'taxi', color: '#f1c40f' },
    { x: 2400, y: 1390, kind: 'van', color: '#ecf0f1' },
    { x: 2880, y: 1870, kind: 'sedan', color: '#c0392b' },
    { x: 960, y: 2350, kind: 'truck', color: '#27ae60' },
    { x: 1680, y: 430, kind: 'sedan', color: '#8e44ad' },
    { x: 3120, y: 2350, kind: 'sport', color: '#e74c3c' },
    { x: 2160, y: 910, kind: 'sedan', color: '#1abc9c' },
    { x: 480, y: 1390, kind: 'van', color: '#e67e22' },
  ];
  for (var i = 0; i < spots.length; i += 1) {
    var car = makeCar(random, spots[i].x, spots[i].y, Math.PI / 2, spots[i].kind, spots[i].color);
    car.driver = 'parked';
    state.cars.push(car);
  }
}

function spawnTraffic(state, count) {
  var random = state.rng;
  var xs = roadXs();
  var ys = roadYs();
  for (var i = 0; i < count; i += 1) {
    var horizontal = random() < 0.5;
    var x;
    var y;
    var angle;
    if (horizontal) {
      y = pick(random, ys);
      x = range(random, 200, WORLD.width - 200);
      angle = random() < 0.5 ? 0 : Math.PI;
    } else {
      x = pick(random, xs);
      y = range(random, 200, WORLD.height - 200);
      angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    var car = makeCar(random, x, y, angle, pick(random, ['sedan', 'sedan', 'taxi', 'van', 'truck']));
    car.driver = 'traffic';
    car.speed = range(random, 140, 220);
    car.axis = horizontal ? 'x' : 'y';
    car.road = horizontal ? y : x;
    car.dir = angle === 0 || angle === Math.PI / 2 ? 1 : -1;
    car.lane = 24;
    state.cars.push(car);
  }
}

// The player drives this car: arcade physics with steering that scales with
// speed, a handbrake for slides, and building collisions that damage the car.
function driveCar(car, input, dt, state) {
  var forward = input.held.up ? 1 : input.held.down ? -0.6 : 0;
  var steerInput = (input.held.left ? -1 : 0) + (input.held.right ? 1 : 0);
  if (forward > 0) car.speed += CAR.accel * dt;
  else if (forward < 0) car.speed -= CAR.reverseAccel * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 160 * dt);
  if (input.held.brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * dt);
    car.brakeLight = true;
  } else {
    car.brakeLight = false;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, car.maxSpeed);
  car.wheelSpin += car.speed * dt * 0.05;
  // Handbrake slides leave skid marks on the asphalt.
  if (input.held.brake && Math.abs(car.speed) > 180) {
    state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 5 });
    if (state.skids.length > 220) state.skids.shift();
  }
  // Exhaust smoke when the car pulls hard.
  if (forward > 0 && Math.abs(car.speed) > 150 && state.rng() < dt * 16) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * 34,
      y: car.y - Math.sin(car.angle) * 34,
      vx: -Math.cos(car.angle) * 40 + (state.rng() - 0.5) * 40,
      vy: -Math.sin(car.angle) * 40 + (state.rng() - 0.5) * 40,
      life: 0.5,
      maxLife: 0.5,
      color: '#9aa0a8',
      size: 5 + state.rng() * 3,
    });
  }
  var steerAmount = steerInput * CAR.steer * dt * clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steerAmount * (input.held.brake ? 1.35 : 1);
  var nextX = car.x + Math.cos(car.angle) * car.speed * dt;
  var nextY = car.y + Math.sin(car.angle) * car.speed * dt;
  var hit = hitsBuilding(state.city, nextX, nextY, 30);
  if (hit) {
    if (Math.abs(car.speed) > 120) {
      car.health -= Math.abs(car.speed) * 0.05;
      state.audio.crash();
      addShake(state, Math.min(10, Math.abs(car.speed) / 40));
      spawnSparks(state, nextX, nextY, 10);
    }
    car.speed *= -0.25;
  } else {
    car.x = clamp(nextX, 30, WORLD.width - 30);
    car.y = clamp(nextY, 30, WORLD.height - 30);
  }
  if (car.health < 35) car.smoking = true;
  if (car.health <= 0 && car.speed !== 0) car.speed *= 0.9;
  return car;
}

function carAhead(state, car, lookAhead) {
  var nearest = Infinity;
  for (var i = 0; i < state.cars.length; i += 1) {
    var other = state.cars[i];
    if (other === car || other.driver === 'parked') continue;
    var dx = other.x - car.x;
    var dy = other.y - car.y;
    var along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    var across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < lookAhead && across < 34 && along < nearest) nearest = along;
  }
  return nearest;
}

function updateTraffic(state, dt) {
  var random = state.rng;
  for (var i = 0; i < state.cars.length; i += 1) {
    var car = state.cars[i];
    if (car.driver !== 'traffic') continue;
    var gap = carAhead(state, car, 110);
    var targetSpeed = gap < 90 ? 0 : 190;
    car.speed += clamp(targetSpeed - car.speed, -300 * dt, 180 * dt);
    car.wheelSpin += car.speed * dt * 0.05;
    var nextX = car.x + Math.cos(car.angle) * car.speed * dt;
    var nextY = car.y + Math.sin(car.angle) * car.speed * dt;
    // At a junction, sometimes turn onto the cross road.
    var onJunction = isOnRoad(nextX, nextY) && Math.abs(nextX % 480 - 240) < 30 && Math.abs(nextY % 480 - 240) < 30;
    if (onJunction && random() < dt * 0.5) {
      car.angle += (random() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.axis = car.axis === 'x' ? 'y' : 'x';
    }
    if (hitsBuilding(state.city, nextX, nextY, 28)) {
      car.angle += Math.PI / 2;
      continue;
    }
    car.x = clamp(nextX, 40, WORLD.width - 40);
    car.y = clamp(nextY, 40, WORLD.height - 40);
    // Wrap around the far edge so traffic never runs out.
    if (car.x <= 45 || car.x >= WORLD.width - 45 || car.y <= 45 || car.y >= WORLD.height - 45) {
      car.angle += Math.PI;
    }
  }
}

function nearestCar(state, x, y, maxDist) {
  var best = null;
  var bestDist = maxDist;
  for (var i = 0; i < state.cars.length; i += 1) {
    var car = state.cars[i];
    if (car.driver === 'player') continue;
    var d = distance(x, y, car.x, car.y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function addShake(state, amount) {
  state.shake = Math.min(14, (state.shake || 0) + amount);
}

function spawnSparks(state, x, y, count) {
  for (var i = 0; i < count; i += 1) {
    state.particles.push({
      x: x,
      y: y,
      vx: (state.rng() - 0.5) * 260,
      vy: (state.rng() - 0.5) * 260,
      life: 0.4 + state.rng() * 0.3,
      maxLife: 0.7,
      color: '#ffd94d',
      size: 3 + state.rng() * 3,
    });
  }
}

function updateParticles(state, dt) {
  for (var i = 0; i < state.particles.length; i += 1) {
    var p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2 * dt;
    p.vy *= 1 - 2 * dt;
    p.life -= dt;
  }
  state.particles = state.particles.filter(function (p) { return p.life > 0; });
  for (var j = 0; j < state.skids.length; j += 1) state.skids[j].life -= dt;
  state.skids = state.skids.filter(function (s) { return s.life > 0; });
  state.shake = Math.max(0, (state.shake || 0) - dt * 26);
}

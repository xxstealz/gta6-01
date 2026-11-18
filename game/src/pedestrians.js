// Pedestrians: they stroll the sidewalks, cross at junctions, and run away
// from gunfire, speeding cars and police chases. A few are hostile shooters
// during the final escape mission. Each pedestrian also carries a walkPhase
// the 3D renderer uses to swing its legs.
function spawnPedestrians(state, count) {
  var random = state.rng;
  for (var i = 0; i < count; i += 1) {
    state.peds.push({
      x: range(random, 200, WORLD.width - 200),
      y: range(random, 200, WORLD.height - 200),
      angle: random() * Math.PI * 2,
      speed: range(random, 28, 55),
      color: pick(random, PED_COLORS),
      targetX: range(random, 200, WORLD.width - 200),
      targetY: range(random, 200, WORLD.height - 200),
      fleeing: false,
      hostile: false,
      shootTimer: 0,
      health: 30,
      walkPhase: random() * Math.PI * 2,
    });
  }
}

function spawnHostile(state, x, y) {
  state.peds.push({
    x: x,
    y: y,
    angle: 0,
    speed: 90,
    color: '#2c2c34',
    targetX: x,
    targetY: y,
    fleeing: false,
    hostile: true,
    shootTimer: 1 + state.rng(),
    health: 50,
    walkPhase: 0,
  });
}

function scarePeds(state, x, y, radius) {
  for (var i = 0; i < state.peds.length; i += 1) {
    var ped = state.peds[i];
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.fleeing = true;
      ped.targetX = ped.x + (ped.x - x) * 2;
      ped.targetY = ped.y + (ped.y - y) * 2;
    }
  }
}

function updatePedestrians(state, dt) {
  var player = state.player;
  for (var i = 0; i < state.peds.length; i += 1) {
    var ped = state.peds[i];
    if (ped.hostile) {
      // Hostile shooters chase the player and fire when close enough.
      var d = distance(ped.x, ped.y, player.x, player.y);
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      if (d > 220) {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        ped.walkPhase += dt * 8;
      }
      ped.shootTimer -= dt;
      if (ped.shootTimer <= 0 && d < 420) {
        ped.shootTimer = 1.1 + state.rng() * 0.7;
        fireBullet(state, ped.x, ped.y, ped.angle, 'hostile');
        state.audio.shot();
      }
      continue;
    }
    var danger = state.playerCar ? distance(ped.x, ped.y, state.playerCar.x, state.playerCar.y) : Infinity;
    if (danger < 130 && state.playerCar && Math.abs(state.playerCar.speed) > 120) {
      ped.fleeing = true;
      ped.targetX = ped.x + (ped.x - state.playerCar.x);
      ped.targetY = ped.y + (ped.y - state.playerCar.y);
    }
    var dTarget = distance(ped.x, ped.y, ped.targetX, ped.targetY);
    if (dTarget < 24 || ped.fleeing) {
      if (ped.fleeing && dTarget < 24) ped.fleeing = false;
      ped.targetX = range(state.rng, 200, WORLD.width - 200);
      ped.targetY = range(state.rng, 200, WORLD.height - 200);
    }
    var angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    var turn = angleDifference(angle, ped.angle);
    ped.angle += clamp(turn, -3 * dt, 3 * dt);
    var speed = ped.fleeing ? ped.speed * 2.6 : ped.speed;
    var nx = ped.x + Math.cos(ped.angle) * speed * dt;
    var ny = ped.y + Math.sin(ped.angle) * speed * dt;
    if (!hitsBuilding(state.city, nx, ny, 10)) {
      ped.x = nx;
      ped.y = ny;
      ped.walkPhase += dt * speed * 0.09;
    } else {
      ped.targetX = ped.x + (state.rng() - 0.5) * 400;
      ped.targetY = ped.y + (state.rng() - 0.5) * 400;
    }
    // A fast car that clips a pedestrian knocks them down and raises wanted.
    if (state.playerCar && Math.abs(state.playerCar.speed) > 200 && distance(ped.x, ped.y, state.playerCar.x, state.playerCar.y) < 30) {
      ped.health = 0;
      state.player.wanted = Math.min(5, state.player.wanted + 1);
      state.wantedTimer = 0;
      state.message = 'Pejalan kaki tertabrak! Wanted naik.';
      state.messageTimer = 2.5;
      state.audio.crash();
    }
  }
  state.peds = state.peds.filter(function (ped) { return ped.health > 0; });
}

function fireBullet(state, x, y, angle, owner) {
  state.bullets.push({
    x: x + Math.cos(angle) * 20,
    y: y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * 720,
    vy: Math.sin(angle) * 720,
    life: 0.9,
    owner: owner,
    angle: angle,
  });
}

function updateBullets(state, dt) {
  for (var i = 0; i < state.bullets.length; i += 1) {
    var bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.owner === 'player') {
      for (var j = 0; j < state.peds.length; j += 1) {
        var ped = state.peds[j];
        if (distance(bullet.x, bullet.y, ped.x, ped.y) < 16) {
          ped.health -= 25;
          bullet.life = 0;
          if (ped.hostile) state.player.money += 25;
        }
      }
      for (var k = 0; k < state.cops.length; k += 1) {
        var cop = state.cops[k];
        if (distance(bullet.x, bullet.y, cop.x, cop.y) < 16) {
          cop.health -= 25;
          bullet.life = 0;
          if (cop.health <= 0) state.player.wanted = Math.min(5, state.player.wanted + 2);
        }
      }
      for (var m = 0; m < state.cars.length; m += 1) {
        var car = state.cars[m];
        if (car.driver !== 'player' && distance(bullet.x, bullet.y, car.x, car.y) < 32) {
          car.health -= 20;
          bullet.life = 0;
        }
      }
    } else if (bullet.owner === 'hostile') {
      var player = state.player;
      if (distance(bullet.x, bullet.y, player.x, player.y) < 16 && !state.playerCar) {
        player.health -= 8;
        bullet.life = 0;
        state.audio.punch();
      }
      if (state.playerCar && distance(bullet.x, bullet.y, state.playerCar.x, state.playerCar.y) < 32) {
        state.playerCar.health -= 6;
        bullet.life = 0;
      }
    }
    if (hitsBuilding(state.city, bullet.x, bullet.y, 2)) bullet.life = 0;
  }
  state.bullets = state.bullets.filter(function (b) { return b.life > 0; });
}

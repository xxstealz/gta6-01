// Solmar Bay 3D — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the Three.js renderer paints what is
// there. Screens: title, play, paused, busted, wasted, complete.
// ?seed=N fixes the city. ?shot=start|chase|mission|city stages that scene
// instead of running the loop and sets window.__shotReady for a screenshot.
var params = new URLSearchParams(window.location.search);
var shot = params.get('shot');
var seedParam = Number.parseInt(params.get('seed') || '', 10);
var seed = Number.isInteger(seedParam) ? seedParam : 7;

var canvas = document.getElementById('game');
var status = document.getElementById('status');
var input = createInput();
var audio = createAudio();
var hud = createHud();

function createState() {
  var rng = createRandom(seed);
  var state = {
    rng: rng,
    seed: seed,
    time: 0,
    clockMinutes: DAY_START_MINUTES,
    screen: 'title',
    city: createCity(rng),
    player: {
      x: 720,
      y: 960,
      angle: 0,
      health: PLAYER.health,
      money: 0,
      wanted: 0,
      ammo: 48,
      weapon: 'pistol',
      ammoStock: { pistol: 48, shotgun: 0, rifle: 0 },
      fireTimer: 0,
      punchTimer: 0,
      walkPhase: 0,
    },
    playerCar: null,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    skids: [],
    heli: null,
    pickups: [],
    missionIndex: 0,
    missionStage: 'go',
    missionTimer: 0,
    escapeTimer: 0,
    missionMessage: '',
    message: '',
    messageTimer: 0,
    wantedTimer: 0,
    shake: 0,
    busted: false,
    hasSave: false,
    moving: false,
    camYaw: 0,
    camDragCooldown: 0,
    stats: { carsStolen: 0 },
    missionsDone: 0,
    audio: audio,
    input: input,
    world3d: null,
  };
  state.reset = function reset() {
    var fresh = createState();
    var key;
    for (key in fresh) {
      if (key !== 'reset' && key !== 'update' && key !== 'saveRequested' && key !== 'world3d') state[key] = fresh[key];
    }
    state.screen = 'play';
    spawnParkedCars(state);
    spawnTraffic(state, 24);
    spawnPedestrians(state, 36);
    spawnCashPickups(state);
  };
  state.saveRequested = function saveRequested() {
    if (saveGame(state)) {
      state.message = 'Game disimpan!';
      state.messageTimer = 2;
    }
  };
  state.update = function update(dt) {
    state.time += dt;
    state.clockMinutes = (state.clockMinutes + dt * CLOCK_RATE) % 1440;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.camDragCooldown = Math.max(0, state.camDragCooldown - dt);
    // Camera orbit from mouse drag.
    if (input.mouse.dragDX !== 0 || input.mouse.dragDY !== 0) {
      state.camYaw -= input.mouse.dragDX * 0.005;
      state.camDragCooldown = 1.5;
    }
    updateTraffic(state, dt);
    updatePedestrians(state, dt);
    updateBullets(state, dt);
    updateParticles(state, dt);
    updatePickups(state, dt);
    if (state.screen !== 'play') return;
    updateMissions(state, dt);
    updatePolice(state, dt);
    // The player: on foot or behind the wheel.
    if (state.playerCar) {
      driveCar(state.playerCar, input, dt, state);
      state.player.x = state.playerCar.x;
      state.player.y = state.playerCar.y;
      state.player.angle = state.playerCar.angle;
      state.moving = Math.abs(state.playerCar.speed) > 20;
      // While driving the camera settles behind the car unless the player
      // just dragged it somewhere else.
      if (state.camDragCooldown <= 0) {
        state.camYaw += angleDifference(state.playerCar.angle, state.camYaw) * Math.min(1, dt * 1.6);
      }
      if (state.playerCar.health <= 0) {
        state.message = 'Mobilmu hancur! Keluar dan cari mobil lain.';
        state.messageTimer = 3;
        state.playerCar.speed = 0;
      }
    } else {
      // On foot: WASD moves relative to the camera, like a third-person game.
      var speed = input.held.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      var fwd = (input.held.up ? 1 : 0) - (input.held.down ? 1 : 0);
      var str = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
      var fx = Math.cos(state.camYaw);
      var fy = Math.sin(state.camYaw);
      var rx = -Math.sin(state.camYaw);
      var ry = Math.cos(state.camYaw);
      var mx = fx * fwd + rx * str;
      var my = fy * fwd + ry * str;
      state.moving = mx !== 0 || my !== 0;
      if (state.moving) {
        var len = Math.hypot(mx, my);
        var moveAngle = Math.atan2(my / len, mx / len);
        var nx = state.player.x + (mx / len) * speed * dt;
        var ny = state.player.y + (my / len) * speed * dt;
        if (!hitsBuilding(state.city, nx, state.player.y, PLAYER.radius)) state.player.x = nx;
        if (!hitsBuilding(state.city, state.player.x, ny, PLAYER.radius)) state.player.y = ny;
        state.player.x = clamp(state.player.x, 20, WORLD.width - 20);
        state.player.y = clamp(state.player.y, 20, WORLD.height - 20);
        state.player.angle += angleDifference(moveAngle, state.player.angle) * Math.min(1, dt * 12);
        // The camera drifts behind the walking player unless just dragged.
        if (state.camDragCooldown <= 0) {
          state.camYaw += angleDifference(moveAngle, state.camYaw) * Math.min(1, dt * 1.1);
        }
      }
      updatePlayerCombat(state, input, dt);
    }
    if (input.consume('enter')) tryEnterCar(state);
    if (state.player.health <= 0) {
      state.screen = 'wasted';
      audio.busted();
    }
    if (state.busted) {
      state.screen = 'busted';
      state.player.money = Math.max(0, state.player.money - 200);
      state.player.wanted = 0;
      state.player.health = 100;
      state.busted = false;
      audio.busted();
    }
    audio.update(dt, state.playerCar ? Math.abs(state.playerCar.speed) : 0, state.player.wanted);
  };
  return state;
}

var state = createState();
state.reset();
state.screen = 'title';
var saved = loadSave();
state.hasSave = !!saved;
if (saved) {
  state.savedData = saved;
}

function applySave(data) {
  state.player.money = data.money || 0;
  state.missionsDone = data.missionsDone || 0;
  state.player.health = data.health || 100;
  state.stats.carsStolen = data.carsStolen || 0;
  state.missionIndex = Math.min(data.missionIndex || 0, 4);
  startMission(state, state.missionIndex);
}

function startGame(fromSave) {
  audio.ensure();
  hideOverlay(hud);
  if (fromSave && state.savedData) applySave(state.savedData);
  else if (state.screen === 'title') startMission(state, 0);
  state.screen = 'play';
  status.textContent = 'Bermain Solmar Bay.';
}

function showCurrentOverlay() {
  if (state.screen === 'title') {
    showOverlay(hud, state, function () { startGame(false); }, function () { startGame(true); }, function () { startGame(false); });
  } else if (state.screen === 'paused') {
    showOverlay(hud, state, function () {
      state.screen = 'play';
      hideOverlay(hud);
    }, null, function () { startGame(false); });
  } else {
    showOverlay(hud, state, function () {
      state.reset();
      state.screen = 'play';
      startMission(state, 0);
      hideOverlay(hud);
    }, null, function () {
      state.reset();
      state.screen = 'play';
      startMission(state, 0);
      hideOverlay(hud);
    });
  }
}

var world3d = null;
try {
  world3d = createWorld3D(canvas, state);
  state.world3d = world3d;
} catch (err) {
  status.textContent = 'WebGL tidak tersedia di browser ini: ' + err.message;
  window.__webglError = String(err && err.message ? err.message : err);
}

var frameState = { accumulator: 0, dt: STEP, last: 0 };

function frame(now) {
  if (!state.frozen && (state.screen === 'play' || state.screen === 'title')) {
    frameState.accumulator += Math.min(0.25, frameState.dt || STEP);
    while (frameState.accumulator >= STEP) {
      state.update(STEP);
      frameState.accumulator -= STEP;
    }
  }
  if (input.consume('pause') && (state.screen === 'play' || state.screen === 'paused')) {
    state.screen = state.screen === 'play' ? 'paused' : 'play';
    if (state.screen === 'paused') showCurrentOverlay();
    else hideOverlay(hud);
  }
  if (input.consume('mute')) audio.setMuted(!audio.muted);
  if ((state.screen === 'busted' || state.screen === 'wasted' || state.screen === 'complete') && state.overlayFor !== state.screen) {
    state.overlayFor = state.screen;
    showCurrentOverlay();
  }
  if (state.screen === 'play') state.overlayFor = null;
  if (world3d) updateWorld3D(world3d, state, STEP);
  drawMinimap(hud.minimap, state);
  updateHud(hud, state);
  input.endFrame();
  window.__shotReady = true;
  window.requestAnimationFrame(function (next) {
    frameState.dt = frameState.last ? Math.min(0.1, (next - frameState.last) / 1000) : STEP;
    frameState.last = next;
    frame(next);
  });
}

if (shot) {
  var stagedScreen = stageShot(shot, state);
  state.screen = stagedScreen;
  // Freeze the staged scene: the frame loop keeps rendering (so the camera
  // settles and WebGL stays warm) but the world no longer advances, so the
  // captured frame is the staged one no matter how slow the machine is.
  state.frozen = true;
  if (stagedScreen === 'title') showCurrentOverlay();
  else hideOverlay(hud);
  if (world3d) {
    // Snap the camera with a large dt so the first rendered frame already
    // frames the staged scene (headless rendering is slow; lerping would
    // leave the camera halfway from its spawn point).
    updateWorld3D(world3d, state, 5);
    drawMinimap(hud.minimap, state);
    updateHud(hud, state);
  }
  window.__shotReady = true;
  window.requestAnimationFrame(function (next) {
    frameState.last = next;
    frameState.dt = STEP;
    frame(next);
  });
} else {
  showCurrentOverlay();
  window.requestAnimationFrame(function (next) {
    frameState.last = next;
    frameState.dt = STEP;
    frame(next);
  });
}

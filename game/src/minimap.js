// The minimap: the whole city shrunk to a corner canvas, readable at a
// glance while driving. Dark land so light roads and blocks pop, the beach
// and marina as sand/water strips on the south and east edges, parks green,
// buildings as slate blocks, the mission waypoint as a big pulsing diamond
// with a dashed guide line from the player, police as blue squares with a
// white edge, the player as a yellow arrow with a facing cone, and weapon
// pickups as orange (shotgun) / cyan (rifle) diamonds. North is marked N.
function drawMinimap(canvas, state) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var scaleX = w / WORLD.width;
  var scaleY = h / WORLD.height;
  ctx.clearRect(0, 0, w, h);
  // Dark land: roads and blocks read by contrast, not by a flat green field.
  ctx.fillStyle = '#0e1a24';
  ctx.fillRect(0, 0, w, h);
  // Parks (green) and beach-row parks (sand).
  for (var pi = 0; pi < state.city.parks.length; pi += 1) {
    var park = state.city.parks[pi];
    ctx.fillStyle = park.sand ? '#e8cf9a' : '#2f7d32';
    ctx.fillRect(park.x * scaleX, park.y * scaleY, Math.max(2, park.w * scaleX), Math.max(2, park.h * scaleY));
  }
  // Buildings: solid slate blocks, clearly distinct from roads and land.
  ctx.fillStyle = '#6e7f92';
  for (var i = 0; i < state.city.buildings.length; i += 1) {
    var b = state.city.buildings[i];
    ctx.fillRect(b.x * scaleX, b.y * scaleY, Math.max(2, b.w * scaleX), Math.max(2, b.h * scaleY));
  }
  // Roads: wide light bands on the grid, so the street network reads first.
  ctx.fillStyle = '#c7ced6';
  var xs = roadXs();
  var ys = roadYs();
  for (var xi = 0; xi < xs.length; xi += 1) ctx.fillRect(xs[xi] * scaleX - 3.5, 0, 7, h);
  for (var yi = 0; yi < ys.length; yi += 1) ctx.fillRect(0, ys[yi] * scaleY - 3.5, w, 7);
  // Road centre dashes: one short yellow dash per block, for direction.
  ctx.fillStyle = '#e8d44d';
  for (var dxi = 0; dxi < xs.length; dxi += 1) {
    for (var dy = 480; dy < WORLD.height; dy += 480) ctx.fillRect(xs[dxi] * scaleX - 1, dy * scaleY - 3, 2, 6);
  }
  for (var dyi = 0; dyi < ys.length; dyi += 1) {
    for (var dx = 480; dx < WORLD.width; dx += 480) ctx.fillRect(dx * scaleX - 3, ys[dyi] * scaleY - 1, 6, 2);
  }
  // Beach sand along the south edge, ocean as a thin blue strip at the
  // bottom; marina water as a blue strip on the east edge.
  ctx.fillStyle = '#e8cf9a';
  ctx.fillRect(0, (WORLD.height - 150) * scaleY, w, h - (WORLD.height - 150) * scaleY);
  ctx.fillStyle = '#1e7fae';
  ctx.fillRect(0, h - 4, w, 4);
  ctx.fillRect(w - 4, 0, 4, h);
  // Weapon pickups: orange diamond = shotgun, cyan diamond = rifle.
  for (var wi = 0; wi < state.pickups.length; wi += 1) {
    var pickup = state.pickups[wi];
    if (pickup.kind !== 'weapon') continue;
    var wx = pickup.x * scaleX;
    var wy = pickup.y * scaleY;
    ctx.fillStyle = pickup.weapon === 'shotgun' ? '#ff6d00' : '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(wx, wy - 4);
    ctx.lineTo(wx + 4, wy);
    ctx.lineTo(wx, wy + 4);
    ctx.lineTo(wx - 4, wy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Traffic: small white dots. Player's car: yellow square.
  for (var j = 0; j < state.cars.length; j += 1) {
    var car = state.cars[j];
    var cx = car.x * scaleX;
    var cy = car.y * scaleY;
    if (car.driver === 'police') continue;
    if (car.driver === 'player') {
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 3, cy - 3, 6, 6);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
  }
  // Police: blue squares with a white edge (cars) and foot cops (smaller);
  // helicopter: a bigger blue circle with a white ring.
  for (var k = 0; k < state.cars.length; k += 1) {
    var pc = state.cars[k];
    if (pc.driver !== 'police') continue;
    ctx.fillStyle = '#4d8dff';
    ctx.fillRect(pc.x * scaleX - 3, pc.y * scaleY - 3, 6, 6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(pc.x * scaleX - 3, pc.y * scaleY - 3, 6, 6);
  }
  for (var m = 0; m < state.cops.length; m += 1) {
    ctx.fillStyle = '#4d8dff';
    ctx.fillRect(state.cops[m].x * scaleX - 2.5, state.cops[m].y * scaleY - 2.5, 5, 5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(state.cops[m].x * scaleX - 2.5, state.cops[m].y * scaleY - 2.5, 5, 5);
  }
  if (state.heli) {
    ctx.fillStyle = '#4d8dff';
    ctx.beginPath();
    ctx.arc(state.heli.x * scaleX, state.heli.y * scaleY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  var px = state.player.x * scaleX;
  var py = state.player.y * scaleY;
  // Mission waypoint: big pulsing diamond + dashed guide line from the
  // player, so the objective is visible without hunting for a dot.
  var mission = currentMission(state);
  if (mission && state.screen === 'play') {
    var target = missionTarget(state, mission);
    var tx = target.x * scaleX;
    var ty = target.y * scaleY;
    ctx.strokeStyle = 'rgba(255,217,77,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    var pulse = 6 + Math.sin(state.time * 5) * 1.5;
    ctx.strokeStyle = 'rgba(255,217,77,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, pulse + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(tx, ty - 8);
    ctx.lineTo(tx + 8, ty);
    ctx.lineTo(tx, ty + 8);
    ctx.lineTo(tx - 8, ty);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Player: a facing cone (where the camera looks) + a yellow arrow with a
  // white edge, pointing along camYaw. The cone is drawn first so the arrow
  // sits on top of it.
  var facing = state.camYaw || 0;
  ctx.fillStyle = 'rgba(255,217,77,0.28)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, 26, facing - 0.38, facing + 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(facing) * 9, py + Math.sin(facing) * 9);
  ctx.lineTo(px + Math.cos(facing + 2.5) * 6, py + Math.sin(facing + 2.5) * 6);
  ctx.lineTo(px + Math.cos(facing - 2.5) * 6, py + Math.sin(facing - 2.5) * 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // North marker, top-left, so the map orientation is never a guess.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('N ▲', 6, 5);
}

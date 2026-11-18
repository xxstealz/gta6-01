// The minimap: the whole city shrunk to a corner canvas — roads, the beach,
// buildings, the player (yellow), police (blue), traffic (white dots) and
// the mission waypoint (pulsing yellow), plus a camera-facing wedge.
function drawMinimap(canvas, state) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var scaleX = w / WORLD.width;
  var scaleY = h / WORLD.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20, 28, 38, 0.85)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5e9e52';
  ctx.fillRect(0, 0, w, h * 0.92);
  ctx.fillStyle = '#2f7fae';
  ctx.fillRect(0, h * 0.95, w, h * 0.05);
  ctx.fillStyle = '#3a3f46';
  for (var x = 240; x < WORLD.width; x += 480) ctx.fillRect(x * scaleX - 2, 0, 4, h);
  for (var y = 240; y < WORLD.height; y += 480) ctx.fillRect(0, y * scaleY - 2, w, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (var i = 0; i < state.city.buildings.length; i += 1) {
    var b = state.city.buildings[i];
    ctx.fillRect(b.x * scaleX, b.y * scaleY, Math.max(2, b.w * scaleX), Math.max(2, b.h * scaleY));
  }
  var mission = currentMission(state);
  if (mission && state.screen === 'play') {
    var target = missionTarget(state, mission);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(target.x * scaleX, target.y * scaleY, 5 + Math.sin(state.time * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (var j = 0; j < state.cars.length; j += 1) {
    var car = state.cars[j];
    ctx.fillStyle = car.driver === 'police' ? '#4d8dff' : car.driver === 'player' ? '#ffd94d' : 'rgba(255,255,255,0.8)';
    ctx.fillRect(car.x * scaleX - 2, car.y * scaleY - 2, 4, 4);
  }
  for (var k = 0; k < state.cops.length; k += 1) {
    ctx.fillStyle = '#4d8dff';
    ctx.fillRect(state.cops[k].x * scaleX - 2, state.cops[k].y * scaleY - 2, 4, 4);
  }
  // Player arrow pointing where the camera faces.
  var px = state.player.x * scaleX;
  var py = state.player.y * scaleY;
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

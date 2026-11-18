// Keyboard and mouse input: one object the whole game reads each frame.
// WASD/arrows move (relative to the third-person camera), Shift sprints,
// E enters/exits a car, Space handbrakes, F punches, mouse drag orbits the
// camera, a quick click shoots, M mutes, P/Esc pauses.
var ACTION = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  sprint: 'sprint',
  enter: 'enter',
  brake: 'brake',
  punch: 'punch',
  pause: 'pause',
  mute: 'mute',
};

var KEY_MAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'enter',
  Space: 'brake',
  KeyF: 'punch',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

function createInput() {
  var held = {};
  var pressed = {};
  var mouse = { x: 0, y: 0, down: false, clicked: false, dragDX: 0, dragDY: 0, downX: 0, downY: 0, downTime: 0, moved: 0 };
  var input = { held: held, pressed: pressed, mouse: mouse };

  function onKeyDown(event) {
    var action = KEY_MAP[event.code];
    if (!action) return;
    if (['up', 'down', 'left', 'right', 'brake'].indexOf(action) >= 0) event.preventDefault();
    if (!held[action]) pressed[action] = true;
    held[action] = true;
  }
  function onKeyUp(event) {
    var action = KEY_MAP[event.code];
    if (action) held[action] = false;
  }
  function onOverlay(event) {
    return !!(event.target && event.target.closest && event.target.closest('#overlay'));
  }
  function onMouseMove(event) {
    if (mouse.down) {
      var dx = event.clientX - mouse.x;
      var dy = event.clientY - mouse.y;
      mouse.dragDX += dx;
      mouse.dragDY += dy;
      mouse.moved += Math.abs(dx) + Math.abs(dy);
    }
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }
  function onMouseDown(event) {
    if (onOverlay(event)) return;
    if (event.button === 0) {
      mouse.down = true;
      mouse.downX = event.clientX;
      mouse.downY = event.clientY;
      mouse.downTime = Date.now();
      mouse.moved = 0;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }
  }
  function onMouseUp(event) {
    if (onOverlay(event)) { mouse.down = false; return; }
    if (event.button === 0) {
      mouse.down = false;
      // A quick press with almost no drag is a shot, not a camera orbit.
      if (mouse.moved < 8 && Date.now() - mouse.downTime < 400) mouse.clicked = true;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  input.endFrame = function endFrame() {
    var key;
    for (key in pressed) pressed[key] = false;
    mouse.clicked = false;
    mouse.dragDX = 0;
    mouse.dragDY = 0;
  };
  input.consume = function consume(action) {
    if (pressed[action]) {
      pressed[action] = false;
      return true;
    }
    return false;
  };
  return input;
}

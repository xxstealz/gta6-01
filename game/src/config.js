// Solmar Bay 3D — every tuning number, colour and story constant in one place.
// The game logic still lives on the 2D city plane (3840 x 2880 units); the
// renderer maps that plane into 3D by dividing by SCALE, so the missions,
// wanted system and traffic behave exactly like the city plan says.
// 1 world unit in 3D = 10 units on the city plane.
var SCALE = 10;
var STEP = 1 / 60;
var WORLD = { width: 3840, height: 2880 };
var ROAD_SPACING = 480;
var ROAD_WIDTH = 104;
var SAVE_KEY = 'solmar-bay.save.v2';

function worldX(x) { return (x - WORLD.width / 2) / SCALE; }
function worldZ(y) { return (y - WORLD.height / 2) / SCALE; }
function planeAngleToThree(angle) { return -angle; }

var PLAYER = {
  radius: 13,
  walkSpeed: 230,
  sprintSpeed: 360,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
};

var CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 6.5,
  health: 100,
};

var WANTED = {
  decaySeconds: 22,
  maxStars: 5,
  steal: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
};

var PALETTE = {
  skyDay: 0x87c5e8,
  skyDusk: 0xff9e5e,
  skyNight: 0x0d1b33,
  fogDay: 0xa8cfe0,
  fogDusk: 0xe8907a,
  fogNight: 0x0d1b33,
  grass: 0x6fae5e,
  sand: 0xe8cf9a,
  water: 0x1e7fae,
  waterDeep: 0x145a80,
  road: 0x33373d,
  lane: 0xe8d44d,
  sidewalk: 0xb9b3a4,
  buildingRoof: ['#c96f4a', '#d9a05b', '#7d8aa0', '#a8574e', '#5b7d6e', '#8a6f9e', '#b0785a', '#6e8cae'],
  facade: ['#e8b48a', '#f2d3a0', '#a8bdd0', '#d98a7a', '#9ec2a8', '#c2a8d8', '#e0a878', '#9ab8d8'],
  park: 0x5e9e52,
  tree: 0x3f7d3a,
  palm: 0x2e8b57,
  player: 0xf2c94c,
  police: 0x2f6fd0,
  taxi: 0xf2c94c,
  star: '#ffd94d',
  danger: '#e5534b',
};

var FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// The story: Rico Solano comes home to Solmar Bay owing the wrong people money.
// Five missions, each with a title, a briefing and a cash reward.
var MISSIONS = [
  {
    id: 'homecoming',
    title: 'Misi 1 — Pulang ke Solmar',
    brief: 'Rico pulang ke Solmar Bay. Temui Ana di bengkelnya di sudut barat kota.',
    target: { x: 480, y: 480, label: 'Bengkel Ana' },
    reward: 150,
  },
  {
    id: 'hot-wheels',
    title: 'Misi 2 — Mobil Panas',
    brief: 'Ana butuh mobil sport kuning di marina timur. Ambil mobilnya dan bawa ke bengkel. Polisi tidak suka pencurian.',
    target: { x: 3360, y: 480, label: 'Marina Timur' },
    reward: 300,
    stealCar: 'sport',
  },
  {
    id: 'beach-run',
    title: 'Misi 3 — Antar Paket',
    brief: 'Bawa paket ini ke kafe pantai selatan dalam 90 detik. Jangan sampai mobilmu hancur.',
    target: { x: 1920, y: 2640, label: 'Kafe Pantai' },
    reward: 400,
    timer: 90,
  },
  {
    id: 'taxi-rush',
    title: 'Misi 4 — Taksi Kilat',
    brief: 'Penumpang menunggu di hotel pusat kota. Jemput dia, antar ke bandara kecil di utara. Cepat = tip besar.',
    target: { x: 1920, y: 1440, label: 'Hotel Solmar' },
    reward: 350,
  },
  {
    id: 'last-escape',
    title: 'Misi 5 — Pelarian Terakhir',
    brief: 'Utang lunas, tapi polisi mengepung. Kabur dan bertahan 60 detik, lalu sembunyi di markas.',
    target: { x: 480, y: 2400, label: 'Markas' },
    reward: 800,
    escapeSeconds: 60,
  },
];

var CAR_COLORS = ['#c0392b', '#2e86c1', '#e67e22', '#27ae60', '#8e44ad', '#f1c40f', '#ecf0f1', '#1abc9c', '#e74c3c', '#34495e'];
var PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

// The day-night cycle: one game day lasts about 16 real minutes (1.5 game
// minutes a real second). Dusk is golden hour; at night the city lights up,
// headlights come on, police spawn faster and wanted decays slower.
var DAY_START_MINUTES = 17 * 60 + 10;
var CLOCK_RATE = 1.5;

function timePhase(minutes) {
  var m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 360 && m < 1050) return { name: 'day', label: 'Siang', darkness: 0 };
  if (m >= 1050 && m < 1170) return { name: 'dusk', label: 'Senja', darkness: 0.16 };
  return { name: 'night', label: 'Malam', darkness: 0.42 };
}

function formatClock(minutes) {
  var m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  var hh = String(Math.floor(m / 60)).padStart(2, '0');
  var mm = String(m % 60).padStart(2, '0');
  return hh + ':' + mm;
}

var NEON_SIGNS = [
  { text: 'SOLMAR', color: '#ff5fa2' },
  { text: 'CAFE LUNA', color: '#ffd94d' },
  { text: 'HOTEL', color: '#7fd0ff' },
  { text: 'DISCO', color: '#c98ae8' },
  { text: 'SURF', color: '#7dffc9' },
  { text: 'TAXI', color: '#ffb347' },
  { text: 'PIZZA', color: '#ff8a5c' },
  { text: 'NEON', color: '#8affff' },
];

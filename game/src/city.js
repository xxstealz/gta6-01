// Solmar Bay itself: a road grid, building blocks, parks, a beach on the south
// edge and a marina on the east edge. Everything is placed from the seeded RNG,
// so the same seed always builds the same city. The 3D renderer reads this
// plan and extrudes it: buildings become towers, parks become green blocks,
// the beach row becomes sand, the marina becomes water with boats.
function roadXs() {
  var xs = [];
  for (var x = ROAD_SPACING / 2; x < WORLD.width; x += ROAD_SPACING) xs.push(x);
  return xs;
}

function roadYs() {
  var ys = [];
  for (var y = ROAD_SPACING / 2; y < WORLD.height; y += ROAD_SPACING) ys.push(y);
  return ys;
}

function isOnRoad(x, y) {
  var xs = roadXs();
  var ys = roadYs();
  for (var i = 0; i < xs.length; i += 1) {
    if (Math.abs(x - xs[i]) < ROAD_WIDTH / 2 + 6) return true;
  }
  for (var j = 0; j < ys.length; j += 1) {
    if (Math.abs(y - ys[j]) < ROAD_WIDTH / 2 + 6) return true;
  }
  return false;
}

function nearestRoadPoint(x, y) {
  var bestX = x;
  var bestY = y;
  var best = Infinity;
  var xs = roadXs();
  var ys = roadYs();
  for (var i = 0; i < xs.length; i += 1) {
    var d = Math.abs(x - xs[i]);
    if (d < best) { best = d; bestX = xs[i]; bestY = y; }
  }
  for (var j = 0; j < ys.length; j += 1) {
    var d2 = Math.abs(y - ys[j]);
    if (d2 < best) { best = d2; bestX = x; bestY = ys[j]; }
  }
  return { x: bestX, y: bestY };
}

function createCity(random) {
  var buildings = [];
  var trees = [];
  var parks = [];
  var xs = roadXs();
  var ys = roadYs();
  // Blocks are the cells between roads. Downtown (centre blocks) gets towers;
  // the south row is beach, the east column is the marina.
  for (var i = 0; i < xs.length - 1; i += 1) {
    for (var j = 0; j < ys.length - 1; j += 1) {
      var x0 = xs[i] + ROAD_WIDTH / 2 + 14;
      var y0 = ys[j] + ROAD_WIDTH / 2 + 14;
      var x1 = xs[i + 1] - ROAD_WIDTH / 2 - 14;
      var y1 = ys[j + 1] - ROAD_WIDTH / 2 - 14;
      var centreX = (x0 + x1) / 2;
      var centreY = (y0 + y1) / 2;
      var distCentre = Math.hypot(centreX - WORLD.width / 2, centreY - WORLD.height / 2);
      var isDowntown = distCentre < 700;
      var isBeachRow = j === ys.length - 2;
      var roll = random();
      if (roll < 0.16 && !isDowntown) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        var treeCount = 5 + Math.floor(random() * 5);
        for (var t = 0; t < treeCount; t += 1) {
          trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: 10 + random() * 8 });
        }
        continue;
      }
      if (isBeachRow) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, sand: true });
        for (var t2 = 0; t2 < 3; t2 += 1) {
          trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: 12 + random() * 6, palm: true });
        }
        continue;
      }
      var count = isDowntown ? 2 : 3 + Math.floor(random() * 2);
      for (var b = 0; b < count; b += 1) {
        var bw = isDowntown ? range(random, 150, 200) : range(random, 110, 170);
        var bh = isDowntown ? range(random, 150, 200) : range(random, 100, 160);
        var bx = count === 1 ? centreX - bw / 2 : range(random, x0, x1 - bw);
        var by = count === 1 ? centreY - bh / 2 : range(random, y0, y1 - bh);
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          height: isDowntown ? 46 + random() * 42 : 14 + random() * 22,
          roof: pick(random, PALETTE.buildingRoof),
          facade: pick(random, PALETTE.facade),
          floors: isDowntown ? 8 + Math.floor(random() * 8) : 2 + Math.floor(random() * 3),
        });
      }
    }
  }
  // Landmarks the missions and the minimap name.
  var landmarks = [
    { x: 480, y: 480, label: 'Bengkel Ana', color: '#f2c94c' },
    { x: 1920, y: 1440, label: 'Hotel Solmar', color: '#7fb3e8' },
    { x: 3360, y: 480, label: 'Marina Timur', color: '#7fd0c0' },
    { x: 1920, y: 2640, label: 'Kafe Pantai', color: '#e89a7f' },
    { x: 480, y: 2400, label: 'Markas', color: '#c98ae8' },
    { x: 1920, y: 480, label: 'Bandara Utara', color: '#b8c4d0' },
  ];
  // Neon signs on the tallest downtown buildings, and palm trees along the beach.
  var signs = [];
  var towers = buildings.filter(function (b) { return b.height > 46; }).slice(0, NEON_SIGNS.length);
  towers.forEach(function (b, i) {
    signs.push({ x: b.x + b.w / 2, y: b.y - 10, text: NEON_SIGNS[i % NEON_SIGNS.length].text, color: NEON_SIGNS[i % NEON_SIGNS.length].color });
  });
  for (var x = 200; x < WORLD.width - 100; x += 260) {
    trees.push({ x: x + range(random, -30, 30), y: WORLD.height - 110, r: 11, palm: true });
  }
  return { buildings: buildings, trees: trees, parks: parks, landmarks: landmarks, signs: signs, beachY: WORLD.height - 150 };
}

// True when a circle of radius r at (x, y) overlaps any building.
function hitsBuilding(city, x, y, r) {
  for (var i = 0; i < city.buildings.length; i += 1) {
    var b = city.buildings[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

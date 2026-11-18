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
        // EXTREME height contrast so the skyline reads at a glance: downtown
        // mixes true skyscrapers (up to ~180, twice the old max) with low
        // shops, and the lowest buildings are still taller than a person.
        // Super-towers get a landmark silhouette: spire, dome or pyramid.
        var height;
        var roofType;
        if (isDowntown) {
          var tier = random();
          if (tier < 0.22) { height = 120 + random() * 60; roofType = pick(random, ['spire', 'dome', 'pyramid', 'stepped']); }
          else if (tier < 0.32) { height = 85 + random() * 35; roofType = random() < 0.5 ? 'flat' : 'stepped'; }
          else if (tier < 0.68) { height = 38 + random() * 30; roofType = random() < 0.5 ? 'sloped' : 'stepped'; }
          else { height = 22 + random() * 12; roofType = 'flat'; }
        } else {
          var tier2 = random();
          if (tier2 < 0.55) { height = 18 + random() * 10; roofType = 'flat'; }
          else if (tier2 < 0.9) { height = 28 + random() * 16; roofType = random() < 0.5 ? 'sloped' : 'stepped'; }
          else { height = 48 + random() * 22; roofType = 'stepped'; }
        }
        var isShop = height < 24;
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          height: height,
          roof: pick(random, PALETTE.buildingRoof),
          facade: pick(random, PALETTE.facade),
          floors: Math.max(1, Math.round(height / 7)),
          roofType: roofType,
          shop: isShop,
          shopColor: pick(random, ['#ff5fa2', '#ffd94d', '#7fd0ff', '#ff8a5c', '#7dffc9', '#c98ae8']),
          shopName: pick(random, ['TOKO', 'CAFE', 'PIZZA', 'SURF', 'BAR', 'MART', 'TACO', 'DISCO']),
          balconies: height >= 28 && height < 72 && random() < 0.7,
          waterTank: height > 55 && random() < 0.6,
          helipad: height > 100,
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
  // Street props, seeded so the same seed builds the same street: lamps
  // along every road, traffic lights at junctions, hydrants near corners,
  // benches and bins on sidewalks, planters by the parks.
  var props = [];
  for (var ri2 = 0; ri2 < xs.length; ri2 += 1) {
    for (var ry = 240; ry < WORLD.height - 100; ry += 480) {
      props.push({ kind: 'lamp', x: xs[ri2] + 62, y: ry + range(random, -140, 140) });
      props.push({ kind: 'lamp', x: xs[ri2] - 62, y: ry + 240 + range(random, -140, 140) });
      if (random() < 0.55) props.push({ kind: 'hydrant', x: xs[ri2] + 68, y: ry + 210 });
      if (random() < 0.5) props.push({ kind: 'bin', x: xs[ri2] - 68, y: ry + 90 });
      if (random() < 0.4) props.push({ kind: 'planter', x: xs[ri2] + 68, y: ry + 330 });
    }
  }
  for (var rj2 = 0; rj2 < ys.length; rj2 += 1) {
    for (var rx2 = 240; rx2 < WORLD.width - 100; rx2 += 480) {
      if (random() < 0.6) props.push({ kind: 'bench', x: rx2 + range(random, -120, 120), y: ys[rj2] + 66 });
      if (random() < 0.45) props.push({ kind: 'sign', x: rx2 + 180, y: ys[rj2] - 66 });
    }
  }
  for (var ji = 0; ji < xs.length; ji += 1) {
    for (var jj = 0; jj < ys.length; jj += 1) {
      props.push({ kind: 'trafficLight', x: xs[ji] + 62, y: ys[jj] + 62 });
    }
  }
  return { buildings: buildings, trees: trees, parks: parks, landmarks: landmarks, signs: signs, beachY: WORLD.height - 150, props: props };
}

// True when a circle of radius r at (x, y) overlaps any building.
function hitsBuilding(city, x, y, r) {
  for (var i = 0; i < city.buildings.length; i += 1) {
    var b = city.buildings[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

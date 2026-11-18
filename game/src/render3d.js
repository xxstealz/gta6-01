// Solmar Bay in 3D: the Three.js scene. The game logic lives on the 2D city
// plane; this file maps it into 3D (divide by SCALE), builds the city once
// from createCity's plan, and every frame syncs the cars, people, police,
// helicopter, bullets, particles and the mission beacon onto it. Camera is
// third-person, behind Rico on foot and behind the car while driving.
// No shadows (cheap fake blob shadows instead), one directional sun + one
// hemisphere light, fog for depth. All art is procedural: canvas textures
// painted here, no downloaded assets.
var R3 = null;

function makeCanvasTexture(w, h, draw) {
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  var tex = new THREE.CanvasTexture(canvas);
  // Canvas colours are authored in sRGB; without this the renderer treats
  // them as linear and washes every procedural texture out.
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(baseColor, floors) {
  return makeCanvasTexture(128, 256, function (ctx, w, h) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, w, 10);
    var cols = 4;
    var rows = Math.max(2, Math.min(12, floors));
    var cw = w / cols;
    var ch = (h - 16) / rows;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var lit = Math.random() < 0.28;
        ctx.fillStyle = lit ? '#ffd94d' : '#2a3550';
        ctx.fillRect(c * cw + cw * 0.22, 12 + r * ch + ch * 0.22, cw * 0.56, ch * 0.52);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c * cw + cw * 0.22, 12 + r * ch + ch * 0.22, cw * 0.56, 3);
      }
    }
  });
}

function neonTexture(text, color) {
  return makeCanvasTexture(256, 64, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function createWorld3D(canvas, state) {
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDay);
  scene.fog = new THREE.Fog(PALETTE.fogDay, 70, 260);

  // Gradient sky dome: a big sphere that follows the camera, so the horizon
  // is a soft sunset band instead of a hard flat colour.
  function skyTexture(top, mid, bottom) {
    return makeCanvasTexture(4, 256, function (ctx, w, h) {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, top);
      grad.addColorStop(0.55, mid);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
  }
  var skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 16, 12),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false })
  );
  var skyTex = {
    day: skyTexture('#3f8fd2', '#a8d4ee', '#ffe3b3'),
    dusk: skyTexture('#6a3a7a', '#ff8a3c', '#ffd9a0'),
    night: skyTexture('#050914', '#0d1b33', '#24365e'),
  };
  skyDome.material.map = skyTex.day;
  scene.add(skyDome);

  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

  var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffe0b0, 1.05);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(sun.target);
  var amb = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(amb);

  var api = {
    renderer: renderer,
    scene: scene,
    camera: camera,
    sun: sun,
    hemi: hemi,
    amb: amb,
    camPos: new THREE.Vector3(0, 8, 14),
    lookAt: new THREE.Vector3(0, 1, 0),
    facadeMats: [],
    carMeshes: new Map(),
    pedMeshes: new Map(),
    copMeshes: new Map(),
    bulletMeshes: [],
    particleMeshes: [],
    skidMeshes: [],
    pickupMeshes: new Map(),
    heliMesh: null,
    beacon: null,
    playerMesh: null,
    sunBall: null,
    clouds: [],
    ocean: null,
    foam: [],
    shotCam: null,
    time: 0,
    skyDome: skyDome,
    skyTex: skyTex,
  };

  // ---------- shared geometry and materials ----------
  var boxGeo = new THREE.BoxGeometry(1, 1, 1);
  var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  wheelGeo.rotateX(Math.PI / 2);
  var trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 5);
  var canopyGeo = new THREE.IcosahedronGeometry(1.0, 0);
  var palmTopGeo = new THREE.ConeGeometry(1.3, 2.0, 6);
  var shadowGeo = new THREE.CircleGeometry(1, 12);
  shadowGeo.rotateX(-Math.PI / 2);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });

  function box(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    return m;
  }
  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }
  function blobShadow(parent, radius) {
    var s = new THREE.Mesh(shadowGeo, shadowMat);
    s.scale.set(radius, 1, radius);
    s.position.y = 0.03;
    parent.add(s);
    return s;
  }
  api.blobShadow = blobShadow;

  // ---------- ground, roads, beach, ocean ----------
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 440), lambert(PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  var roadTex = makeCanvasTexture(64, 64, function (ctx) {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var i = 0; i < 40; i += 1) ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  var dashTex = makeCanvasTexture(16, 128, function (ctx) {
    ctx.clearRect(0, 0, 16, 128);
    ctx.fillStyle = '#e8d44d';
    ctx.fillRect(6, 10, 4, 52);
  });
  dashTex.wrapS = THREE.RepeatWrapping;
  dashTex.wrapT = THREE.RepeatWrapping;

  function roadStrip(cx, cz, len, horizontal) {
    var walk = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : 13.5, horizontal ? 13.5 : len), lambert(PALETTE.sidewalk));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(cx, 0.01, cz);
    scene.add(walk);
    var roadMat = new THREE.MeshLambertMaterial({ map: roadTex.clone() });
    roadMat.map.repeat.set(horizontal ? len / 24 : 1, horizontal ? 1 : len / 24);
    roadMat.map.needsUpdate = true;
    var road = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : ROAD_WIDTH / SCALE, horizontal ? ROAD_WIDTH / SCALE : len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(cx, 0.02, cz);
    scene.add(road);
    var dashMat = new THREE.MeshBasicMaterial({ map: dashTex.clone(), transparent: true });
    dashMat.map.repeat.set(horizontal ? Math.floor(len / 12) : 1, horizontal ? 1 : Math.floor(len / 12));
    dashMat.map.needsUpdate = true;
    var dash = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : 0.5, horizontal ? 0.5 : len), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(cx, 0.035, cz);
    scene.add(dash);
  }
  var xs = roadXs();
  var ys = roadYs();
  for (var ri = 0; ri < xs.length; ri += 1) roadStrip(worldX(xs[ri]), 0, WORLD.height / SCALE, false);
  for (var rj = 0; rj < ys.length; rj += 1) roadStrip(0, worldZ(ys[rj]), WORLD.width / SCALE, true);

  // Beach sand strip on the south edge, ocean beyond it.
  var sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width / SCALE + 40, 18), lambert(PALETTE.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.015, worldZ(WORLD.height) - 2);
  scene.add(sand);
  var oceanMat = new THREE.MeshLambertMaterial({ color: PALETTE.water });
  var ocean = new THREE.Mesh(new THREE.PlaneGeometry(560, 90), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.01, worldZ(WORLD.height) + 42);
  scene.add(ocean);
  api.ocean = ocean;
  for (var fi = 0; fi < 3; fi += 1) {
    var foam = new THREE.Mesh(new THREE.PlaneGeometry(500, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.04, worldZ(WORLD.height) + 4 + fi * 5);
    scene.add(foam);
    api.foam.push(foam);
  }

  // ---------- buildings, parks, trees, neon ----------
  var facadeCache = {};
  function facadeMat(base, floors) {
    var key = base + '|' + Math.min(12, floors);
    if (!facadeCache[key]) {
      var tex = facadeTexture(base, floors);
      facadeCache[key] = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    }
    return facadeCache[key];
  }
  api.facadeMats = facadeCache;

  var city = state.city;
  for (var bi = 0; bi < city.buildings.length; bi += 1) {
    var b = city.buildings[bi];
    var h3 = (b.height / SCALE) * 1.7;
    var bw = b.w / SCALE;
    var bd = b.h / SCALE;
    var cx = worldX(b.x + b.w / 2);
    var cz = worldZ(b.y + b.h / 2);
    var tower = new THREE.Mesh(boxGeo, facadeMat(b.facade, b.floors));
    tower.scale.set(bw, h3, bd);
    tower.position.set(cx, h3 / 2, cz);
    scene.add(tower);
    var roof = box(bw + 0.15, 0.25, bd + 0.15, lambert(new THREE.Color(b.roof).getHex()), cx, h3 + 0.12, cz);
    scene.add(roof);
    if (h3 > 9) {
      var antenna = box(0.12, 2.2, 0.12, lambert(0x888888), cx, h3 + 1.2, cz);
      scene.add(antenna);
      var tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      tip.position.set(cx, h3 + 2.4, cz);
      scene.add(tip);
    }
  }
  for (var pi = 0; pi < city.parks.length; pi += 1) {
    var park = city.parks[pi];
    var parkMesh = box(park.w / SCALE, 0.18, park.h / SCALE, lambert(park.sand ? PALETTE.sand : PALETTE.park), worldX(park.x + park.w / 2), 0.09, worldZ(park.y + park.h / 2));
    scene.add(parkMesh);
  }
  var trunkMat = lambert(0x7a5230);
  var leafMat = lambert(PALETTE.tree);
  var palmMat = lambert(PALETTE.palm);
  for (var ti = 0; ti < city.trees.length; ti += 1) {
    var tree = city.trees[ti];
    var tx = worldX(tree.x);
    var tz = worldZ(tree.y);
    var trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 0.8, tz);
    scene.add(trunk);
    if (tree.palm) {
      var top = new THREE.Mesh(palmTopGeo, palmMat);
      top.position.set(tx, 2.4, tz);
      scene.add(top);
      var frond = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.5, 6), palmMat);
      frond.position.set(tx, 1.9, tz);
      scene.add(frond);
    } else {
      var canopy = new THREE.Mesh(canopyGeo, leafMat);
      canopy.scale.set(1.1, 1.3, 1.1);
      canopy.position.set(tx, 2.3, tz);
      scene.add(canopy);
    }
  }
  // Beach umbrellas.
  var umbrellaColors = [0xff5fa2, 0xffd94d, 0x7fd0ff, 0xff8a5c];
  for (var ui = 0; ui < 8; ui += 1) {
    var ux = -160 + ui * 46 + (ui % 2) * 12;
    var uz = worldZ(WORLD.height) - 6;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5), lambert(0xffffff));
    pole.position.set(ux, 1.1, uz);
    scene.add(pole);
    var umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 8), lambert(umbrellaColors[ui % umbrellaColors.length]));
    umb.position.set(ux, 2.4, uz);
    scene.add(umb);
  }
  // Neon signs on downtown towers.
  for (var si = 0; si < city.signs.length; si += 1) {
    var sign = city.signs[si];
    var tex = neonTexture(sign.text, sign.color);
    var signMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    signMesh.position.set(worldX(sign.x), 11 + (si % 3) * 2, worldZ(sign.y) + 2.2);
    scene.add(signMesh);
  }
  // Marina boats on the east edge.
  for (var bo = 0; bo < 3; bo += 1) {
    var boat = new THREE.Group();
    var hull = box(5, 0.8, 1.6, lambert(0xecf0f1), 0, 0.4, 0);
    boat.add(hull);
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5), lambert(0x8a6f4d));
    mast.position.set(0, 2.2, 0);
    boat.add(mast);
    var sail = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    sail.position.set(0.9, 2.2, 0);
    boat.add(sail);
    boat.position.set(worldX(WORLD.width) + 8 + bo * 4, 0, -60 + bo * 55);
    boat.rotation.y = 0.4 * bo;
    scene.add(boat);
  }
  // Marina water strip on the east edge.
  var marina = new THREE.Mesh(new THREE.PlaneGeometry(26, WORLD.height / SCALE), new THREE.MeshLambertMaterial({ color: PALETTE.waterDeep }));
  marina.rotation.x = -Math.PI / 2;
  marina.position.set(worldX(WORLD.width) + 13, 0.01, 0);
  scene.add(marina);
  // Airport runway + parked plane at the north edge.
  var runway = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), lambert(0x2c3036));
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(worldX(1920), 0.03, worldZ(300));
  scene.add(runway);
  var plane = new THREE.Group();
  var fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 8), lambert(0xecf0f1));
  fus.rotation.z = Math.PI / 2;
  fus.position.y = 1.4;
  plane.add(fus);
  var wing = box(2.2, 0.18, 7.5, lambert(0x2e86c1), 0, 1.2, 0);
  plane.add(wing);
  var tail = box(0.2, 2.2, 2.4, lambert(0xc0392b), -4.4, 2.2, 0);
  plane.add(tail);
  plane.position.set(worldX(2100), 0, worldZ(300));
  scene.add(plane);

  // Sun ball + drifting clouds.
  var sunBall = new THREE.Mesh(new THREE.SphereGeometry(13, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false }));
  scene.add(sunBall);
  api.sunBall = sunBall;
  var cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (var ci = 0; ci < 9; ci += 1) {
    var cloud = new THREE.Group();
    for (var cj = 0; cj < 3; cj += 1) {
      var puff = new THREE.Mesh(new THREE.SphereGeometry(3 + cj, 8, 6), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(cj * 4 - 4, cj * 0.4, (cj % 2) * 2);
      cloud.add(puff);
    }
    cloud.position.set(-180 + ci * 42, 42 + (ci % 3) * 8, -110 + (ci % 4) * 55);
    scene.add(cloud);
    api.clouds.push(cloud);
  }

  // ---------- mission beacon ----------
  var beacon = new THREE.Group();
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 26, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 13;
  beacon.add(beam);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  beacon.add(ring);
  var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
  gem.position.y = 3.2;
  beacon.add(gem);
  beacon.userData.gem = gem;
  beacon.userData.ring = ring;
  scene.add(beacon);
  api.beacon = beacon;

  // ---------- character + car builders ----------
  function buildPerson(shirtColor, pantsColor, skinColor) {
    var g = new THREE.Group();
    var legL = box(0.26, 0.85, 0.3, lambert(pantsColor), -0.16, 0.43, 0);
    var legR = box(0.26, 0.85, 0.3, lambert(pantsColor), 0.16, 0.43, 0);
    legL.geometry = boxGeo;
    legR.geometry = boxGeo;
    var torso = box(0.72, 0.85, 0.42, lambert(shirtColor), 0, 1.28, 0);
    var armL = box(0.2, 0.75, 0.24, lambert(shirtColor), -0.48, 1.3, 0);
    var armR = box(0.2, 0.75, 0.24, lambert(shirtColor), 0.48, 1.3, 0);
    var head = box(0.42, 0.42, 0.4, lambert(skinColor), 0, 1.95, 0);
    var hair = box(0.46, 0.16, 0.44, lambert(0x2c2018), 0, 2.2, 0);
    var gun = box(0.5, 0.1, 0.12, lambert(0x222222), 0.48, 0.95, 0.18);
    g.add(legL);
    g.add(legR);
    g.add(torso);
    g.add(armL);
    g.add(armR);
    g.add(head);
    g.add(hair);
    g.add(gun);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.armL = armL;
    g.userData.armR = armR;
    legL.position.y = 0.43;
    legR.position.y = 0.43;
    blobShadow(g, 0.7);
    return g;
  }
  api.buildPerson = buildPerson;

  function buildCarMesh(car) {
    var g = new THREE.Group();
    var color = new THREE.Color(car.color).getHex();
    var isPolice = car.kind === 'police';
    var isSport = car.kind === 'sport';
    var isTruck = car.kind === 'truck' || car.kind === 'van';
    var bodyH = isSport ? 0.55 : isTruck ? 0.9 : 0.7;
    var bodyL = isTruck ? 5.2 : 4.6;
    var body = box(bodyL, bodyH, 2.0, new THREE.MeshLambertMaterial({ color: color }), 0, 0.55, 0);
    g.add(body);
    var cabinColor = isPolice ? 0xffffff : 0x1a2530;
    var cabin = box(isTruck ? 2.4 : 2.3, isTruck ? 0.9 : 0.55, 1.7, new THREE.MeshLambertMaterial({ color: cabinColor }), isTruck ? 0.9 : -0.3, bodyH + 0.28, 0);
    g.add(cabin);
    if (isPolice) {
      var stripe = box(bodyL * 0.9, 0.12, 2.02, lambert(0xffffff), 0, 0.62, 0);
      g.add(stripe);
      var barR = box(0.5, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.3, bodyH + 0.62, 0);
      var barB = box(0.5, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0x2244ff }), 0.3, bodyH + 0.62, 0);
      g.add(barR);
      g.add(barB);
      g.userData.barR = barR;
      g.userData.barB = barB;
    }
    if (car.kind === 'taxi') {
      var sign = box(0.7, 0.25, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd94d }), -0.3, bodyH + 0.68, 0);
      g.add(sign);
    }
    if (isSport) {
      var spoiler = box(0.18, 0.08, 1.9, lambert(0x222222), -2.2, 1.0, 0);
      g.add(spoiler);
    }
    var wheelPositions = [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]];
    var wheels = [];
    for (var wi = 0; wi < 4; wi += 1) {
      var wheel = new THREE.Mesh(wheelGeo, lambert(0x1a1a1a));
      wheel.position.set(wheelPositions[wi][0], 0.42, wheelPositions[wi][1]);
      g.add(wheel);
      wheels.push(wheel);
    }
    g.userData.wheels = wheels;
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    var headL = box(0.12, 0.18, 0.3, headMat, bodyL / 2 + 0.02, 0.6, 0.6);
    var headR = box(0.12, 0.18, 0.3, headMat, bodyL / 2 + 0.02, 0.6, -0.6);
    g.add(headL);
    g.add(headR);
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var tailL = box(0.12, 0.16, 0.3, tailMat, -bodyL / 2 - 0.02, 0.6, 0.6);
    var tailR = box(0.12, 0.16, 0.3, tailMat, -bodyL / 2 - 0.02, 0.6, -0.6);
    g.add(tailL);
    g.add(tailR);
    g.userData.tailMat = tailMat;
    // Headlight cones, only lit at night (cheap emissive cones, no spotlights).
    var coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.13, depthWrite: false });
    var coneGeo = new THREE.ConeGeometry(1.1, 7, 8, 1, true);
    coneGeo.rotateZ(Math.PI / 2);
    var coneL = new THREE.Mesh(coneGeo, coneMat);
    coneL.position.set(bodyL / 2 + 3.5, 0.55, 0.6);
    var coneR = new THREE.Mesh(coneGeo, coneMat);
    coneR.position.set(bodyL / 2 + 3.5, 0.55, -0.6);
    g.add(coneL);
    g.add(coneR);
    g.userData.coneMat = coneMat;
    blobShadow(g, 2.1);
    return g;
  }

  function buildHeli() {
    var g = new THREE.Group();
    var body = box(3.4, 1.2, 1.6, lambert(0x2f6fd0), 0, 0, 0);
    g.add(body);
    var glass = box(1.2, 0.8, 1.4, lambert(0x1a2530), 1.4, 0.1, 0);
    g.add(glass);
    var tail = box(3.2, 0.4, 0.4, lambert(0x2f6fd0), -3.0, 0.3, 0);
    g.add(tail);
    var rotor = box(7.5, 0.08, 0.4, lambert(0x222222), 0, 0.9, 0);
    g.add(rotor);
    g.userData.rotor = rotor;
    var light = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff8c0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    light.position.set(0, -8, 0);
    g.add(light);
    return g;
  }

  // Bullet / particle / skid pools.
  for (var bi2 = 0; bi2 < 24; bi2 += 1) {
    var bm = box(1.1, 0.08, 0.08, new THREE.MeshBasicMaterial({ color: 0xffe14d }), 0, -10, 0);
    bm.visible = false;
    scene.add(bm);
    api.bulletMeshes.push(bm);
  }
  for (var pi2 = 0; pi2 < 80; pi2 += 1) {
    var pm = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pm.visible = false;
    scene.add(pm);
    api.particleMeshes.push(pm);
  }
  for (var ski = 0; ski < 60; ski += 1) {
    var sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false }));
    sm.rotation.x = -Math.PI / 2;
    sm.visible = false;
    scene.add(sm);
    api.skidMeshes.push(sm);
  }

  api.buildCarMesh = buildCarMesh;
  api.buildHeli = buildHeli;
  R3 = api;
  return api;
}

// ---------- day / night ----------
function updateLighting(api, state) {
  var minutes = state.clockMinutes;
  var phase = timePhase(minutes);
  var day = new THREE.Color(PALETTE.skyDay);
  var dusk = new THREE.Color(PALETTE.skyDusk);
  var night = new THREE.Color(PALETTE.skyNight);
  var sky = new THREE.Color();
  var fogC = new THREE.Color();
  var sunI = 1.05;
  var hemiI = 0.75;
  var darkness = 0;
  if (phase.name === 'day') {
    var t = clamp((minutes - 360) / 690, 0, 1);
    sky.copy(day).lerp(dusk, Math.max(0, (t - 0.82) / 0.18));
    fogC.copy(new THREE.Color(PALETTE.fogDay)).lerp(new THREE.Color(PALETTE.fogDusk), Math.max(0, (t - 0.82) / 0.18));
    sunI = 1.05;
    darkness = 0;
  } else if (phase.name === 'dusk') {
    var td = clamp((minutes - 1050) / 120, 0, 1);
    sky.copy(dusk).lerp(night, td);
    fogC.copy(new THREE.Color(PALETTE.fogDusk)).lerp(new THREE.Color(PALETTE.fogNight), td);
    sunI = 1.0 - td * 0.7;
    darkness = td * 0.42;
  } else {
    sky.copy(night);
    fogC.copy(new THREE.Color(PALETTE.fogNight));
    sunI = 0.22;
    hemiI = 0.32;
    darkness = 0.42;
  }
  api.scene.background.copy(sky);
  api.scene.fog.color.copy(fogC);
  // Swap the sky gradient only when the phase changes; flagging needsUpdate
  // every frame would rebuild the shader program every frame.
  if (api.skyPhase !== phase.name) {
    api.skyPhase = phase.name;
    api.skyDome.material.map = api.skyTex[phase.name];
  }
  api.sun.intensity = sunI;
  api.hemi.intensity = hemiI;
  // Sun path: rises east, sets west, low and orange at dusk.
  var dayT = clamp((minutes - 360) / 720, 0, 1);
  var sunAngle = Math.PI * dayT;
  var sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle) * 0.9 + 0.12, 0.45);
  api.sun.position.copy(sunDir).multiplyScalar(120);
  api.sun.color.setHex(phase.name === 'dusk' ? 0xff9e5e : phase.name === 'night' ? 0x8fb0ff : 0xffe0b0);
  api.sunBall.position.copy(sunDir).multiplyScalar(320);
  api.sunBall.material.color.setHex(phase.name === 'dusk' ? 0xff7a3c : phase.name === 'night' ? 0xdfe8ff : 0xffdf8a);
  api.sunBall.visible = phase.name !== 'night';
  // Windows glow at night.
  for (var key in api.facadeMats) {
    api.facadeMats[key].emissiveIntensity = darkness * 1.1;
  }
  return darkness;
}

// ---------- per-frame sync ----------
function syncActor(api, map, list, builder, syncFn) {
  var seen = new Set();
  for (var i = 0; i < list.length; i += 1) {
    var obj = list[i];
    seen.add(obj);
    var mesh = map.get(obj);
    if (!mesh) {
      mesh = builder(obj);
      map.set(obj, mesh);
      api.scene.add(mesh);
    }
    mesh.visible = true;
    syncFn(mesh, obj);
  }
  map.forEach(function (mesh, obj) {
    if (!seen.has(obj)) mesh.visible = false;
  });
}

function placePerson(mesh, obj) {
  mesh.position.set(worldX(obj.x), 0, worldZ(obj.y));
  mesh.rotation.y = -obj.angle;
  var swing = Math.sin(obj.walkPhase || 0) * 0.55;
  mesh.userData.legL.rotation.x = swing;
  mesh.userData.legR.rotation.x = -swing;
  mesh.userData.armL.rotation.x = -swing * 0.8;
  mesh.userData.armR.rotation.x = swing * 0.8;
}

function updateWorld3D(api, state, dt) {
  api.time += dt;
  var darkness = updateLighting(api, state);

  // Player.
  if (!api.playerMesh) {
    api.playerMesh = api.buildPerson(0xf2c94c, 0x2c3e50, 0xe8b98a);
    api.scene.add(api.playerMesh);
  }
  var player = state.player;
  if (state.playerCar) {
    api.playerMesh.visible = false;
  } else {
    api.playerMesh.visible = true;
    player.walkPhase = (player.walkPhase || 0) + dt * (state.moving ? 11 : 0);
    placePerson(api.playerMesh, player);
  }

  // Cars.
  syncActor(api, api.carMeshes, state.cars, function (car) { return api.buildCarMesh(car); }, function (mesh, car) {
    mesh.position.set(worldX(car.x), 0, worldZ(car.y));
    mesh.rotation.y = -car.angle;
    mesh.rotation.z = car.smoking ? Math.sin(api.time * 9) * 0.02 : 0;
    var wheels = mesh.userData.wheels || [];
    for (var i = 0; i < wheels.length; i += 1) wheels[i].rotation.x = car.wheelSpin || 0;
    if (mesh.userData.barR && mesh.userData.barB) {
      var flash = Math.sin(api.time * 10) > 0;
      mesh.userData.barR.material.color.setHex(flash ? 0xff2222 : 0x550000);
      mesh.userData.barB.material.color.setHex(flash ? 0x111166 : 0x2244ff);
    }
    if (mesh.userData.tailMat) mesh.userData.tailMat.color.setHex(car.brakeLight ? 0xff5555 : 0xaa1111);
    if (mesh.userData.coneMat) mesh.userData.coneMat.opacity = darkness > 0.1 ? 0.14 : 0;
  });

  // Pedestrians and foot cops.
  syncActor(api, api.pedMeshes, state.peds, function (ped) {
    return api.buildPerson(new THREE.Color(ped.color).getHex(), 0x2c2c34, 0xe8b98a);
  }, placePerson);
  syncActor(api, api.copMeshes, state.cops, function () {
    return api.buildPerson(0x2f6fd0, 0x1a2530, 0xe8b98a);
  }, placePerson);

  // Helicopter.
  if (state.heli) {
    if (!api.heliMesh) {
      api.heliMesh = api.buildHeli();
      api.scene.add(api.heliMesh);
    }
    api.heliMesh.visible = true;
    api.heliMesh.position.set(worldX(state.heli.x), 19 + Math.sin(api.time * 2) * 0.8, worldZ(state.heli.y));
    api.heliMesh.rotation.y = -Math.atan2(player.y - state.heli.y, player.x - state.heli.x);
    api.heliMesh.userData.rotor.rotation.y = state.heli.rotor || 0;
  } else if (api.heliMesh) {
    api.heliMesh.visible = false;
  }

  // Mission beacon.
  var mission = currentMission(state);
  if (mission && state.screen === 'play') {
    var target = missionTarget(state, mission);
    api.beacon.visible = true;
    api.beacon.position.set(worldX(target.x), 0, worldZ(target.y));
    api.beacon.userData.gem.rotation.y = api.time * 2.4;
    api.beacon.userData.gem.position.y = 3.2 + Math.sin(api.time * 2.5) * 0.5;
    api.beacon.userData.ring.scale.setScalar(1 + Math.sin(api.time * 3) * 0.12);
  } else {
    api.beacon.visible = false;
  }

  // Pickups.
  syncActor(api, api.pickupMeshes, state.pickups, function (pickup) {
    var g = new THREE.Group();
    var color = pickup.kind === 'cash' ? 0xffd94d : pickup.kind === 'health' ? 0xffffff : 0x2ecc71;
    var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: color }));
    g.add(gem);
    if (pickup.kind === 'health') {
      var cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xe5534b }));
      g.add(cross);
    }
    api.blobShadow(g, 0.7);
    return g;
  }, function (mesh, pickup) {
    mesh.position.set(worldX(pickup.x), 1.1 + Math.sin(pickup.bob) * 0.25, worldZ(pickup.y));
    mesh.rotation.y = api.time * 1.8;
  });

  // Bullets.
  for (var bi = 0; bi < api.bulletMeshes.length; bi += 1) {
    var bm = api.bulletMeshes[bi];
    var bullet = state.bullets[bi];
    if (bullet) {
      bm.visible = true;
      bm.position.set(worldX(bullet.x), 1.25, worldZ(bullet.y));
      bm.rotation.y = -bullet.angle;
    } else {
      bm.visible = false;
    }
  }
  // Particles (smoke, sparks, muzzle flash).
  for (var pi = 0; pi < api.particleMeshes.length; pi += 1) {
    var pm = api.particleMeshes[pi];
    var p = state.particles[pi];
    if (p) {
      pm.visible = true;
      pm.position.set(worldX(p.x), 0.4 + (p.maxLife - p.life) * 1.2, worldZ(p.y));
      var s = (p.size / SCALE) * (0.5 + p.life / p.maxLife);
      pm.scale.set(s, s, s);
      pm.material.color.set(p.color);
    } else {
      pm.visible = false;
    }
  }
  // Skid marks.
  for (var si = 0; si < api.skidMeshes.length; si += 1) {
    var sm = api.skidMeshes[si];
    var skid = state.skids[si];
    if (skid) {
      sm.visible = true;
      sm.position.set(worldX(skid.x), 0.04, worldZ(skid.y));
      sm.rotation.z = skid.angle;
      sm.material.opacity = Math.min(0.55, skid.life * 0.12);
    } else {
      sm.visible = false;
    }
  }

  // Clouds drift, ocean foam slides.
  for (var ci = 0; ci < api.clouds.length; ci += 1) {
    api.clouds[ci].position.x += dt * 1.2;
    if (api.clouds[ci].position.x > 240) api.clouds[ci].position.x = -240;
  }
  for (var fi = 0; fi < api.foam.length; fi += 1) {
    api.foam[fi].position.z = worldZ(WORLD.height) + 4 + fi * 5 + Math.sin(api.time * 0.7 + fi * 2) * 1.2;
  }

  updateCamera3D(api, state, dt);
  api.skyDome.position.copy(api.camera.position);
  api.renderer.render(api.scene, api.camera);
}

function updateCamera3D(api, state, dt) {
  var canvas = api.renderer.domElement;
  var aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  if (api.camera.aspect !== aspect) {
    api.camera.aspect = aspect;
    api.camera.updateProjectionMatrix();
  }
  var target = state.playerCar || state.player;
  var tx = worldX(target.x);
  var tz = worldZ(target.y);
  var driving = !!state.playerCar;
  var dist = driving ? 13.5 : 9.5;
  var height = driving ? 5.2 : 4.4;
  var lookY = 1.3;
  if (api.shotCam) {
    dist = api.shotCam.dist;
    height = api.shotCam.height;
    lookY = api.shotCam.lookY || 1.3;
  }
  if (state.screen === 'title') {
    // Slow cinematic orbit over downtown for the title screen.
    var orbit = api.time * 0.07;
    var ox = Math.cos(orbit) * 55;
    var oz = Math.sin(orbit) * 42;
    api.camPos.lerp(new THREE.Vector3(ox, 34, oz), Math.min(1, dt * 1.2));
    api.lookAt.lerp(new THREE.Vector3(0, 2, 0), Math.min(1, dt * 1.2));
  } else {
    var yaw = state.camYaw;
    var fx = Math.cos(yaw);
    var fz = Math.sin(yaw);
    var desired = new THREE.Vector3(tx - fx * dist, height, tz - fz * dist);
    // Keep the camera inside the world.
    desired.x = clamp(desired.x, -190, 190);
    desired.z = clamp(desired.z, -150, 175);
    desired.y = Math.max(2.2, desired.y);
    var k = Math.min(1, dt * (driving ? 4.5 : 6));
    api.camPos.lerp(desired, k);
    api.lookAt.lerp(new THREE.Vector3(tx + fx * 4, lookY, tz + fz * 4), Math.min(1, dt * 7));
  }
  var shake = state.shake || 0;
  api.camera.position.copy(api.camPos);
  if (shake > 0.2) {
    api.camera.position.x += (Math.random() - 0.5) * shake * 0.06;
    api.camera.position.y += (Math.random() - 0.5) * shake * 0.06;
  }
  api.camera.lookAt(api.lookAt);
  if (api.renderer.domElement.width !== api.renderer.domElement.clientWidth * api.renderer.getPixelRatio() || api.renderer.domElement.height !== api.renderer.domElement.clientHeight * api.renderer.getPixelRatio()) {
    api.renderer.setSize(api.renderer.domElement.clientWidth, api.renderer.domElement.clientHeight, false);
  }
}

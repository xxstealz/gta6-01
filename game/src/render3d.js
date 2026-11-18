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

function facadeTexture(baseColor, floors, rng) {
  var rand = rng || Math.random;
  return makeCanvasTexture(128, 256, function (ctx, w, h) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical panel shading so flat faces read as architecture.
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (var p = 0; p < 4; p += 1) ctx.fillRect(p * (w / 4), 0, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 10, w, 3);
    // Facade windows: up to 20 rows now, so a super-tower reads as many
    // stacked floors instead of a few stretched window bands.
    var cols = 4;
    var rows = Math.max(2, Math.min(20, floors));
    var cw = w / cols;
    var ch = (h - 16) / rows;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var wx = c * cw + cw * 0.22;
        var wy = 12 + r * ch + ch * 0.22;
        var ww = cw * 0.56;
        var wh = ch * 0.52;
        // Window frame, then glass: lit warm, lit cool, or dark — never a
        // flat texture, so a facade reads as windows at a glance.
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        var roll = rand();
        var lit = roll < 0.22 ? '#ffd94d' : roll < 0.3 ? '#9fd8ff' : '#232c42';
        ctx.fillStyle = lit;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(wx, wy, ww, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      }
    }
    // Dark plinth at the base so the tower sits on the street, not floats.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, h - 12, w, 12);
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

  // Wide street-level lens (68 deg): at a low camera it makes towers loom
  // at the frame edges instead of shrinking them into the distance.
  var camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);

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

  // Texture randomness is seeded from the world seed, so the same seed
  // paints the same windows and asphalt every run (Math.random would not).
  var texRng = createRandom((state.seed || 7) * 7919 + 5);

  var roadTex = makeCanvasTexture(64, 64, function (ctx) {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var i = 0; i < 40; i += 1) ctx.fillRect(texRng() * 64, texRng() * 64, 2, 2);
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

  // Zebra crossings at every junction: one striped plane per crossing arm.
  var zebraTex = makeCanvasTexture(64, 64, function (ctx) {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f2f2f2';
    for (var zi = 0; zi < 5; zi += 1) ctx.fillRect(4 + zi * 12, 6, 7, 52);
  });
  for (var zxi = 0; zxi < xs.length; zxi += 1) {
    for (var zyj = 0; zyj < ys.length; zyj += 1) {
      var zebra = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 6), new THREE.MeshLambertMaterial({ map: zebraTex }));
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(worldX(xs[zxi]), 0.03, worldZ(ys[zyj]) - 7.5);
      scene.add(zebra);
      var zebra2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 10.5), new THREE.MeshLambertMaterial({ map: zebraTex }));
      zebra2.rotation.x = -Math.PI / 2;
      zebra2.rotation.z = Math.PI / 2;
      zebra2.position.set(worldX(xs[zxi]) - 7.5, 0.03, worldZ(ys[zyj]));
      scene.add(zebra2);
    }
  }

  // Street props from the city plan: hydrants, benches, lamps, traffic
  // lights, bins, planters and road signs along the sidewalks.
  var propCity = state.city;
  if (propCity.props) {
    var hydrantMat = lambert(0xe74c3c);
    var benchWood = lambert(0x8a6f4d);
    var poleMat = lambert(0x3a3f44);
    var lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    var binMat = lambert(0x2e6b34);
    for (var pri = 0; pri < propCity.props.length; pri += 1) {
      var prop = propCity.props[pri];
      var px = worldX(prop.x);
      var pz = worldZ(prop.y);
      if (prop.kind === 'hydrant') {
        var hyd = new THREE.Group();
        var hydBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.8, 8), hydrantMat);
        hydBody.position.y = 0.4;
        hyd.add(hydBody);
        var hydTop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), hydrantMat);
        hydTop.position.y = 0.85;
        hyd.add(hydTop);
        var hydCap = box(0.2, 0.2, 0.5, hydrantMat, 0, 0.45, 0);
        hyd.add(hydCap);
        hyd.position.set(px, 0, pz);
        scene.add(hyd);
      } else if (prop.kind === 'bench') {
        var bench = new THREE.Group();
        var seat = box(2.2, 0.12, 0.7, benchWood, 0, 0.55, 0);
        bench.add(seat);
        var back = box(2.2, 0.6, 0.1, benchWood, 0, 0.95, -0.32);
        bench.add(back);
        var legA = box(0.12, 0.55, 0.6, poleMat, -0.9, 0.28, 0);
        bench.add(legA);
        var legB = box(0.12, 0.55, 0.6, poleMat, 0.9, 0.28, 0);
        bench.add(legB);
        bench.position.set(px, 0, pz);
        bench.rotation.y = (pri % 4) * Math.PI / 2;
        scene.add(bench);
      } else if (prop.kind === 'lamp') {
        var lamp = new THREE.Group();
        var lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6), poleMat);
        lampPole.position.y = 2.3;
        lamp.add(lampPole);
        var lampArm = box(1.4, 0.1, 0.1, poleMat, 0.6, 4.55, 0);
        lamp.add(lampArm);
        var lampHead = box(0.5, 0.16, 0.28, lampHeadMat, 1.25, 4.5, 0);
        lamp.add(lampHead);
        lamp.position.set(px, 0, pz);
        lamp.rotation.y = (pri % 2) * Math.PI;
        scene.add(lamp);
      } else if (prop.kind === 'trafficLight') {
        var tl = new THREE.Group();
        var tlPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 6), poleMat);
        tlPole.position.y = 2.1;
        tl.add(tlPole);
        var tlBox = box(0.5, 1.4, 0.4, lambert(0x1a1a1a), 0.5, 3.9, 0);
        tl.add(tlBox);
        var tlColors = [0xff2222, 0xffd94d, 0x2ecc71];
        for (var tli = 0; tli < 3; tli += 1) {
          var tlLamp = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), new THREE.MeshBasicMaterial({ color: tlColors[tli] }));
          tlLamp.position.set(0.5, 4.35 - tli * 0.42, 0.21);
          tl.add(tlLamp);
        }
        tl.position.set(px, 0, pz);
        scene.add(tl);
      } else if (prop.kind === 'bin') {
        var bin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.9, 8), binMat);
        bin.position.set(px, 0.45, pz);
        scene.add(bin);
      } else if (prop.kind === 'planter') {
        var planter = box(1.4, 0.6, 1.4, lambert(0x9a7b5a), px, 0.3, pz);
        scene.add(planter);
        var bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), lambert(0x3f7d3a));
        bush.position.set(px, 1.0, pz);
        scene.add(bush);
      } else if (prop.kind === 'sign') {
        var signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), poleMat);
        signPole.position.set(px, 1.3, pz);
        scene.add(signPole);
        var signDisc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({ color: 0x2f6fd0, side: THREE.DoubleSide }));
        signDisc.position.set(px, 2.8, pz);
        scene.add(signDisc);
      }
    }
  }

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
    var key = base + '|' + Math.min(20, floors);
    if (!facadeCache[key]) {
      var tex = facadeTexture(base, floors, texRng);
      facadeCache[key] = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    }
    return facadeCache[key];
  }
  api.facadeMats = facadeCache;

  var city = state.city;
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });
  var darkGlassMat = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  var concreteMat = lambert(0x8a8f96);
  for (var bi = 0; bi < city.buildings.length; bi += 1) {
    var b = city.buildings[bi];
    // Buildings are extruded TALLER than the city plan says (x2.0): a tower
    // must tower over a person and over the street, not sit at eye level.
    var h3 = (b.height / SCALE) * 2.0;
    var bw = b.w / SCALE;
    var bd = b.h / SCALE;
    var cx = worldX(b.x + b.w / 2);
    var cz = worldZ(b.y + b.h / 2);
    var tower = new THREE.Mesh(boxGeo, facadeMat(b.facade, b.floors));
    tower.scale.set(bw, h3, bd);
    tower.position.set(cx, h3 / 2, cz);
    scene.add(tower);
    // Roofline that reads at a glance: flat slab + parapet, a tall pyramid,
    // stepped setbacks, a dome, or a spire that stabs the sky — never the
    // same silhouette twice, and the landmark roofs are BIG on purpose.
    if (b.roofType === 'sloped') {
      var pyramid = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.72, 3.6, 4), lambert(new THREE.Color(b.roof).getHex()));
      pyramid.scale.set(bw / Math.max(bw, bd), 1, bd / Math.max(bw, bd));
      pyramid.rotation.y = Math.PI / 4;
      pyramid.position.set(cx, h3 + 1.8, cz);
      scene.add(pyramid);
    } else if (b.roofType === 'pyramid') {
      var tallPyramid = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.72, 6.5, 4), lambert(new THREE.Color(b.roof).getHex()));
      tallPyramid.scale.set(bw / Math.max(bw, bd), 1, bd / Math.max(bw, bd));
      tallPyramid.rotation.y = Math.PI / 4;
      tallPyramid.position.set(cx, h3 + 3.25, cz);
      scene.add(tallPyramid);
    } else if (b.roofType === 'dome') {
      var dome = new THREE.Mesh(new THREE.SphereGeometry(Math.max(bw, bd) * 0.58, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(new THREE.Color(b.roof).getHex()));
      dome.scale.set(bw / Math.max(bw, bd), 0.75, bd / Math.max(bw, bd));
      dome.position.set(cx, h3, cz);
      scene.add(dome);
      var domeTip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
      domeTip.position.set(cx, h3 + Math.max(bw, bd) * 0.44 + 0.4, cz);
      scene.add(domeTip);
    } else if (b.roofType === 'spire') {
      var spireStep = box(bw * 0.6, 1.4, bd * 0.6, lambert(new THREE.Color(b.roof).getHex()), cx, h3 + 0.7, cz);
      scene.add(spireStep);
      var spire = box(0.5, 8.0, 0.5, lambert(0x888888), cx, h3 + 5.4, cz);
      scene.add(spire);
      var spireTip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      spireTip.position.set(cx, h3 + 9.6, cz);
      scene.add(spireTip);
    } else if (b.roofType === 'stepped') {
      var step1 = box(bw * 0.72, 1.1, bd * 0.72, lambert(new THREE.Color(b.roof).getHex()), cx, h3 + 0.55, cz);
      scene.add(step1);
      var step2 = box(bw * 0.45, 1.0, bd * 0.45, facadeMat(b.facade, Math.max(2, b.floors - 4)), cx, h3 + 1.6, cz);
      scene.add(step2);
    } else {
      var roof = box(bw + 0.15, 0.25, bd + 0.15, lambert(new THREE.Color(b.roof).getHex()), cx, h3 + 0.12, cz);
      scene.add(roof);
      // Parapet rim around a flat roof.
      var parapet = box(bw + 0.1, 0.5, 0.18, concreteMat, cx, h3 + 0.45, cz - bd / 2);
      scene.add(parapet);
      var parapet2 = box(bw + 0.1, 0.5, 0.18, concreteMat, cx, h3 + 0.45, cz + bd / 2);
      scene.add(parapet2);
    }
    // Rooftop detail: water tank, AC units, antenna on the tall ones.
    if (b.waterTank) {
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), lambert(0x9aa5ad));
      tank.position.set(cx + bw * 0.25, h3 + 0.9, cz - bd * 0.2);
      scene.add(tank);
      var tankTop = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 8), lambert(0x6e7f88));
      tankTop.position.set(cx + bw * 0.25, h3 + 2.0, cz - bd * 0.2);
      scene.add(tankTop);
    }
    if (h3 > 6) {
      var ac = box(0.9, 0.5, 0.7, lambert(0xb8bec4), cx - bw * 0.28, h3 + 0.45, cz + bd * 0.18);
      scene.add(ac);
      var ac2 = box(0.7, 0.45, 0.6, lambert(0x9aa5ad), cx + bw * 0.1, h3 + 0.4, cz - bd * 0.25);
      scene.add(ac2);
    }
    if (h3 > 12) {
      var antenna = box(0.14, 4.6, 0.14, lambert(0x888888), cx, h3 + 2.4, cz);
      scene.add(antenna);
      var tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      tip.position.set(cx, h3 + 4.8, cz);
      scene.add(tip);
    }
    if (b.helipad) {
      var pad = new THREE.Mesh(new THREE.CircleGeometry(Math.min(bw, bd) * 0.42, 16), lambert(0x2c3036));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, h3 + 0.26, cz);
      scene.add(pad);
    }
    // Tall towers get a real build, not a bare box: corner pilasters that
    // run the full height plus a glass lobby entrance with a canopy on the
    // street face, so the base reads as a building entrance.
    if (h3 > 7) {
      var pilasterMat = lambert(0x555b63);
      var pilOffsets = [[-bw / 2 + 0.15, -bd / 2 + 0.15], [bw / 2 - 0.15, -bd / 2 + 0.15], [-bw / 2 + 0.15, bd / 2 - 0.15], [bw / 2 - 0.15, bd / 2 - 0.15]];
      for (var pli = 0; pli < 4; pli += 1) {
        var pil = box(0.3, h3, 0.3, pilasterMat, cx + pilOffsets[pli][0], h3 / 2, cz + pilOffsets[pli][1]);
        scene.add(pil);
      }
      var lobbyGlass = box(bw * 0.4, 2.2, 0.18, glassMat, cx, 1.1, cz + bd / 2 + 0.06);
      scene.add(lobbyGlass);
      var lobbyCanopy = box(bw * 0.5, 0.14, 1.6, lambert(new THREE.Color(b.roof).getHex()), cx, 2.5, cz + bd / 2 + 0.8);
      scene.add(lobbyCanopy);
    }
    if (b.balconies) {
      var balconyFloors = Math.floor(h3 / 3);
      for (var bf = 1; bf < balconyFloors; bf += 2) {
        var by3 = bf * 3;
        if (by3 > h3 - 1.5) break;
        var balc = box(bw * 0.55, 0.18, 1.0, lambert(0xd8d3c8), cx, by3, cz + bd / 2 + 0.4);
        scene.add(balc);
        var rail = box(bw * 0.55, 0.7, 0.08, darkGlassMat, cx, by3 + 0.45, cz + bd / 2 + 0.85);
        scene.add(rail);
      }
    }
    // Ground-floor storefront on low buildings: glass front, door, striped
    // awning and a lit shop sign — the base never looks like a plain box.
    if (b.shop) {
      var front = cz + bd / 2;
      var shopGlass = box(bw * 0.86, 1.7, 0.15, glassMat, cx, 0.95, front + 0.06);
      scene.add(shopGlass);
      var door = box(1.2, 1.9, 0.18, darkGlassMat, cx - bw * 0.22, 0.95, front + 0.08);
      scene.add(door);
      var awning = box(bw * 0.9, 0.12, 1.4, lambert(new THREE.Color(b.shopColor).getHex()), cx, 2.15, front + 0.7);
      awning.rotation.x = 0.35;
      scene.add(awning);
      var shopTex = neonTexture(b.shopName || 'TOKO', b.shopColor);
      var shopSign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(9, bw * 0.7), 2.0), new THREE.MeshBasicMaterial({ map: shopTex, transparent: true, side: THREE.DoubleSide }));
      shopSign.position.set(cx, 3.4, front + 0.25);
      scene.add(shopSign);
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
  // Beach umbrellas, towels and a lifeguard tower.
  var umbrellaColors = [0xff5fa2, 0xffd94d, 0x7fd0ff, 0xff8a5c];
  for (var ui = 0; ui < 12; ui += 1) {
    var ux = -170 + ui * 31 + (ui % 2) * 10;
    var uz = worldZ(WORLD.height) - 6;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5), lambert(0xffffff));
    pole.position.set(ux, 1.1, uz);
    scene.add(pole);
    var umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 8), lambert(umbrellaColors[ui % umbrellaColors.length]));
    umb.position.set(ux, 2.4, uz);
    scene.add(umb);
    if (ui % 3 === 0) {
      var towel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.0), lambert(umbrellaColors[(ui + 1) % umbrellaColors.length]));
      towel.rotation.x = -Math.PI / 2;
      towel.position.set(ux + 2.6, 0.05, uz + 1.5);
      scene.add(towel);
    }
  }
  var lgTower = new THREE.Group();
  var lgLegA = box(0.18, 3.2, 0.18, lambert(0xffffff), -0.8, 1.6, 0);
  lgTower.add(lgLegA);
  var lgLegB = box(0.18, 3.2, 0.18, lambert(0xffffff), 0.8, 1.6, 0);
  lgTower.add(lgLegB);
  var lgCabin = box(2.4, 1.4, 2.0, lambert(0xff8a5c), 0, 3.6, 0);
  lgTower.add(lgCabin);
  var lgRoof = box(2.8, 0.18, 2.4, lambert(0xf2c94c), 0, 4.4, 0);
  lgTower.add(lgRoof);
  lgTower.position.set(60, 0, worldZ(WORLD.height) - 8);
  scene.add(lgTower);
  // Neon signs on downtown towers — hung high on the tall facades now that
  // the towers are much taller. Kept compact (12x3) so a sign never spans
  // past the frame edge and gets cut in half by the screen border.
  for (var si = 0; si < city.signs.length; si += 1) {
    var sign = city.signs[si];
    var tex = neonTexture(sign.text, sign.color);
    var signMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    signMesh.position.set(worldX(sign.x), 16 + (si % 3) * 3, worldZ(sign.y) + 2.2);
    scene.add(signMesh);
  }
  // Marina boats on the east edge: sailboats and a motorboat, plus wooden piers.
  var boatColors = [0xecf0f1, 0xffd94d, 0x7fd0ff, 0xff8a5c, 0xffffff];
  for (var bo = 0; bo < 5; bo += 1) {
    var boat = new THREE.Group();
    var hull = box(5, 0.8, 1.6, lambert(boatColors[bo % boatColors.length]), 0, 0.4, 0);
    boat.add(hull);
    if (bo === 4) {
      var motorCabin = box(1.8, 0.9, 1.3, darkGlassMat, 0.4, 1.2, 0);
      boat.add(motorCabin);
    } else {
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5), lambert(0x8a6f4d));
      mast.position.set(0, 2.2, 0);
      boat.add(mast);
      var sail = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      sail.position.set(0.9, 2.2, 0);
      boat.add(sail);
    }
    boat.position.set(worldX(WORLD.width) + 8 + (bo % 2) * 5, 0, -100 + bo * 48);
    boat.rotation.y = 0.4 * bo;
    scene.add(boat);
    var pier = box(1.6, 0.3, 14, lambert(0x8a6f4d), worldX(WORLD.width) + 2, 0.15, -100 + bo * 48);
    scene.add(pier);
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
  for (var ci = 0; ci < 12; ci += 1) {
    var cloud = new THREE.Group();
    for (var cj = 0; cj < 3; cj += 1) {
      var puff = new THREE.Mesh(new THREE.SphereGeometry(3 + cj, 8, 6), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(cj * 4 - 4, cj * 0.4, (cj % 2) * 2);
      cloud.add(puff);
    }
    cloud.position.set(-180 + ci * 32, 42 + (ci % 3) * 8, -110 + (ci % 4) * 55);
    scene.add(cloud);
    api.clouds.push(cloud);
  }
  // Birds: small dark V shapes circling over the beach and marina.
  api.birds = [];
  var birdMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
  for (var birdi = 0; birdi < 7; birdi += 1) {
    var bird = new THREE.Group();
    var wingL = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), birdMat);
    wingL.position.x = -0.55;
    bird.add(wingL);
    var wingR = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), birdMat);
    wingR.position.x = 0.55;
    bird.add(wingR);
    bird.userData.wingL = wingL;
    bird.userData.wingR = wingR;
    bird.userData.phase = birdi * 1.1;
    bird.position.set(-80 + birdi * 30, 26 + (birdi % 3) * 4, 60 - birdi * 22);
    scene.add(bird);
    api.birds.push(bird);
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
  // A person that reads as a person at a glance: round head with hair,
  // neck, tapered torso, separate cylindrical arms and legs pivoted at the
  // shoulder and hip so the walk swing is visible, shoes, and per-person
  // skin, hat and bag variety. Limbs are pivot groups, so placePerson
  // rotates the group (around the joint) instead of the mesh centre.
  function limbPivot(mat, radius, len, x, y) {
    var pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    var cylGeo = new THREE.CylinderGeometry(radius * 0.85, radius, len, 7);
    var mesh = new THREE.Mesh(cylGeo, mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    pivot.userData.mesh = mesh;
    return pivot;
  }
  function buildPerson(shirtColor, pantsColor, skinColor, opts) {
    var o = opts || {};
    var g = new THREE.Group();
    var shirtMat = lambert(shirtColor);
    var pantsMat = lambert(pantsColor);
    var skinMat = lambert(skinColor);
    var shoeMat = lambert(0x1a1a1a);
    var hairMat = lambert(o.hair || 0x2c2018);
    // Legs pivoted at the hip (y 0.85), with a shoe box at the foot.
    // Limbs are deliberately chunky (thick legs/arms, big round head) so a
    // person reads as a human at street distance, not a stick figure.
    var legL = limbPivot(pantsMat, 0.15, 0.85, -0.17, 0.85);
    var shoeL = box(0.26, 0.12, 0.44, shoeMat, 0, -0.85, 0.06);
    legL.add(shoeL);
    var legR = limbPivot(pantsMat, 0.15, 0.85, 0.17, 0.85);
    var shoeR = box(0.26, 0.12, 0.44, shoeMat, 0, -0.85, 0.06);
    legR.add(shoeR);
    // Torso: tapered cylinder (shoulders wider than waist) + belt.
    var torsoGeo = new THREE.CylinderGeometry(0.38, 0.30, 0.85, 8);
    var torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.scale.z = 0.62;
    torso.position.y = 1.28;
    g.add(torso);
    var belt = box(0.6, 0.09, 0.38, lambert(0x222222), 0, 0.88, 0);
    g.add(belt);
    // Arms pivoted at the shoulder (y 1.62), skin hand at the end.
    var armL = limbPivot(shirtMat, 0.12, 0.72, -0.48, 1.62);
    var handL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), skinMat);
    handL.position.y = -0.74;
    armL.add(handL);
    var armR = limbPivot(shirtMat, 0.12, 0.72, 0.48, 1.62);
    var handR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), skinMat);
    handR.position.y = -0.74;
    armR.add(handR);
    // Neck + BIG round head + hair cap.
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 6), skinMat);
    neck.position.y = 1.78;
    g.add(neck);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), skinMat);
    head.position.y = 2.05;
    g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 2.09;
    hair.scale.set(1, 0.9, 1);
    g.add(hair);
    // Eyes on the front of the head (+z is the face: cap brim and gun are
    // also +z) — two dark dots are the cheapest way a figure reads as a
    // person instead of a mannequin.
    var eyeMat = lambert(0x1a1a1a);
    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eyeL.position.set(-0.12, 2.08, 0.3);
    g.add(eyeL);
    var eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eyeR.position.set(0.12, 2.08, 0.3);
    g.add(eyeR);
    // Hat variety: cap (crown + brim), helmet (dome), beanie (band).
    if (o.hat === 'cap') {
      var capMat = lambert(o.hatColor || 0xe74c3c);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.16, 8), capMat);
      cap.position.y = 2.24;
      g.add(cap);
      var brim = box(0.3, 0.05, 0.34, capMat, 0, 2.18, 0.3);
      g.add(brim);
    } else if (o.hat === 'helmet') {
      var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lambert(o.hatColor || 0xf1c40f));
      helmet.position.y = 2.05;
      g.add(helmet);
    } else if (o.hat === 'beanie') {
      var beanie = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 8), lambert(o.hatColor || 0x2e86c1));
      beanie.position.y = 2.22;
      g.add(beanie);
    }
    // Backpack for some pedestrians.
    if (o.bag) {
      var bag = box(0.34, 0.45, 0.18, lambert(o.bagColor || 0x8e44ad), 0, 1.3, -0.3);
      g.add(bag);
    }
    // A gun only for armed people (cops, hostiles) — never on civilians.
    if (o.gun) {
      var gun = box(0.5, 0.1, 0.12, lambert(0x222222), 0.46, 0.95, 0.18);
      g.add(gun);
    }
    g.add(legL);
    g.add(legR);
    g.add(armL);
    g.add(armR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.armL = armL;
    g.userData.armR = armR;
    if (o.scale) g.scale.setScalar(o.scale);
    blobShadow(g, 0.7);
    return g;
  }
  api.buildPerson = buildPerson;

  // A car that reads as a car, and a different car per kind: glass cabin
  // with windshield, round headlights, grille, bumpers, mirrors, wheels
  // with hubcaps, and a distinct silhouette per kind (low sport with
  // spoiler, tall van, boxy truck with cargo, taxi with checkers).
  function buildCarMesh(car) {
    var g = new THREE.Group();
    var color = new THREE.Color(car.color).getHex();
    var isPolice = car.kind === 'police';
    var isSport = car.kind === 'sport';
    var isTruck = car.kind === 'truck';
    var isVan = car.kind === 'van';
    var bodyH = isSport ? 0.5 : isTruck ? 0.85 : isVan ? 0.95 : 0.65;
    var bodyL = isTruck ? 5.4 : isVan ? 5.0 : 4.6;
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x2a4a66 });
    var chromeMat = lambert(0xc8ccd0);
    var body = box(bodyL, bodyH, 2.0, bodyMat, 0, 0.55, 0);
    g.add(body);
    // Hood + trunk deck at slightly different heights so the body is not
    // one flat slab.
    var hood = box(1.1, 0.16, 1.9, bodyMat, bodyL / 2 - 0.55, 0.55 + bodyH / 2 + 0.05, 0);
    g.add(hood);
    var trunkDeck = box(0.9, 0.14, 1.9, bodyMat, -bodyL / 2 + 0.45, 0.55 + bodyH / 2 + 0.04, 0);
    g.add(trunkDeck);
    // Cabin: glasshouse with a slanted windshield plane and a roof.
    if (isTruck) {
      var cab = box(1.5, 1.1, 1.9, bodyMat, bodyL / 2 - 0.8, 1.35, 0);
      g.add(cab);
      var cabGlass = box(0.2, 0.7, 1.7, glassMat, bodyL / 2 - 0.05, 1.4, 0);
      g.add(cabGlass);
      var cargo = box(3.2, 1.7, 2.05, lambert(0xd8dce0), -1.0, 1.35, 0);
      g.add(cargo);
      var cargoRib = box(3.2, 0.12, 2.08, lambert(0x9aa5ad), -1.0, 1.9, 0);
      g.add(cargoRib);
    } else if (isVan) {
      var vanBody = box(bodyL * 0.72, 1.5, 1.95, bodyMat, -0.3, 1.25, 0);
      g.add(vanBody);
      var vanGlass = box(bodyL * 0.5, 0.55, 1.98, glassMat, -0.6, 1.55, 0);
      g.add(vanGlass);
      var vanShield = box(0.15, 0.7, 1.8, glassMat, bodyL / 2 - 0.45, 1.35, 0);
      vanShield.rotation.z = 0.35;
      g.add(vanShield);
    } else {
      var cabin = box(2.3, 0.55, 1.7, glassMat, -0.3, bodyH + 0.28, 0);
      g.add(cabin);
      var roofPanel = box(2.0, 0.1, 1.6, bodyMat, -0.3, bodyH + 0.6, 0);
      g.add(roofPanel);
      var windshield = box(0.12, 0.62, 1.65, glassMat, 0.88, bodyH + 0.28, 0);
      windshield.rotation.z = -0.5;
      g.add(windshield);
      var rearGlass = box(0.12, 0.55, 1.65, glassMat, -1.48, bodyH + 0.26, 0);
      rearGlass.rotation.z = 0.45;
      g.add(rearGlass);
    }
    if (isPolice) {
      var stripe = box(bodyL * 0.9, 0.12, 2.02, lambert(0xffffff), 0, 0.62, 0);
      g.add(stripe);
      var barR = box(0.5, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.3, bodyH + 0.72, 0);
      var barB = box(0.5, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0x2244ff }), 0.3, bodyH + 0.72, 0);
      g.add(barR);
      g.add(barB);
      g.userData.barR = barR;
      g.userData.barB = barB;
    }
    if (car.kind === 'taxi') {
      var sign = box(0.7, 0.25, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd94d }), -0.3, bodyH + 0.78, 0);
      g.add(sign);
      var checker = box(bodyL * 0.8, 0.18, 2.02, lambert(0x222222), 0, 0.72, 0);
      g.add(checker);
    }
    if (isSport) {
      var spoiler = box(0.18, 0.08, 1.9, lambert(0x222222), -2.2, 1.05, 0);
      g.add(spoiler);
      var spoilerL = box(0.12, 0.35, 0.12, lambert(0x222222), -2.2, 0.85, 0.8);
      g.add(spoilerL);
      var spoilerR = box(0.12, 0.35, 0.12, lambert(0x222222), -2.2, 0.85, -0.8);
      g.add(spoilerR);
      var scoop = box(0.7, 0.12, 0.6, lambert(0x222222), 1.4, 0.95, 0);
      g.add(scoop);
    }
    // Bumpers, grille, mirrors.
    var bumperF = box(0.22, 0.22, 2.0, chromeMat, bodyL / 2 + 0.05, 0.38, 0);
    g.add(bumperF);
    var bumperR = box(0.22, 0.22, 2.0, chromeMat, -bodyL / 2 - 0.05, 0.38, 0);
    g.add(bumperR);
    var grille = box(0.1, 0.22, 1.1, lambert(0x222222), bodyL / 2 + 0.06, 0.6, 0);
    g.add(grille);
    var mirrorL = box(0.18, 0.12, 0.12, lambert(0x222222), 0.85, bodyH + 0.35, 1.0);
    g.add(mirrorL);
    var mirrorR = box(0.18, 0.12, 0.12, lambert(0x222222), 0.85, bodyH + 0.35, -1.0);
    g.add(mirrorR);
    // Wheels with hubcaps.
    var wheelPositions = [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]];
    var wheels = [];
    var hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
    hubGeo.rotateX(Math.PI / 2);
    for (var wi = 0; wi < 4; wi += 1) {
      var wheelGroup = new THREE.Group();
      var wheel = new THREE.Mesh(wheelGeo, lambert(0x1a1a1a));
      wheelGroup.add(wheel);
      var hub = new THREE.Mesh(hubGeo, chromeMat);
      wheelGroup.add(hub);
      wheelGroup.position.set(wheelPositions[wi][0], 0.42, wheelPositions[wi][1]);
      g.add(wheelGroup);
      wheels.push(wheelGroup);
    }
    g.userData.wheels = wheels;
    // Round headlights + taillights.
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    var headGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8);
    headGeo.rotateZ(Math.PI / 2);
    var headL = new THREE.Mesh(headGeo, headMat);
    headL.position.set(bodyL / 2 + 0.06, 0.62, 0.62);
    g.add(headL);
    var headR = new THREE.Mesh(headGeo, headMat);
    headR.position.set(bodyL / 2 + 0.06, 0.62, -0.62);
    g.add(headR);
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var tailL = box(0.1, 0.16, 0.34, tailMat, -bodyL / 2 - 0.03, 0.62, 0.62);
    var tailR = box(0.1, 0.16, 0.34, tailMat, -bodyL / 2 - 0.03, 0.62, -0.62);
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
  // A frozen (staged screenshot) scene must render the same frame no matter
  // how many frames the machine renders before the capture: time and all
  // ambient motion stay put, so the same command writes the same bytes.
  if (!state.frozen) api.time += dt;
  var darkness = updateLighting(api, state);

  // Player.
  // Player: Rico is a realistic height now (scale 0.78, ~1.9 units tall) —
  // his head sits just above a sedan roof (~1.3), the way a real person
  // does. The old 1.45 made him a ~3.4-unit giant towering over cars.
  // His yellow shirt + red cap stay the anchor.
  if (!api.playerMesh) {
    api.playerMesh = api.buildPerson(0xf2c94c, 0x2c3e50, 0xe8b98a, { hair: 0x111111, hat: 'cap', hatColor: 0xe74c3c, scale: 0.78 });
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
    for (var i = 0; i < wheels.length; i += 1) wheels[i].rotation.z = car.wheelSpin || 0;
    if (mesh.userData.barR && mesh.userData.barB) {
      var flash = Math.sin(api.time * 10) > 0;
      mesh.userData.barR.material.color.setHex(flash ? 0xff2222 : 0x550000);
      mesh.userData.barB.material.color.setHex(flash ? 0x111166 : 0x2244ff);
    }
    if (mesh.userData.tailMat) mesh.userData.tailMat.color.setHex(car.brakeLight ? 0xff5555 : 0xaa1111);
    if (mesh.userData.coneMat) mesh.userData.coneMat.opacity = darkness > 0.1 ? 0.14 : 0;
  });

  // Pedestrians and foot cops — realistic scale (x0.72 on top of their
  // own heightScale, so a person is ~1.7 units tall: head just above a
  // sedan roof, clearly a human, never a giant next to a car).
  syncActor(api, api.pedMeshes, state.peds, function (ped) {
    return api.buildPerson(new THREE.Color(ped.color).getHex(), new THREE.Color(ped.pants || '#2c2c34').getHex(), new THREE.Color(ped.skin || '#e8b98a').getHex(), { hair: ped.hair, hat: ped.hat, hatColor: ped.hatColor, bag: ped.bag, bagColor: ped.bagColor, scale: (ped.heightScale || 1) * 0.72, gun: ped.hostile });
  }, placePerson);
  syncActor(api, api.copMeshes, state.cops, function () {
    return api.buildPerson(0x2f6fd0, 0x1a2530, 0xe8b98a, { hat: 'cap', hatColor: 0x1a2530, gun: true, scale: 0.75 });
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
    var color = pickup.kind === 'cash' ? 0xffd94d : pickup.kind === 'health' ? 0xffffff : pickup.kind === 'weapon' ? (pickup.weapon === 'shotgun' ? 0xff6d00 : 0x00e5ff) : 0x2ecc71;
    var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: color }));
    g.add(gem);
    if (pickup.kind === 'health') {
      var cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xe5534b }));
      g.add(cross);
    }
    // Weapon pickups read as a gun at a glance: a dark barrel + stock
    // floating over the coloured gem, orange for shotgun, cyan for rifle.
    if (pickup.kind === 'weapon') {
      var barrel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.16), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      barrel.position.set(0, 0.55, 0);
      g.add(barrel);
      var stock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.2), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
      stock.position.set(-0.8, 0.42, 0);
      g.add(stock);
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

  // Clouds drift, birds circle and flap, ocean foam slides — only while
  // the world runs; a frozen staged scene keeps them still (determinism).
  if (!state.frozen) {
    for (var ci = 0; ci < api.clouds.length; ci += 1) {
      api.clouds[ci].position.x += dt * 1.2;
      if (api.clouds[ci].position.x > 240) api.clouds[ci].position.x = -240;
    }
    if (api.birds) {
      for (var birdi = 0; birdi < api.birds.length; birdi += 1) {
        var bird = api.birds[birdi];
        var bt = api.time * 0.25 + bird.userData.phase;
        bird.position.x = Math.cos(bt) * 90 + (birdi - 3) * 18;
        bird.position.z = 60 + Math.sin(bt) * 70 - birdi * 12;
        bird.rotation.y = -bt;
        var flap = Math.sin(api.time * 9 + bird.userData.phase * 3) * 0.55;
        bird.userData.wingL.rotation.z = flap;
        bird.userData.wingR.rotation.z = -flap;
      }
    }
    for (var fi = 0; fi < api.foam.length; fi += 1) {
      api.foam[fi].position.z = worldZ(WORLD.height) + 4 + fi * 5 + Math.sin(api.time * 0.7 + fi * 2) * 1.2;
    }
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
  // STREET-LEVEL third-person camera: low and close behind Rico (or the
  // car), looking slightly UP so people are big in frame and towers loom
  // over the street — the old high/down camera is what made everything
  // look like toy boxes on a road. lookY is above eye level on purpose.
  var target = state.playerCar || state.player;
  var tx = worldX(target.x);
  var tz = worldZ(target.y);
  var driving = !!state.playerCar;
  var dist = driving ? 9.0 : 6.2;
  var height = driving ? 3.1 : 2.5;
  var lookY = driving ? 1.9 : 2.0;
  if (api.shotCam) {
    dist = api.shotCam.dist;
    height = api.shotCam.height;
    lookY = api.shotCam.lookY || 1.9;
  }
  if (state.screen === 'title') {
    // Title backdrop: a slow drift DOWN the downtown boulevard at street
    // level (camera stays on the road centreline, x = -24 is road 1680),
    // looking north up the canyon of towers — never a top-down map view,
    // and never inside a building the way a free orbit would be.
    var driftZ = 60 + Math.sin(api.time * 0.05) * 10;
    api.camPos.lerp(new THREE.Vector3(-24, 7, driftZ), Math.min(1, dt * 1.2));
    api.lookAt.lerp(new THREE.Vector3(-24, 11, -60), Math.min(1, dt * 1.2));
  } else {
    var yaw = state.camYaw;
    var fx = Math.cos(yaw);
    var fz = Math.sin(yaw);
    var desired = new THREE.Vector3(tx - fx * dist, height, tz - fz * dist);
    // Keep the camera inside the world.
    desired.x = clamp(desired.x, -190, 190);
    desired.z = clamp(desired.z, -150, 175);
    desired.y = Math.max(1.9, desired.y);
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

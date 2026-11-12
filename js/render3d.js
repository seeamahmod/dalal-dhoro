// ============================================================
//  First-person 3D renderer — Three.js r128
//  Realistic look: CC0 photo textures (Poly Haven), HDR sky lighting,
//  physically based materials, ACES tone mapping, shadows.
//  Map coords (x, y) on the 2D layout become Three (x, height, z=y).
// ============================================================

const R3 = { fans: [], people: new Map(), vehicles: new Map(), markers: [], joy: { x: 0, y: 0 }, turnTo: null };
const EYE = 35, CEIL = 72;

// ---------- shared materials / geometry ----------
const _mats = {}, _geos = {};
const lin = c => new THREE.Color(c).convertSRGBToLinear();            // colours are authored in sRGB
function mat(color, extra) {
  const k = color + (extra ? JSON.stringify(extra) : '');
  if (_mats[k]) return _mats[k];
  const o = Object.assign({ roughness: 0.85, metalness: 0 }, extra);
  return (_mats[k] = new THREE.MeshStandardMaterial(Object.assign(o, { color: lin(color) })));
}
function boxGeo(w, h, d) { const k = w + ',' + h + ',' + d; return _geos[k] || (_geos[k] = new THREE.BoxGeometry(w, h, d)); }
// a box covering map rect (x, y, w, d), from height `base` to `base + h`
function box(parent, x, y, w, d, h, color, base = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'string' ? mat(color) : color);
  m.position.set(x + w / 2, base + h / 2, y + d / 2);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
function cyl(parent, x, z, r1, r2, h, color, base = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, base + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

// ---------- photo textures (CC0, Poly Haven) ----------
// tile = how many world units one copy of the texture covers (≈ 21.7 units per metre)
const PHOTO = {
  asphalt: { file: 'worn_asphalt', tile: 110, rough: 0.92 },
  pavers: { file: 'concrete_pavers', tile: 45, rough: 0.9 },
  grass: { file: 'sparse_grass', tile: 90, rough: 1 },
  concrete: { file: 'concrete_floor_worn_001', tile: 70, rough: 0.9 },
  brick: { file: 'red_brick_03', tile: 48, rough: 0.92 },
  plaster: { file: 'worn_cracked_plaster', tile: 90, rough: 0.95 },
  paint: { file: 'painted_plaster_wall', tile: 70, rough: 0.85 },
  terrazzo: { file: 'terrazzo_tiles', tile: 44, rough: 0.35 },
  wood: { file: 'wood_table_worn', tile: 40, rough: 0.6 },
  tin: { file: 'rusty_corrugated_iron', tile: 40, rough: 0.7, metal: 0.35 },
  ceiling: { file: 'white_plaster_rough_01', tile: 80, rough: 1 },
};
const _ptex = {};
function photoTex(file) {
  if (_ptex[file]) return _ptex[file];
  const tl = R3.texLoader || (R3.texLoader = new THREE.TextureLoader());
  const an = R3.renderer.capabilities.getMaxAnisotropy();
  const map = tl.load(`assets/world/${file}_diff.jpg`), normalMap = tl.load(`assets/world/${file}_nor.jpg`);
  map.encoding = THREE.sRGBEncoding;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = an; }
  return (_ptex[file] = { map, normalMap });
}
// photo material, optionally tinted (tint multiplies the photo colour)
function pmat(kind, tint, extra) {
  const k = 'p' + kind + (tint || '') + (extra ? JSON.stringify(extra) : '');
  if (_mats[k]) return _mats[k];
  const P = PHOTO[kind], t = photoTex(P.file);
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: t.map, normalMap: t.normalMap, roughness: P.rough, metalness: P.metal || 0,
    color: tint ? lin(tint) : new THREE.Color(1, 1, 1), normalScale: new THREE.Vector2(0.9, 0.9),
  }, extra));
  m.userData.tile = P.tile;
  return (_mats[k] = m);
}
// a box with world-space UVs, so photo textures keep their real-world scale on every face
function tbox(parent, x, y, w, d, h, material, base = 0, shadow = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const cx = x + w / 2, cy = base + h / 2, cz = y + d / 2, tile = material.userData.tile || 50;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + cx, py = pos.getY(i) + cy, pz = pos.getZ(i) + cz;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const u = ny > 0.5 ? px : nx > 0.5 ? pz : px, v = ny > 0.5 ? -pz : py;
    uv.setXY(i, u / tile, v / tile);
  }
  const m = new THREE.Mesh(g, material);
  m.position.set(cx, cy, cz);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}

// text sign → unlit plane. rotY: 0 faces +z (south), Math.PI faces -z (north)
function textCanvas(lines, w, h, bg, fg, border) {
  const c = document.createElement('canvas');
  const s = 4; c.width = w * s; c.height = h * s;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  if (border) { g.strokeStyle = border; g.lineWidth = s * 1.2; g.strokeRect(s, s, c.width - 2 * s, c.height - 2 * s); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const t = typeof ln === 'string' ? { text: ln } : ln;
    const size = (t.size || (h / n) * 0.62) * s;
    g.font = `${t.bold === false ? 500 : 700} ${size}px "Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif`;
    g.fillStyle = t.color || fg;
    g.fillText(t.text, c.width / 2, (i + 0.5) * c.height / n + size * 0.04, c.width - 6 * s);
  });
  // a little dust and fading so signs don't look freshly printed
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 30, 12); }
  return c;
}
function sign(parent, lines, cx, cz, base, w, h, rotY, bg, fg = '#fff', border = '#f2e6a8') {
  const tex = new THREE.CanvasTexture(textCanvas(lines, w, h, bg, fg, border));
  tex.anisotropy = 4; tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
  m.position.set(cx, base + h / 2, cz); m.rotation.y = rotY; m.receiveShadow = true;
  parent.add(m); return m;
}

// ---------- init ----------
function init3D() {
  R3.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const r = R3.renderer;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  R3.camera = new THREE.PerspectiveCamera(72, 1, 1, 4000);
  R3.camera.rotation.order = 'YXZ';
  R3.overlay = document.querySelector('#overlay');
  R3.octx = R3.overlay.getContext('2d');
  resize3D();
  addEventListener('resize', resize3D);
  setupLookInput();
  loadSky();
}
// real HDR sky (CC0, Poly Haven) — lights the whole scene and is the visible sky
function loadSky() {
  if (!THREE.RGBELoader) return;
  new THREE.RGBELoader().setDataType(THREE.HalfFloatType).load('assets/world/sky.hdr', hdr => {
    const pm = new THREE.PMREMGenerator(R3.renderer);
    R3.envMap = pm.fromEquirectangular(hdr).texture;
    R3.skyBg = new THREE.WebGLCubeRenderTarget(1024).fromEquirectangularTexture(R3.renderer, hdr).texture;
    pm.dispose(); hdr.dispose();
    applySky();
  }, undefined, err => console.warn('sky', err));
}
function applySky() {
  if (!R3.scene || !R3.envMap) return;
  R3.scene.environment = R3.envMap;
  R3.scene.background = R3.skyBg;
}
function resize3D() {
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  R3.renderer.setPixelRatio(pr);
  R3.renderer.setSize(innerWidth, innerHeight, false);
  R3.camera.aspect = innerWidth / innerHeight;
  R3.camera.fov = innerWidth < innerHeight ? 85 : 72;
  R3.camera.updateProjectionMatrix();
  const od = Math.min(window.devicePixelRatio || 1, 2);
  R3.overlay.width = innerWidth * od; R3.overlay.height = innerHeight * od;
  R3.od = od;
}

// ---------- world ----------
function build3D(office, layout) {
  const scene = new THREE.Scene();
  R3.scene = scene; R3.fans = []; R3.people.clear(); R3.vehicles.clear(); R3.markers = [];
  scene.background = new THREE.Color('#aac3d6');
  scene.fog = new THREE.Fog(lin('#c3ccd0'), 500, 2200);                // Dhaka haze
  applySky();
  const th = office.theme;

  R3.hemi = new THREE.HemisphereLight(lin('#dfe8f5'), lin('#6e6250'), 0.25);
  scene.add(R3.hemi);
  const sun = new THREE.DirectionalLight(lin('#fff0d8'), 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 10, far: 1600 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  R3.sun = sun;

  // ---- ground: grass yard, concrete walkways, footpath, road ----
  tbox(scene, -3000, 1320, 7600, 3000, 0.5, pmat('asphalt', '#9a9a9a'), -0.6, false);      // city ground beyond
  tbox(scene, -3000, -3000, 7600, 3000, 0.5, pmat('concrete', '#a8a49a'), -0.6, false);
  tbox(scene, -3000, 0, 3000, 1320, 0.5, pmat('concrete', '#a8a49a'), -0.6, false);
  tbox(scene, 1600, 0, 3000, 1320, 0.5, pmat('concrete', '#a8a49a'), -0.6, false);
  tbox(scene, 0, 0, WORLD_W, 640, 0.5, pmat('concrete', '#a8a49a'), -0.7, false);
  tbox(scene, 0, 640, WORLD_W, 546, 0.5, pmat('grass', '#c8c4a8'), -0.5, false);             // dusty grass
  tbox(scene, 740, 640, 120, 530, 0.6, pmat('concrete'), -0.3, false);                       // walkway to door
  tbox(scene, 200, 960, 1250, 60, 0.6, pmat('concrete'), -0.3, false);
  tbox(scene, 720, 1170, 160, 40, 0.6, pmat('concrete'), -0.3, false);                       // gate apron
  tbox(scene, -3000, 1186, 7600, 22, 2.2, pmat('pavers', '#d0c8b8'), -0.2, false);           // footpath with kerb
  tbox(scene, -3000, 1208, 7600, 112, 0.5, pmat('asphalt'), -0.5, false);                    // road
  const lane = mat('#e8e2c0', { roughness: 0.6 });
  for (let x = -2900; x < 4500; x += 60) box(scene, x, 1263, 32, 2, 0.2, lane, 0, false);    // dashed centre line
  for (let x = GATE.x1 + 10; x < GATE.x2 - 10; x += 16) box(scene, x, 1212, 9, 104, 0.2, lane, 0, false);   // zebra crossing
  // rain puddles that mirror the sky
  const puddle = new THREE.MeshStandardMaterial({ color: lin('#3a3c3e'), roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.85 });
  for (const [x, z, r] of [[300, 1240, 26], [1150, 1290, 34], [1400, 1225, 20], [560, 1300, 22], [980, 1100, 18], [420, 760, 16]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddle);
    p.rotation.x = -Math.PI / 2; p.scale.y = 0.55; p.position.set(x, 0.25, z); p.receiveShadow = true; scene.add(p);
  }
  // pond / flowerbeds from the layout
  for (const p of layout.props) {
    if (p.type === 'pond') {
      const w = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: lin('#3c5546'), roughness: 0.05, metalness: 0.1 }));
      w.rotation.x = -Math.PI / 2; w.scale.set(p.w / 2, p.h / 2, 1); w.position.set(p.x + p.w / 2, 0.3, p.y + p.h / 2); scene.add(w);
    }
    if (p.type === 'flowerbed') {
      tbox(scene, p.x, p.y, p.w, p.h, 3, pmat('brick', '#bbbbbb'), 0);
      tbox(scene, p.x + 3, p.y + 3, p.w - 6, p.h - 6, 1, pmat('grass', '#7f8f55'), 2.5, false);
      const cs = ['#e74c3c', '#f1c40f', '#ff79b0', '#ffffff', '#ff8c1a'];
      for (let i = 0; i < p.w * p.h / 90; i++) {
        const f = new THREE.Mesh(boxGeo(2.4, 2.4, 2.4), mat(cs[i % 5], { roughness: 0.6 }));
        f.position.set(p.x + 6 + Math.random() * (p.w - 12), 4.5 + Math.random() * 2, p.y + 6 + Math.random() * (p.h - 12)); scene.add(f);
      }
    }
  }

  // ---- building shell ----
  const outerM = pmat('paint', th.wall);
  // upper storeys (seen from outside; the ground-floor hall has its own ceiling)
  const up = CEIL + 6, upH = 128;
  tbox(scene, 80, 40, 1440, 600, upH, outerM, up);
  tbox(scene, 72, 32, 1456, 616, 4, pmat('concrete', '#c9c3b6'), up + upH, false);            // roof parapet
  for (let k = 0; k < 6; k++) cyl(scene, 200 + k * 230, 300, 11, 11, 20, mat('#1b1b1b', { roughness: 0.6 }), up + upH + 4, 14);   // water tanks
  const glassM = mat('#283034', { roughness: 0.08, metalness: 0.6 }), shadeM = pmat('concrete', '#bfb9ad'), grillM = mat('#3a4246', { metalness: 0.4, roughness: 0.5 });
  for (const fy of [up + 22, up + 84]) for (let x = 120; x < 1480; x += 120) {
    for (const [z, ry] of [[640.6, 0], [39.4, Math.PI]]) {
      const wo = new THREE.Mesh(new THREE.PlaneGeometry(50, 30), glassM); wo.position.set(x + 25, fy + 15, z); wo.rotation.y = ry; scene.add(wo);
    }
    tbox(scene, x - 4, 640, 58, 9, 2, shadeM, fy + 34);
    for (let k = 1; k < 5; k++) box(scene, x + k * 10, 640.8, 0.8, 0.6, 30, grillM, fy, false);
  }
  for (const fy of [up + 2, up + 64]) tbox(scene, 78, 638, 1444, 4, 3, pmat('concrete', '#a8a294'), fy, false);   // floor bands
  tbox(scene, 80, 40, 1440, 16, CEIL, outerM);
  tbox(scene, 80, 40, 16, 600, CEIL, outerM);
  tbox(scene, 1504, 40, 16, 600, CEIL, outerM);
  tbox(scene, 80, 624, DOOR.x1 - 80, 16, CEIL, outerM);
  tbox(scene, DOOR.x2, 624, 1520 - DOOR.x2, 16, CEIL, outerM);
  tbox(scene, DOOR.x1, 624, DOOR.x2 - DOOR.x1, 16, CEIL - 50, outerM, 50);    // lintel above the door
  tbox(scene, 70, 30, 1460, 620, 6, pmat('concrete', '#b5b0a5'), CEIL, false); // roof slab with overhang
  tbox(scene, 76, 640, 1448, 3, 7, pmat('concrete', '#8a8478'), 0, false);     // plinth
  tbox(scene, 720, 640, 160, 26, 3, pmat('concrete'), 0, false);               // front step
  // interior lining: two-tone government-office paint (darker dado, cream upper wall)
  const dado = pmat('paint', shade3(th.trim, 1.9)), upper = pmat('paint', '#ece4cf');
  const lining = (x, y, w, d) => { tbox(scene, x, y, w, d, 26, dado, 0, false); tbox(scene, x, y, w, d, CEIL - 26, upper, 26, false); };
  lining(96, 56, 1408, 1); lining(96, 56, 1, 568); lining(1503, 56, 1, 568);
  lining(96, 623, DOOR.x1 - 96, 1); lining(DOOR.x2, 623, 1504 - DOOR.x2, 1);
  // terrazzo floor
  tbox(scene, 96, 56, 1408, 568, 0.4, pmat('terrazzo'), 0, false);
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1408, 568), pmat('ceiling', '#f2efe8', { emissive: lin('#8f8b82'), side: THREE.FrontSide }));
  // tube-light glow for the hall (the building above shades it from the sun)
  for (const [lx, lz] of [[330, 200], [800, 200], [1270, 200], [330, 470], [800, 470], [1270, 470]]) {
    const pl = new THREE.PointLight(lin('#f4f7ff'), 0.55, 520, 1.2);
    pl.position.set(lx, CEIL - 6, lz); scene.add(pl);
  }
  const cuv = ceil.geometry.attributes.uv; for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 1408 / 80, cuv.getY(i) * 568 / 80);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(800, CEIL - 0.5, 340); scene.add(ceil);
  // windows: daylight glass with iron grills
  const winM = new THREE.MeshBasicMaterial({ color: lin('#e8f2f7'), toneMapped: false });
  const grill = mat('#3a4246', { metalness: 0.4, roughness: 0.5 });
  for (let x = 170; x < 1460; x += 160) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(56, 26), winM); w.position.set(x + 28, 50, 57.2); scene.add(w);
    for (let k = 1; k < 5; k++) box(scene, x + k * 11.2, 57.4, 0.8, 0.6, 26, grill, 37, false);
    box(scene, x, 57.4, 56, 0.6, 0.8, grill, 49.5, false);
    // same window seen from outside
    const wo = new THREE.Mesh(new THREE.PlaneGeometry(56, 26), mat('#2a3236', { roughness: 0.1, metalness: 0.5 })); wo.position.set(x + 28, 50, 39.4); wo.rotation.y = Math.PI; scene.add(wo);
  }
  for (let z = 180; z < 560; z += 150) for (const x of [97.2, 1502.8]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(50, 24), winM);
    w.position.set(x, 50, z); w.rotation.y = x < 800 ? Math.PI / 2 : -Math.PI / 2; scene.add(w);
  }
  // front facade windows with sunshades (outside)
  for (let x = 120; x < 1480; x += 120) {
    if (x > DOOR.x1 - 40 && x < DOOR.x2 + 20) continue;
    const wo = new THREE.Mesh(new THREE.PlaneGeometry(50, 24), mat('#283034', { roughness: 0.08, metalness: 0.6 }));
    wo.position.set(x + 25, 46, 640.6); scene.add(wo);
    tbox(scene, x - 4, 640, 58, 9, 2, pmat('concrete', '#bfb9ad'), 59.5);    // chajja sunshade
    for (let k = 1; k < 5; k++) box(scene, x + k * 10, 640.8, 0.8, 0.6, 24, grill, 34, false);
  }
  // tube lights + ceiling fans
  const tubeM = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  for (let x = 260; x < 1400; x += 270) for (const z of [230, 470]) {
    const tb = new THREE.Mesh(boxGeo(26, 1, 1.6), tubeM); tb.position.set(x, CEIL - 2, z - 60); scene.add(tb);
    box(scene, x - 14, z - 61.5, 28, 3, 1, '#d8d8d0', CEIL - 1.5, false);
    const fan = new THREE.Group();
    fan.position.set(x, CEIL - 9, z);
    const rod = new THREE.Mesh(boxGeo(1, 8, 1), mat('#555')); rod.position.y = 4.5; fan.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2.5, 14), mat('#e8e2d6', { roughness: 0.4 })); fan.add(hub);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(boxGeo(20, 0.5, 4.5), mat('#e8e2d6', { roughness: 0.4 }));
      b.position.set(Math.cos(i * 2.094) * 12, 0, Math.sin(i * 2.094) * 12); b.rotation.y = -i * 2.094;
      fan.add(b);
    }
    scene.add(fan); R3.fans.push(fan);
  }
  // banner, flag, clock, notice board, posters
  sign(scene, ['"দুর্নীতিমুক্ত সেবা আমাদের অঙ্গীকার"'], 800, 57.6, 30, 260, 14, 0, '#b8262b', '#fff', '#f2e6a8');
  const flag = new THREE.Group(); flag.position.set(560, 50, 57.8);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), mat('#006a4e', { side: THREE.DoubleSide })); flag.add(fg);
  const fr = new THREE.Mesh(new THREE.CircleGeometry(3.6, 20), mat('#f42a41')); fr.position.set(-1, 0, 0.1); flag.add(fr);
  scene.add(flag);
  const clockC = document.createElement('canvas'); clockC.width = clockC.height = 128;
  R3.clockTex = new THREE.CanvasTexture(clockC); R3.clockTex.encoding = THREE.sRGBEncoding; R3.clockCanvas = clockC;
  const clk = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshStandardMaterial({ map: R3.clockTex, roughness: 0.4 }));
  clk.position.set(1040, 52, 57.8); scene.add(clk); R3.lastClock = -1;
  const notice = document.createElement('canvas'); notice.width = 256; notice.height = 160;
  { const g = notice.getContext('2d'); g.fillStyle = '#7a5434'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#c9a86e'; g.fillRect(8, 8, 240, 144);
    for (let i = 0; i < 9; i++) { g.save(); g.translate(20 + (i % 3) * 78, 18 + Math.floor(i / 3) * 46); g.rotate((Math.random() - 0.5) * 0.15);
      g.fillStyle = ['#fff', '#f6f1dc', '#fffbe8'][i % 3]; g.fillRect(0, 0, 62, 38); g.fillStyle = '#555';
      for (let l = 0; l < 6; l++) g.fillRect(5, 5 + l * 5.5, 30 + Math.random() * 22, 1.6); g.fillStyle = '#c33'; g.beginPath(); g.arc(31, 2, 2, 0, 7); g.fill(); g.restore(); } }
  const nt = new THREE.CanvasTexture(notice); nt.encoding = THREE.sRGBEncoding;
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(56, 35), new THREE.MeshStandardMaterial({ map: nt, roughness: 0.9 }));
  nb.position.set(97.5, 38, 420); nb.rotation.y = Math.PI / 2; scene.add(nb);
  sign(scene, [{ text: 'সিটিজেন চার্টার', size: 7 }, { text: 'নাগরিক সেবা সনদ', size: 4.6 },
    { text: 'সেবা, ফি ও সময়সীমা', size: 3.8, bold: false }, { text: 'কোনো সেবায় বাড়তি টাকা নয়', size: 3.8, bold: false }],
    682, 622.2, 18, 80, 38, Math.PI, '#1f5f2f');
  sign(scene, [{ text: 'দুদক হটলাইন', size: 7 }, { text: '১০৬', size: 14 }, { text: 'ঘুষ চাইলে ১০৬-এ কল করুন', size: 4, bold: false }],
    920, 622.2, 20, 64, 34, Math.PI, '#b8262b');

  // ---- counters ----
  const wood = pmat('wood', '#8a6a50'), woodTop = pmat('wood', '#c2a07c', { roughness: 0.45 });
  const counter = (x, y, w) => { tbox(scene, x, y, w, 26, 20, wood); tbox(scene, x - 2, y - 2, w + 4, 30, 2, woodTop, 20); };
  counter(96, 118, 1408);
  counter(150, 336, 560); counter(890, 336, 560);
  const glass = new THREE.MeshStandardMaterial({ color: lin('#c9dde4'), transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 });
  box(scene, 150, 292, 560, 6, 42, glass); box(scene, 890, 292, 560, 6, 42, glass);
  const alu = mat('#9aa3a8', { metalness: 0.7, roughness: 0.35 });
  box(scene, 150, 292, 560, 6, 3, alu, 42); box(scene, 890, 292, 560, 6, 3, alu, 42);
  for (let x = 110; x < 1500; x += 230) {                                                     // steel almirahs
    box(scene, x, 58, 40, 14, 52, mat('#7c8a8f', { metalness: 0.5, roughness: 0.45 }));
    box(scene, x + 19.5, 71.9, 1, 0.4, 50, '#4a5458', 1, false);
  }
  const files = ['#efe6c8', '#d8c890', '#e9d9b0', '#c9b98a'];
  layout.desks.forEach((d, i) => {
    const ty = d.row === 'top' ? 66 : 300;
    tbox(scene, d.x - 34, ty, 68, 22, 15, pmat('wood', '#6a4a30'));
    for (let k = 0; k < 7; k++) box(scene, d.x - 30 + Math.random() * 3, ty + 3 + Math.random() * 2, 18, 13, 1.8, files[k % 4], 15 + k * 1.8);
    box(scene, d.x + 6, ty + 4, 20, 13, 3, '#c8b46a', 15);                                       // red-tape file
    box(scene, d.x + 24, d.counterY + 8, 13, 2, 9, mat('#2a2c2e', { roughness: 0.3 }), 22); box(scene, d.x + 29, d.counterY + 9, 3, 3, 3, '#3a3d40', 21);  // monitor
    box(scene, d.x - 20, d.counterY + 6, 14, 6, 0.8, '#1e1e1e', 22, false);                     // keyboard
    box(scene, d.x - 4, d.counterY + 10, 9, 6, 1.6, '#f2f2ee', 22, false);                      // forms
    const st = office.steps[Math.floor(i / 2)];
    sign(scene, [{ text: `কাউন্টার ${toBn(i + 1)}`, color: '#ffe07a' }, st.desk], d.x, d.counterY + 14, 52, 92, 16, 0, '#13283a');
    box(scene, d.x - 40, d.counterY + 13, 1, 1, CEIL - 68, '#444', 68, false);
    box(scene, d.x + 39, d.counterY + 13, 1, 1, CEIL - 68, '#444', 68, false);
    sign(scene, [toBn(i + 1)], d.x - 40, d.counterY + 26.3, 5, 12, 12, 0, '#13283a', '#ffe07a', null);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 4), new THREE.MeshBasicMaterial({ color: '#ffd34a', toneMapped: false }));
    cone.rotation.x = Math.PI; cone.position.set(d.x, 44, d.counterY + 14);
    const ring = new THREE.Mesh(new THREE.RingGeometry(13, 17, 32), new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.7, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.7, d.queueY);
    scene.add(cone); scene.add(ring);
    R3.markers.push({ step: Math.floor(i / 2), cone, ring, desk: d });
  });
  // information desk
  tbox(scene, 250, 540, 100, 26, 20, wood); tbox(scene, 248, 538, 104, 30, 2, woodTop, 20);
  sign(scene, ['তথ্য সেবা'], 300, 567, 6, 80, 10, 0, '#1f5f2f', '#fff', null);
  // steel benches + red/blue plastic chairs
  const steel = mat('#a7b2b8', { metalness: 0.6, roughness: 0.35 });
  const bench = (x, y, w) => {
    box(scene, x, y + 2, w, 10, 1.5, steel, 10);
    box(scene, x, y + 11, w, 1.2, 10, steel, 12);
    for (let k = x + 6; k < x + w; k += 60) box(scene, k, y + 3, 2, 8, 10, '#555', 0, false);
  };
  bench(1000, 520, 380); bench(1000, 572, 380); bench(430, 520, 240);
  const chair = (x, z, c) => {
    const m = mat(c, { roughness: 0.45 });
    box(scene, x - 5, z - 5, 10, 10, 1.2, m, 10);
    box(scene, x - 5, z + 4, 10, 1.2, 11, m, 11);
    for (const [a, b] of [[-4.5, -4.5], [3.5, -4.5], [-4.5, 3.5], [3.5, 3.5]]) box(scene, x + a, z + b, 1, 1, 10, m, 0, false);
  };
  for (let i = 0; i < 6; i++) chair(140 + i * 16, 470, i % 3 ? '#c0392b' : '#2d6ea3');
  box(scene, 110, 570, 30, 40, 30, mat('#3d7fbf', { roughness: 0.4 })); cyl(scene, 125, 590, 9, 9, 16, new THREE.MeshStandardMaterial({ color: lin('#bfe3f5'), transparent: true, opacity: 0.6, roughness: 0.05 }), 30);
  for (const [x, z] of [[120, 160], [1480, 160], [720, 600], [880, 600]]) {
    cyl(scene, x, z, 6, 5, 10, pmat('brick', '#c08060'));
    for (let k = 0; k < 4; k++) {
      const lv = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 1), mat(['#2f7a3a', '#3a8a40', '#28692f'][k % 3], { roughness: 0.7 }));
      lv.position.set(x + (k - 1.5) * 3, 17 + k * 2, z + (k % 2) * 3); lv.scale.set(1, 0.8, 1); lv.castShadow = true; scene.add(lv);
    }
  }

  // ---- compound wall, gate, signs ----
  const brick = pmat('brick'), capM = pmat('concrete', '#e6e0d2');
  const cwall = (x, y, w, d) => { tbox(scene, x, y, w, d, 32, brick); tbox(scene, x - 1.5, y - 1.5, w + 3, d + 3, 3, capM, 32); };
  cwall(0, 640, 12, 546); cwall(1588, 640, 12, 546);
  cwall(0, 1170, GATE.x1, 16); cwall(GATE.x2, 1170, 1600 - GATE.x2, 16);
  const pillar = pmat('plaster', '#efe8d8');
  tbox(scene, GATE.x1 - 16, 1164, 20, 26, 48, pillar); tbox(scene, GATE.x2 - 4, 1164, 20, 26, 48, pillar);
  tbox(scene, GATE.x1 - 18, 1162, 24, 30, 3, capM, 48); tbox(scene, GATE.x2 - 6, 1162, 24, 30, 3, capM, 48);
  const iron = mat('#2f3438', { metalness: 0.6, roughness: 0.5 });
  for (const gx of [GATE.x1 - 2, GATE.x2 + 2]) {
    const leaf = new THREE.Group();
    for (let k = 0; k < 9; k++) { const bar = new THREE.Mesh(boxGeo(1, 30, 1), iron); bar.position.set(0, 16, -k * 7); bar.castShadow = true; leaf.add(bar); }
    for (const yy of [3, 31]) { const t = new THREE.Mesh(boxGeo(1.5, 1.5, 60), iron); t.position.set(0, yy, -28); leaf.add(t); }
    leaf.position.set(gx, 0, 1176); scene.add(leaf);
  }
  sign(scene, [office.nameBn], 800, 1190.5, 50, 196, 16, 0, th.board);
  sign(scene, [office.nameBn], 800, 1163.5, 50, 196, 16, Math.PI, th.board);
  sign(scene, [office.nameBn, { text: office.place, size: 5, bold: false }], 800, 641, 52, 180, 17, 0, th.board);
  // paper posters and grime on the compound wall (street side)
  const posters = ['কোচিং সেন্টার\nভর্তি চলছে', 'বাসা ভাড়া\nদেওয়া হইবে', 'হারানো\nবিজ্ঞপ্তি', 'জরুরি\nনিয়োগ', 'ডাক্তার\nদেখান', 'বিদেশ যেতে\nযোগাযোগ'];
  for (let i = 0; i < 14; i++) {
    const x = 40 + i * 110 + Math.random() * 30; if (x > GATE.x1 - 40 && x < GATE.x2 + 30) continue;
    const t = posters[i % posters.length].split('\n');
    const p = sign(scene, [{ text: t[0], size: 4.2 }, { text: t[1], size: 3.4, bold: false }], x, 1186.7, 10 + Math.random() * 12, 18, 13, 0,
      pick(['#f6e7a1', '#f3c6c6', '#cfe8f7', '#f7f2e4', '#d9f2c9']), '#222', null);
    p.rotation.z = (Math.random() - 0.5) * 0.12;
  }

  // ---- yard props ----
  for (const p of layout.props) prop3D(scene, p);

  // ---- city around the compound ----
  city(scene);
}

// colour helper for 3D materials (lighter/darker)
function shade3(hex, f) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return '#' + c.getHexString(); }

// update the wall clock texture with the game time (once per game minute)
function updateWallClock() {
  if (!R3.clockCanvas || !G) return;
  const m = Math.floor(G.min); if (m === R3.lastClock) return; R3.lastClock = m;
  const g = R3.clockCanvas.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#fbfaf5'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#7a1d1d'; g.stroke();
  g.fillStyle = '#222';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4); }
  const hand = (a, len, w) => { g.save(); g.translate(64, 64); g.rotate(a); g.fillRect(-w / 2, -len, w, len); g.restore(); };
  hand(((m / 60) % 12) / 12 * Math.PI * 2, 30, 5); hand((m % 60) / 60 * Math.PI * 2, 44, 3);
  R3.clockTex.needsUpdate = true;
}

function prop3D(scene, p) {
  const { x, y, w, h } = p;
  switch (p.type) {
    case 'tree': {
      cyl(scene, p.x, p.y, 3.5, 6, 52, mat('#5a4330', { roughness: 1 }), 0, 9);
      const leaves = ['#2e5f2a', '#3a7334', '#2a5526', '#45803c'];
      for (let k = 0; k < 9; k++) {
        const r = 14 + Math.random() * 12, a = k / 9 * Math.PI * 2;
        const geo = new THREE.IcosahedronGeometry(r, 1);
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.85 + Math.random() * 0.3), pa.getY(i) * (0.8 + Math.random() * 0.3), pa.getZ(i) * (0.85 + Math.random() * 0.3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat(leaves[k % 4], { roughness: 0.8, flatShading: true }));
        m.position.set(p.x + Math.cos(a) * (k ? 18 : 0), 66 + Math.random() * 24 + (k ? 0 : 10), p.y + Math.sin(a) * (k ? 18 : 0));
        m.castShadow = true; scene.add(m);
      }
      break;
    }
    case 'teastall': {
      tbox(scene, x, y + 20, w, h - 20, 22, pmat('wood', '#7d5a36'));
      tbox(scene, x, y, w, 6, 48, pmat('wood', '#5b3d22'));                                       // back shelf
      for (let i = 0; i < 6; i++) cyl(scene, x + 15 + i * 20, y + 3, 4, 4, 8, new THREE.MeshStandardMaterial({ color: lin('#e8e2c8'), transparent: true, opacity: 0.75, roughness: 0.1 }), 38, 10);
      for (const [px, pz] of [[x, y + h], [x + w, y + h]]) box(scene, px - 1, pz - 1, 2, 2, 44, '#555');
      const roof = tbox(scene, x - 8, y - 4, w + 16, h + 14, 1.2, pmat('tin'), 46); roof.rotation.x = 0.08;
      cyl(scene, x + 30, y + 34, 5, 6, 9, mat('#c8c8c8', { metalness: 0.8, roughness: 0.3 }), 22);   // kettle
      box(scene, x + 70, y + 30, 40, 10, 6, '#f0c040', 22);                                        // bananas
      for (let i = 0; i < 3; i++) cyl(scene, x + 16 + i * 30, y + h + 14, 6, 6, 10, mat('#c0392b', { roughness: 0.4 }), 0, 12);  // stools
      sign(scene, ['চা স্টল'], x + w / 2, y + h + 9.2, 34, 60, 10, 0, '#c0392b', '#fff', null);
      break;
    }
    case 'copyshop': {
      tbox(scene, x, y, w, h, 34, pmat('plaster', '#e5e1d6'));
      box(scene, x + 14, y + h - 2, 40, 20, 16, mat('#5a5d60', { roughness: 0.4 }));                // photocopier outside
      const roof = tbox(scene, x - 6, y + h - 4, w + 12, 22, 1.2, pmat('tin', '#7aa0c8'), 40); roof.rotation.x = 0.12;
      sign(scene, ['ফটোকপি · কম্পোজ · প্রিন্ট'], x + w / 2, y + h + 0.6, 22, w - 10, 10, 0, '#2d6ea3', '#fff', null);
      break;
    }
    case 'policebox': {
      tbox(scene, x, y, w, h, 46, pmat('plaster', '#4a5d86'));
      tbox(scene, x - 4, y - 4, w + 8, h + 8, 3, pmat('concrete', '#c8c8c8'), 46);
      cyl(scene, x + w / 2, y + h / 2, 3, 3, 5, new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false }), 49);
      sign(scene, ['পুলিশ বক্স', { text: 'বাংলাদেশ পুলিশ', size: 4.5 }], x + w / 2, y + h + 0.6, 26, 50, 14, 0, '#e8eef8', '#2c3e66', null);
      sign(scene, ['পুলিশ বক্স', { text: 'বাংলাদেশ পুলিশ', size: 4.5 }], x - 0.6, y + h / 2, 26, 44, 14, -Math.PI / 2, '#e8eef8', '#2c3e66', null);
      break;
    }
    case 'bench': tbox(scene, x, y, w, h, 10, pmat('wood', '#6b4a2b')); break;
    case 'car': {
      const cols = ['#d9d9d9', '#2f4f6f', '#8b1e1e', '#e0e0e0', '#3a3a3a'];
      const paint = mat(cols[Math.floor((x + y) % cols.length)], { metalness: 0.6, roughness: 0.25 });
      box(scene, x, y + 3, w, h - 6, 14, paint, 4);
      const cab = box(scene, x + 18, y + 6, w - 40, h - 12, 11, mat('#1f2a30', { metalness: 0.5, roughness: 0.08 }), 18);
      cab.scale.x = 0.98;
      for (const [wx, wz] of [[x + 16, y + 2], [x + w - 16, y + 2], [x + 16, y + h - 2], [x + w - 16, y + h - 2]]) {
        const wh = cyl(scene, wx, wz, 6, 6, 4, '#1a1a1a', 0, 14); wh.rotation.x = Math.PI / 2; wh.position.y = 6;
      }
      break;
    }
    case 'truck': {
      box(scene, x, y, w * 0.7, h, 40, mat('#c75b1e', { roughness: 0.5 }), 6);
      for (let i = 0; i < 6; i++) box(scene, x + 6 + i * 16, y - 0.5, 8, h + 1, 30, '#f2c230', 10, false);
      box(scene, x + w * 0.72, y + 4, w * 0.28, h - 8, 30, mat('#2f6b3b', { roughness: 0.4 }), 6);
      for (const wx of [x + 20, x + w * 0.6, x + w * 0.88]) for (const wz of [y, y + h]) {
        const wh = cyl(scene, wx, wz, 7, 7, 5, '#1a1a1a', 0, 14); wh.rotation.x = Math.PI / 2; wh.position.y = 7;
      }
      break;
    }
    case 'bike': box(scene, x + 6, y, 6, h, 14, mat('#b22', { metalness: 0.5, roughness: 0.3 }), 4); break;
    case 'shed': {
      tbox(scene, x, y, w, h, 40, pmat('brick', '#cfcfcf'));
      const roof = tbox(scene, x - 6, y - 6, w + 12, h + 12, 1.2, pmat('tin'), 40); roof.rotation.x = 0.06;
      sign(scene, ['রেকর্ড রুম'], x + w / 2, y + h + 0.6, 22, 110, 12, 0, '#7a3b1d', '#fff', null);
      break;
    }
    case 'haystack': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(w / 2, 48, 14), mat('#c9a646', { roughness: 1, flatShading: true }));
      m.position.set(x + w / 2, 24, y + h / 2); m.castShadow = true; scene.add(m);
      break;
    }
    case 'container': {
      box(scene, x, y, w, h, 40, mat(p.color, { metalness: 0.4, roughness: 0.6 }));
      for (let i = x + 6; i < x + w; i += 10) box(scene, i, y - 0.4, 3, h + 0.8, 38, mat(p.color, { metalness: 0.4, roughness: 0.6 }), 1, false);
      break;
    }
  }
}

function city(scene) {
  // Dhaka-style buildings: plastered facades, rows of windows, balconies, AC units,
  // black rooftop water tanks, shop signboards — plus electric poles with tangled wires
  const wc = document.createElement('canvas'); wc.width = 128; wc.height = 128;
  const g = wc.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(60,50,40,${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 6); }   // stains
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = 10 + i * 64, y = 14 + j * 64;
    g.fillStyle = '#3c4850'; g.fillRect(x, y, 42, 34);
    g.fillStyle = 'rgba(200,220,235,.35)'; g.fillRect(x + 2, y + 2, 18, 30);
    g.strokeStyle = '#26292b'; g.lineWidth = 2; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + 4 + k * 7, y); g.lineTo(x + 4 + k * 7, y + 34); g.stroke(); }  // grills
    g.fillStyle = '#b9b2a4'; g.fillRect(x - 4, y - 6, 50, 5);                   // sunshade
    g.fillStyle = 'rgba(40,30,20,.25)'; g.fillRect(x, y + 34, 42, 10);          // rain streak
  }
  const winTex = new THREE.CanvasTexture(wc); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.encoding = THREE.sRGBEncoding;
  const cols = ['#e8dcc0', '#d9c7a8', '#e6c9c0', '#c9d1c6', '#ddd2a6', '#c7c2bd', '#e7e1d3', '#d4b8a0'];
  const shops = ['মোবাইল ফোন সার্ভিসিং', 'নিউ মা ফার্মেসী', 'হোটেল ও রেস্টুরেন্ট', 'কম্পিউটার কম্পোজ', 'ভাই ভাই স্টোর', 'সততা ইলেকট্রনিক্স', 'মায়ের দোয়া টেলিকম', 'বিসমিল্লাহ টি স্টল'];
  const tankM = mat('#1b1b1b', { roughness: 0.6 }), acM = mat('#e4e4de', { roughness: 0.5 });
  const bld = (x, z, w, d, h, front) => {
    const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 30)), Math.max(1, Math.round(h / 30)));
    const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshStandardMaterial({ color: lin(pick(cols)), map: t, roughness: 0.95 }));
    m.position.set(x, h / 2, z); m.castShadow = false; m.receiveShadow = true; scene.add(m);
    // rooftop water tanks and parapet
    for (let k = 0; k < 2; k++) cyl(scene, x - w / 4 + k * w / 2.2, z, 7, 7, 12, tankM, h, 12);
    box(scene, x - w / 2, z - d / 2, w, d, 4, mat(pick(cols)), h, false);
    if (front) {
      const fz = z - front * (d / 2 + 0.6);
      for (let k = 0; k < 3; k++) box(scene, x - w / 2 + 8 + k * 28, fz - front * 3, 12, 6, 7, acM, 30 + k * 32, false);   // AC units
      const s = sign(scene, [pick(shops)], x, fz - front * 0.4, 14, Math.min(w - 10, 100), 14, front > 0 ? 0 : Math.PI,
        pick(['#c0392b', '#1d4f91', '#1f6b3a', '#7a2d6a', '#d35400']), '#fff', '#f1e7b0');
      tbox(scene, x - w / 2, fz - front * 6, w, 6, 12, pmat('concrete', '#8a8478'), 0, false);   // shop front shutters
    }
  };
  for (let x = -300; x < 1900; x += rand(120, 170)) bld(x, rand(1420, 1460), rand(100, 140), rand(70, 110), rand(110, 280), 1);
  for (let x = -300; x < 1900; x += rand(110, 170)) bld(x, rand(-140, -90), rand(90, 140), rand(70, 110), rand(120, 300), 0);
  for (let z = 0; z < 1300; z += rand(120, 170)) { bld(rand(-150, -110), z, rand(80, 110), rand(90, 140), rand(90, 240), 0); bld(rand(1710, 1750), z, rand(80, 110), rand(90, 140), rand(90, 240), 0); }
  // poles + tangled wires along the footpath
  const tops = [];
  const poleM = pmat('concrete', '#9a9a92');
  for (let x = -400; x < 2000; x += 170) {
    cyl(scene, x, 1200, 2.2, 3.2, 90, poleM, 0, 8);
    box(scene, x - 14, 1199, 28, 2, 2, '#666', 82, false);
    box(scene, x - 4, 1198, 8, 4, 10, '#4a4a4a', 66, false);                   // transformer box
    tops.push(x);
  }
  const wireM = new THREE.LineBasicMaterial({ color: '#141414' });
  for (let k = 0; k < 9; k++) {
    for (let i = 0; i < tops.length - 1; i++) {
      const pts = [];
      const a = tops[i] + (k % 3) * 10 - 10, b = tops[i + 1] + (k % 3) * 10 - 10, hy = 84 - k * 2.2, sag = 8 + k * 3 + Math.random() * 6;
      for (let s = 0; s <= 10; s++) { const t = s / 10; pts.push(new THREE.Vector3(a + (b - a) * t, hy - Math.sin(t * Math.PI) * sag, 1200 + (k - 4) * 0.7)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
    }
  }
  // parked rickshaws by the gate and a street vendor's van on the footpath
  for (const [px, pz, rot] of [[640, 1232, 0.15], [680, 1240, -0.1], [930, 1236, 3.0]]) {
    const v = vehicleMesh({ type: 'rickshaw', color: pick(['#2f6fb5', '#c0392b', '#2f8a5a']), dir: 1 });
    v.position.set(px, 0, pz); v.rotation.y = rot; scene.add(v);
  }
  const van = new THREE.Group();
  const vb = new THREE.Mesh(boxGeo(40, 3, 22), pmat('wood', '#8a6a50')); vb.position.y = 14; van.add(vb);
  for (let i = 0; i < 18; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), mat(pick(['#e67e22', '#f1c40f', '#27ae60', '#c0392b']), { roughness: 0.5 })); f.position.set(-16 + (i % 6) * 6.5, 17.5, -7 + Math.floor(i / 6) * 7); van.add(f); }
  for (const [wx, wz] of [[-14, -11], [-14, 11], [16, 0]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2, 12), mat('#222')); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 6, wz); van.add(wh); }
  van.position.set(1010, 0, 1197); scene.add(van);
}

const FACE_ANG = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };

function vehicleMesh(v) {
  const g = new THREE.Group();
  const B = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(boxGeo(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const wheel = (x, z, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 10), mat('#1a1a1a')); m.rotation.x = Math.PI / 2; m.position.set(x, r, z); g.add(m); };
  if (v.type === 'rickshaw') {
    wheel(-14, -9, 7); wheel(-14, 9, 7); wheel(16, 0, 7);
    B(18, 4, 20, '#3a6ab0', -12, 14, 0);               // seat base
    B(16, 8, 20, '#c0392b', -14, 20, 0);               // seat
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 22, 10, 1, true, 0, Math.PI), new THREE.MeshLambertMaterial({ color: v.color, side: THREE.DoubleSide }));
    hood.rotation.x = Math.PI / 2; hood.rotation.z = Math.PI / 2; hood.position.set(-18, 26, 0); g.add(hood);
    B(30, 2, 2, '#666', 2, 12, 0);
    const puller = personMesh(randomLook({ female: false })); puller.root.position.set(12, 4, 0); puller.root.rotation.y = Math.PI / 2; puller.root.scale.setScalar(0.8); g.add(puller.root);
  } else if (v.type === 'cng') {
    wheel(-14, -9, 5); wheel(-14, 9, 5); wheel(16, 0, 5);
    B(44, 16, 22, '#1f8a3a', 0, 13, 0); B(40, 14, 22.4, '#1d1d1d', -2, 27, 0); B(44, 2, 24, '#1f8a3a', 0, 35, 0);
  } else if (v.type === 'bus') {
    for (const x of [-38, 38]) { wheel(x, -14, 8); wheel(x, 14, 8); }
    B(120, 40, 34, v.color, 0, 26, 0);
    for (let x = -50; x < 54; x += 16) { B(12, 12, 34.6, '#2b3b46', x, 36, 0); }
    B(120, 4, 34.4, '#f2f2f2', 0, 22, 0);
  } else {
    for (const x of [-18, 18]) { wheel(x, -12, 6); wheel(x, 12, 6); }
    B(58, 14, 26, v.color, 0, 12, 0); B(30, 11, 24, '#2b3b46', -2, 24, 0);
  }
  return g;
}

// ---------- per-frame ----------
function render3D(dt) {
  const t = G.t;
  const p = G.player;
  // camera turns to face the person talking to you
  if (R3.turnTo != null) {
    let d = R3.turnTo - G.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    G.yaw += d * Math.min(1, dt * 8);
    G.pitch += (-0.08 - G.pitch) * Math.min(1, dt * 6);
    if (Math.abs(d) < 0.01) R3.turnTo = null;
  }
  // mouse not captured yet: keep turning while the cursor rests near a side edge
  if (!R3.isTouch && document.pointerLockElement !== canvas && R3.mouseX != null && !G.dialog && !G.paused && !G.over) {
    const edge = 50;
    if (R3.mouseX < edge) G.yaw -= dt * 1.8 * (1 - R3.mouseX / edge);
    else if (R3.mouseX > innerWidth - edge) G.yaw += dt * 1.8 * (1 - (innerWidth - R3.mouseX) / edge);
  }
  const bob = p.moving ? Math.sin(t * 10) * 0.6 : 0;
  R3.camera.position.set(p.x, EYE + bob, p.y);
  R3.camera.rotation.set(G.pitch, -G.yaw, 0);

  // sun follows the player; warmer later in the day
  const late = Math.max(0, Math.min(1, (G.min - 14 * 60) / 180));
  R3.sun.position.set(p.x - 300 + late * 560, 640 - late * 260, p.y + 320);
  R3.sun.target.position.set(p.x, 0, p.y);
  R3.sun.color.setRGB(1, 0.92 - late * 0.22, 0.82 - late * 0.4);
  R3.sun.intensity = 2.4 - late * 0.5;
  R3.hemi.intensity = 0.25 - late * 0.05;
  updateWallClock();

  syncPeople(t, dt);
  for (const v of G.vehicles) {
    let m = R3.vehicles.get(v);
    if (!m) { m = vehicleMesh(v); R3.vehicles.set(v, m); R3.scene.add(m); }
    m.position.set(v.x, 0, v.y); m.rotation.y = v.dir > 0 ? 0 : Math.PI;
  }
  for (const f of R3.fans) f.rotation.y += dt * 9;
  const s = currentStep(), lunch = isLunch();
  for (const mk of R3.markers) {
    const on = mk.step === s && !lunch;
    mk.cone.visible = mk.ring.visible = on;
    if (on) { mk.cone.position.y = 46 + Math.sin(t * 4) * 1.5; mk.cone.rotation.y += dt * 2; mk.ring.material.opacity = 0.45 + Math.sin(t * 5) * 0.25; }
  }
  R3.renderer.render(R3.scene, R3.camera);
  drawOverlay(t);
}

const _v = new THREE.Vector3();
function toScreen(x, h, y) {
  _v.set(x, h, y).project(R3.camera);
  if (_v.z > 1 || _v.z < -1) return null;
  return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight };
}

function drawOverlay(t) {
  const g = R3.octx, od = R3.od;
  g.setTransform(od, 0, 0, od, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  const p = G.player;
  // name tags + bubbles
  g.textAlign = 'center';
  for (const e of G.ents) {
    if (e === p || e.kind === 'officer') continue;
    const d = dist(e, p);
    if (d > 170) continue;
    const sp = toScreen(e.x, 46, e.y); if (!sp) continue;
    const a = Math.min(1, (170 - d) / 50);
    g.globalAlpha = a;
    g.font = '600 13px "Hind Siliguri", system-ui, sans-serif';
    const w = g.measureText(e.name).width + 12;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(sp.x - w / 2, sp.y - 18, w, 18);
    g.fillStyle = e.kind === 'police' || e.kind === 'constable' ? '#9fd0ff' : '#fff';
    g.fillText(e.name, sp.x, sp.y - 5);
    if (e.bubble) overlayBubble(g, sp.x + w / 2 + 8, sp.y - 14, e.bubble);
    if (e.state === 'arrested') { g.font = '20px system-ui'; g.fillText('🔗', sp.x, sp.y - 22); }
    g.globalAlpha = 1;
  }
  // ৳ bubbles are visible from further away — the main clue
  for (const e of G.ents) {
    if (!e.bubble || dist(e, p) <= 170 || dist(e, p) > 600) continue;
    const sp = toScreen(e.x, 46, e.y); if (sp) overlayBubble(g, sp.x, sp.y - 8, e.bubble);
  }
  // lunch signs
  if (isLunch()) for (const o of officers()) {
    if (dist({ x: o.desk.x, y: o.desk.queueY }, p) > 400) continue;
    const sp = toScreen(o.desk.x, 30, o.desk.counterY); if (!sp) continue;
    g.font = '700 13px "Hind Siliguri", system-ui'; g.fillStyle = '#fff6d0'; g.fillRect(sp.x - 46, sp.y - 12, 92, 20);
    g.fillStyle = '#a33'; g.fillText('লাঞ্চ বিরতি', sp.x, sp.y + 3);
  }
  // floating effects
  for (const f of G.fx) {
    const sp = toScreen(f.x, 40, f.y); if (!sp) continue;
    if (f.flash) {
      g.strokeStyle = `rgba(80,160,255,${1 - f.t / 1.6})`; g.lineWidth = 4;
      g.beginPath(); g.arc(sp.x, sp.y + 20, 10 + f.t * 70, 0, 7); g.stroke(); g.lineWidth = 1; continue;
    }
    g.globalAlpha = Math.max(0, 1 - f.t / 1.6);
    g.font = 'bold 20px "Hind Siliguri", system-ui, sans-serif';
    g.fillStyle = '#000'; g.fillText(f.text, sp.x + 1, sp.y - f.t * 40 + 1);
    g.fillStyle = f.color; g.fillText(f.text, sp.x, sp.y - f.t * 40);
    g.globalAlpha = 1;
  }
  // crosshair
  const cx = innerWidth / 2, cy = innerHeight / 2;
  g.fillStyle = focus ? '#ffd34a' : 'rgba(255,255,255,.8)';
  g.beginPath(); g.arc(cx, cy, focus ? 5 : 2.5, 0, 7); g.fill();
  // compass arrow to the current counter
  const s = currentStep();
  if (s >= 0) {
    const ts = officers().filter(o => o.step === s);
    const near = ts.sort((a, b) => dist({ x: a.desk.x, y: a.desk.queueY }, p) - dist({ x: b.desk.x, y: b.desk.queueY }, p))[0];
    const dx = near.desk.x - p.x, dy = near.desk.queueY - p.y;
    if (Math.hypot(dx, dy) > 70) {
      const ang = Math.atan2(dx, -dy) - G.yaw;           // 0 = straight ahead
      g.save(); g.translate(cx, 92); g.rotate(ang);
      g.fillStyle = 'rgba(255,211,74,.95)'; g.strokeStyle = 'rgba(0,0,0,.5)';
      g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 8); g.lineTo(0, 3); g.lineTo(-11, 8); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.font = '600 12px "Hind Siliguri", system-ui'; g.fillStyle = '#fff'; g.fillText(`কাউন্টার ${toBn(counterNo(near))} · ${toBn(Math.round(Math.hypot(dx, dy) / 20))} মিটার`, cx, 120);
    }
  }
  drawMinimap(g);
  // touch joystick
  if (R3.touchMove) {
    const j = R3.touchMove;
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    g.beginPath(); g.arc(j.ox, j.oy, 46, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(j.ox + R3.joy.x * 46, j.oy + R3.joy.y * 46, 20, 0, 7); g.fill();
  }
}

function overlayBubble(g, x, y, text) {
  g.fillStyle = '#fff'; rr(g, x - 11, y - 12, 22, 20, 6); g.fill();
  g.beginPath(); g.moveTo(x - 5, y + 8); g.lineTo(x - 9, y + 14); g.lineTo(x + 1, y + 8); g.fill();
  g.fillStyle = text === '৳' ? '#2a8a3a' : '#333'; g.font = 'bold 15px system-ui'; g.textAlign = 'center';
  g.fillText(text, x, y + 4);
}

function drawMinimap(g) {
  const small = innerWidth < 760;
  const W = small ? 120 : 170, H = small ? 100 : 140, sc = small ? 0.2 : 0.24;
  const x0 = innerWidth - W - 12, y0 = small ? 96 : 62;
  const p = G.player;
  g.save();
  g.beginPath(); rr(g, x0, y0, W, H, 10); g.clip();
  g.fillStyle = '#1b231e'; g.fillRect(x0, y0, W, H);
  const ox = x0 + W / 2 - p.x * sc, oy = y0 + H / 2 - p.y * sc;
  g.globalAlpha = 0.9;
  g.drawImage(staticMap, ox, oy, WORLD_W * sc, WORLD_H * sc);
  g.globalAlpha = 1;
  const s = currentStep();
  for (const o of officers()) if (o.step === s) { g.fillStyle = '#ffd34a'; g.beginPath(); g.arc(ox + o.desk.x * sc, oy + o.desk.queueY * sc, 4, 0, 7); g.fill(); }
  for (const e of G.ents) if (e.kind === 'police') { g.fillStyle = '#4da3ff'; g.beginPath(); g.arc(ox + e.x * sc, oy + e.y * sc, 3.5, 0, 7); g.fill(); }
  // player arrow
  g.translate(x0 + W / 2, y0 + H / 2); g.rotate(G.yaw);
  g.fillStyle = '#ff4a3a'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); rr(g, x0, y0, W, H, 10); g.stroke(); g.lineWidth = 1;
}

// ---------- look / move input ----------
// Capture the mouse so it turns the view freely. Browsers only allow this right after
// a click or key press, so it is called from those handlers.
function lockPointer() {
  if (R3.isTouch || !G || G.over || G.dialog || G.paused) return;
  if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
}
function setupLookInput() {
  const playing = () => G && !G.over && !G.dialog && !G.paused;
  canvas.addEventListener('click', lockPointer);
  document.addEventListener('pointerlockchange', () => {
    const hint = document.querySelector('#look-hint');
    if (hint) hint.hidden = document.pointerLockElement === canvas || R3.isTouch;
  });
  // the view follows the mouse — no button needs to be held
  addEventListener('mousemove', ev => {
    if (!playing() || R3.isTouch) return;
    const locked = document.pointerLockElement === canvas;
    if (!locked && ev.target !== canvas && ev.target !== document.body) return;   // over HUD buttons
    G.yaw += ev.movementX * 0.0024;
    G.pitch = Math.max(-1.1, Math.min(1.0, G.pitch - ev.movementY * 0.0024));
    R3.mouseX = ev.clientX;
    const hint = document.querySelector('#look-hint');
    if (hint && !hint.hidden && Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2) hint.hidden = true;
  });
  // touch: left half = joystick, right half = look; quick tap = talk
  const touches = new Map();
  canvas.addEventListener('touchstart', ev => {
    R3.isTouch = true;
    for (const tc of ev.changedTouches) {
      const left = tc.clientX < innerWidth * 0.45;
      touches.set(tc.identifier, { left, x: tc.clientX, y: tc.clientY, sx: tc.clientX, sy: tc.clientY, t: performance.now() });
      if (left && !R3.touchMove) R3.touchMove = { id: tc.identifier, ox: tc.clientX, oy: tc.clientY };
    }
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', ev => {
    for (const tc of ev.changedTouches) {
      const s = touches.get(tc.identifier); if (!s) continue;
      if (R3.touchMove && R3.touchMove.id === tc.identifier) {
        const dx = tc.clientX - R3.touchMove.ox, dy = tc.clientY - R3.touchMove.oy;
        const l = Math.min(1, Math.hypot(dx, dy) / 46), a = Math.atan2(dy, dx);
        R3.joy.x = Math.cos(a) * l; R3.joy.y = Math.sin(a) * l;
      } else if (playing()) {
        G.yaw += (tc.clientX - s.x) * 0.006;
        G.pitch = Math.max(-1.1, Math.min(1.0, G.pitch - (tc.clientY - s.y) * 0.006));
      }
      s.x = tc.clientX; s.y = tc.clientY;
    }
    ev.preventDefault();
  }, { passive: false });
  const end = ev => {
    for (const tc of ev.changedTouches) {
      const s = touches.get(tc.identifier); touches.delete(tc.identifier);
      if (R3.touchMove && R3.touchMove.id === tc.identifier) { R3.touchMove = null; R3.joy.x = R3.joy.y = 0; }
      else if (s && playing() && Math.hypot(tc.clientX - s.sx, tc.clientY - s.sy) < 10 && performance.now() - s.t < 300 && focus) interact(focus);
    }
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
}

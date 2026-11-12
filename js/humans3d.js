// ============================================================
//  মানুষ — realistic procedural humans (no model files)
//  Built in metres with real proportions, then scaled to world
//  units (1 m ≈ 21.7). Smooth shapes, a real face, clothes,
//  and a walk cycle with bending knees and elbows.
// ============================================================

const HM = 21.7;
const _hg = {}, _hmat = {}, _htex = {};
const hg = (k, f) => _hg[k] || (_hg[k] = f());

function skinMat(c) {
  const k = 's' + c;
  return _hmat[k] || (_hmat[k] = new THREE.MeshStandardMaterial({ color: lin(shade(c, 1.1)), roughness: 0.55 }));
}
function flatMat(c, extra) {
  const k = 'f' + c + (extra ? JSON.stringify(extra) : '');
  return _hmat[k] || (_hmat[k] = new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: 0.8 }, extra)));
}
function patTex(kind) {
  if (_htex[kind]) return _htex[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  if (kind === 'check') {                       // gamchha / lungi style checks
    g.fillStyle = 'rgba(0,0,0,.30)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 6, 64); g.fillRect(0, i, 64, 6); }
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 10; i < 64; i += 16) { g.fillRect(i, 0, 2, 64); g.fillRect(0, i, 64, 2); }
  } else if (kind === 'stripe') {
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 3, 64);
  } else {                                       // woven cotton noise
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 1); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(kind === 'check' ? 4 : 3, kind === 'check' ? 4 : 3);
  return (_htex[kind] = t);
}
function clothMat(c, kind = 'plain', ds = false) {
  const k = 'c' + c + kind + ds;
  return _hmat[k] || (_hmat[k] = new THREE.MeshStandardMaterial({ color: lin(c), map: patTex(kind), roughness: 0.92, side: ds ? THREE.DoubleSide : THREE.FrontSide }));
}
function shade(hex, f) {                          // darken/lighten a colour
  const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString();
}

// ---------- shared geometry ----------
const V2 = (x, y) => new THREE.Vector2(x, y);
const G_TORSO_M = () => hg('torsoM', () => new THREE.LatheGeometry([V2(0.135, 0), V2(0.14, 0.05), V2(0.145, 0.16), V2(0.155, 0.3), V2(0.163, 0.42), V2(0.165, 0.47), V2(0.145, 0.52), V2(0.1, 0.55), V2(0.05, 0.565), V2(0.001, 0.57)], 20));
const G_TORSO_F = () => hg('torsoF', () => new THREE.LatheGeometry([V2(0.13, 0), V2(0.128, 0.06), V2(0.122, 0.16), V2(0.142, 0.3), V2(0.15, 0.4), V2(0.152, 0.46), V2(0.135, 0.51), V2(0.09, 0.545), V2(0.045, 0.56), V2(0.001, 0.565)], 20));
const G_SPH = () => hg('sph', () => new THREE.SphereGeometry(1, 16, 12));
const G_SPH_LO = () => hg('sphlo', () => new THREE.SphereGeometry(1, 10, 8));
function G_LIMB(r1, r2, len) {
  return hg(`limb${r1},${r2},${len}`, () => { const g = new THREE.CylinderGeometry(r1, r2, len, 12); g.translate(0, -len / 2, 0); return g; });
}
function G_SKIRT(r1, r2, len) {
  return hg(`skirt${r1},${r2},${len}`, () => { const g = new THREE.CylinderGeometry(r1, r2, len, 20, 1, true); g.translate(0, -len / 2, 0); return g; });
}
const G_HEAD = () => hg('head', () => new THREE.SphereGeometry(0.1, 24, 18));
const G_HAIR_TOP = () => hg('hairTop', () => new THREE.SphereGeometry(0.105, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52));
const G_HAIR_BACK = () => hg('hairBack', () => new THREE.SphereGeometry(0.104, 18, 8, Math.PI, Math.PI, Math.PI * 0.42, Math.PI * 0.28));
const G_BEARD = () => hg('beard', () => new THREE.SphereGeometry(0.08, 20, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4));
const G_TUPI = () => hg('tupi', () => new THREE.SphereGeometry(0.1, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.3));
const G_HIJAB = () => hg('hijab', () => new THREE.SphereGeometry(0.115, 24, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.8));
const G_COLLAR = () => hg('collar', () => new THREE.TorusGeometry(0.058, 0.014, 6, 18));
const G_RIM = () => hg('rim', () => new THREE.TorusGeometry(0.016, 0.0026, 6, 16));
const G_CYL = (r1, r2, h, s = 18) => hg(`cyl${r1},${r2},${h}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
const G_BOX = (w, h, d) => hg(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));

// ---------- build a person ----------
function personMesh(L) {
  if (!L.pattern) L.pattern = L.uniform ? 'plain' : pick(['plain', 'plain', 'plain', 'check', 'stripe']);
  const root = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(HM); root.add(rig);
  const detail = [];                                  // hidden when far away (LOD)
  const M = (geo, mat, x, y, z, parent, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts.s) m.scale.set(opts.s[0], opts.s[1], opts.s[2]);
    if (opts.r) m.rotation.set(opts.r[0], opts.r[1], opts.r[2]);
    if (opts.shadow) m.castShadow = true;
    if (opts.detail) detail.push(m);
    parent.add(m); return m;
  };

  let shirt = L.shirt, pants = L.pants;
  const police = L.uniform === 'police', officer = L.uniform === 'officer';
  if (police) { shirt = '#5d6878'; pants = '#3a4250'; }
  if (officer) pants = '#2a2f3a';
  if (L.panjabi) pants = '#e9e5da';                     // white pajama
  const skin = skinMat(L.skin);
  const shirtM = clothMat(shirt, L.pattern);
  const pantsM = clothMat(pants, 'plain');
  const hairM = flatMat('#17110d');
  const shoeM = flatMat(police || officer ? '#151515' : pick(['#2a1d14', '#151515', '#4a3524']));
  const lipM = flatMat(shade(L.skin, 0.72));
  const female = L.female;
  const longSleeve = officer || L.panjabi || female;
  const lungi = !!L.lungi;

  // ----- hips & legs -----
  const hips = new THREE.Group(); hips.position.y = 0.95; rig.add(hips);
  M(G_SPH(), female ? clothMat(pants) : (lungi ? clothMat(L.lungi, 'check') : pantsM), 0, 0, 0, hips, { s: [0.155, 0.11, 0.105], shadow: true });
  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx, -0.02, 0); hips.add(hip);
    const thighM = lungi ? skin : (female ? clothMat(pants) : pantsM);
    const thigh = M(G_LIMB(0.072, 0.056, 0.44), thighM, 0, 0, 0, hip, { shadow: true });
    if (lungi) thigh.visible = false;
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    M(G_LIMB(0.054, 0.04, 0.44), lungi ? skin : (female ? clothMat(pants) : pantsM), 0, 0, 0, knee, { shadow: true });
    const foot = new THREE.Group(); foot.position.y = -0.44; knee.add(foot);
    if (lungi) {                                    // bare feet in sandals
      M(G_SPH_LO(), skin, 0, -0.02, 0.035, foot, { s: [0.042, 0.028, 0.11] });
      M(G_BOX(0.09, 0.012, 0.24), flatMat('#3b2a1c'), 0, -0.048, 0.035, foot);
    } else {
      M(G_SPH_LO(), shoeM, 0, -0.025, 0.04, foot, { s: [0.05, 0.042, 0.125], shadow: true });
    }
    return { hip, knee };
  };
  const lL = leg(-0.088), lR = leg(0.088);
  let skirt = null;
  if (lungi) skirt = M(G_SKIRT(0.16, 0.2, 0.8), clothMat(L.lungi, 'check', true), 0, 0.05, 0, hips, { shadow: true, s: [1, 1, 0.8] });
  else if (female) skirt = M(G_SKIRT(0.135, 0.22, 0.52), clothMat(shirt, L.pattern, true), 0, 0.06, 0, hips, { shadow: true, s: [1, 1, 0.75] });
  else if (L.panjabi) skirt = M(G_SKIRT(0.136, 0.19, 0.5), clothMat(shirt, L.pattern, true), 0, 0.06, 0, hips, { shadow: true, s: [1, 1, 0.72] });

  // ----- torso -----
  const spine = new THREE.Group(); hips.add(spine);
  const torso = M(female ? G_TORSO_F() : G_TORSO_M(), shirtM, 0, -0.03, 0, spine, { s: [1, 1, 0.64], shadow: true });
  if (!female && !L.panjabi) {
    M(G_CYL(0.141, 0.141, 0.035), flatMat(police ? '#1b1b1b' : '#2a1f18'), 0, 0.0, 0, spine, { s: [1, 1, 0.66] });                 // belt
    M(G_BOX(0.035, 0.026, 0.01), flatMat('#b8a160'), 0, 0.0, 0.094, spine, { detail: true });                                          // buckle
  }
  M(G_COLLAR(), clothMat(shade(shirt, 1.08)), 0, 0.535, 0.0, spine, { r: [Math.PI / 2, 0, 0], s: [1, 0.66, 1], detail: true });
  M(G_BOX(0.014, 0.42, 0.006), clothMat(shade(shirt, 0.86)), 0, 0.3, 0.104, spine, { detail: true });                                  // button placket
  if (!female) M(G_BOX(0.06, 0.07, 0.006), clothMat(shade(shirt, 0.9)), 0.07, 0.38, 0.106, spine, { detail: true });                  // chest pocket
  if (officer) {
    M(G_BOX(0.03, 0.3, 0.008), flatMat('#7a2630'), 0, 0.37, 0.108, spine);                       // tie
    M(G_BOX(0.045, 0.065, 0.006), flatMat('#f4f4f4'), -0.07, 0.3, 0.108, spine, { detail: true }); // ID card
    M(G_BOX(0.045, 0.014, 0.007), flatMat('#1d4f91'), -0.07, 0.33, 0.109, spine, { detail: true });
  }
  if (police) {
    for (const sx of [-0.13, 0.13]) M(G_BOX(0.07, 0.012, 0.09), flatMat('#2d3440'), sx, 0.535, 0, spine, { detail: true }); // epaulettes
    M(G_BOX(0.03, 0.03, 0.008), flatMat('#d9c26a'), 0.07, 0.4, 0.108, spine, { detail: true });                             // badge
    M(G_BOX(0.06, 0.012, 0.007), flatMat('#ffffff'), -0.07, 0.4, 0.108, spine, { detail: true });                            // name tag
  }
  if (female) {                                                                                  // orna across the chest
    M(G_SKIRT(0.075, 0.2, 0.22), clothMat(L.hijab || '#7a2d4a', 'plain', true), 0, 0.6, -0.005, spine, { s: [1, 1, 0.75], shadow: true });
  }

  // ----- arms -----
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx, 0.49, 0); spine.add(sh);
    M(G_SPH(), shirtM, 0, -0.01, 0, sh, { s: [0.047, 0.05, 0.047] });
    M(G_LIMB(0.048, 0.04, 0.29), shirtM, 0, 0, 0, sh, { shadow: true });
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    M(G_LIMB(0.039, 0.031, 0.25), longSleeve ? shirtM : skin, 0, 0, 0, el);
    if (!longSleeve) M(G_CYL(0.043, 0.043, 0.03), shirtM, 0, 0.0, 0, el);       // short sleeve cuff
    const hand = new THREE.Group(); hand.position.y = -0.25; el.add(hand);
    M(G_SPH_LO(), skin, 0, -0.045, 0.005, hand, { s: [0.03, 0.05, 0.02] });
    M(G_SPH_LO(), skin, sx > 0 ? -0.02 : 0.02, -0.03, 0.015, hand, { s: [0.012, 0.028, 0.012], detail: true });   // thumb
    return { sh, el, hand };
  };
  const aL = arm(-0.19), aR = arm(0.19);

  // ----- neck & head -----
  M(G_CYL(0.042, 0.05, 0.11, 12), skin, 0, 0.6, 0, spine);
  const head = new THREE.Group(); head.position.set(0, 0.675, 0.008); head.scale.setScalar(1.1); spine.add(head);
  M(G_HEAD(), skin, 0, 0, 0, head, { s: [0.88, 1.1, 0.98], shadow: true });
  M(G_SPH(), skin, 0, -0.048, 0.012, head, { s: [0.072, 0.062, 0.076] });                            // jaw & chin
  const face = new THREE.Group(); head.add(face); detail.push(face);
  M(G_SPH_LO(), skin, 0, -0.008, 0.087, face, { s: [0.014, 0.027, 0.022], r: [-0.2, 0, 0] });       // nose bridge
  M(G_SPH_LO(), skin, 0, -0.03, 0.09, face, { s: [0.019, 0.013, 0.016] });                           // nose tip
  for (const sx of [-1, 1]) {
    M(G_SPH_LO(), skin, sx * 0.088, 0, -0.004, face, { s: [0.012, 0.028, 0.02] });                   // ears
    M(G_SPH_LO(), flatMat('#f1ece2'), sx * 0.034, 0.012, 0.077, face, { s: [0.013, 0.009, 0.008] }); // eye white
    M(G_SPH_LO(), flatMat('#24160e'), sx * 0.034, 0.012, 0.084, face, { s: [0.0068, 0.0068, 0.004] }); // iris
    M(G_BOX(0.034, 0.0065, 0.008), hairM, sx * 0.035, 0.033, 0.086, face, { r: [0, 0, -sx * 0.1] });  // eyebrow
  }
  M(G_BOX(0.036, 0.009, 0.008), lipM, 0, -0.052, 0.083, face);                                       // lips
  if (L.beard) {
    M(G_BEARD(), hairM, 0, -0.025, 0.006, head, { s: [1.0, 1.05, 1.05] });
    M(G_BOX(0.042, 0.009, 0.01), hairM, 0, -0.042, 0.088, face);                                     // moustache
  }
  if (female) {
    M(G_HIJAB(), flatMat(L.hijab || '#2d2d2d', { side: THREE.DoubleSide }), 0, 0.004, -0.004, head, { s: [0.92, 1.1, 1.02], shadow: true });
  } else {
    if (!L.bald) M(G_HAIR_TOP(), hairM, 0, 0.006, -0.006, head, { s: [0.9, 1.08, 1.02] });
    M(G_HAIR_BACK(), hairM, 0, 0, 0, head, { s: [0.9, 1.08, 1.02] });
  }
  if (L.cap && !L.uniform) M(G_TUPI(), flatMat('#f6f6f2'), 0, 0.03, -0.004, head, { s: [0.92, 1, 1.02] });
  if (police) {
    M(G_CYL(0.108, 0.098, 0.06), flatMat('#2d3440'), 0, 0.085, -0.004, head);
    M(G_CYL(0.122, 0.112, 0.024), flatMat('#2d3440'), 0, 0.122, -0.004, head);
    M(G_BOX(0.13, 0.008, 0.07), flatMat('#151a22'), 0, 0.06, 0.095, head, { r: [0.25, 0, 0] });
    M(G_BOX(0.022, 0.022, 0.006), flatMat('#d9c26a'), 0, 0.1, 0.106, head, { detail: true });
  }
  if (L.glasses) {
    for (const sx of [-1, 1]) M(G_RIM(), flatMat('#111'), sx * 0.034, 0.012, 0.092, face);
    M(G_BOX(0.02, 0.003, 0.003), flatMat('#111'), 0, 0.014, 0.093, face);
  }

  const o = { root, rig, hips, spine, head, skirt, legL: lL.hip, legR: lR.hip, kneeL: lL.knee, kneeR: lR.knee,
    armL: aL.sh, armR: aR.sh, elbowL: aL.el, elbowR: aR.el, handR: aR.hand, detail,
    wp: Math.random() * 6, wa: 0, headYaw: 0, lookT: 0, lookTarget: 0 };
  return o;
}

// ---------- per-frame sync + animation ----------
function syncPeople(t, dt = 0.016) {
  const seen = new Set();
  const lunch = isLunch();
  const p = G.player;
  const pIn = p.y < 640;
  for (const e of G.ents) {
    if (e === p) continue;
    seen.add(e.id);
    let o = R3.people.get(e.id);
    const av = e.look.avatar && RB.templates[e.look.avatar] ? e.look.avatar : null;
    if (!o || o.lookRef !== e.look || (av && !o.rb)) {
      if (o) R3.scene.remove(o.root);
      const prev = o;
      o = (av && rbPerson(av)) || personMesh(e.look);
      Object.assign(o, { wp: Math.random() * 6, wa: 0, headYaw: 0, lookT: 0, lookTarget: 0 });
      o.lookRef = e.look;
      if (prev) { o.ang = prev.ang; }
      if (!o.rb && e.holding === 'file') {
        const f = new THREE.Mesh(G_BOX(0.02, 0.3, 0.22), flatMat('#e3cf86'));
        f.position.set(0, -0.08, 0.05); o.handR.add(f);
      }
      if (o.ang == null) o.ang = FACE_ANG[e.face] || 0;
      o.px = e.x; o.py = e.y;
      R3.people.set(e.id, o); R3.scene.add(o.root);
    }
    // visibility: hide people you cannot possibly see (other side of the building wall, far away)
    const d = dist(e, p);
    const sameSide = (e.y < 640) === pIn;
    const visible = !(e.kind === 'officer' && lunch) && d < 1100 && (sameSide || d < 300);
    o.root.visible = visible;
    const dx = e.x - o.px, dy = e.y - o.py;
    o.px = e.x; o.py = e.y;
    if (!visible) continue;
    if (o.detail) for (const m of o.detail) m.visible = d < 380;

    // facing
    const moved = Math.hypot(dx, dy);
    let target = o.ang;
    if (e.moving && moved > 0.05) target = Math.atan2(dx, dy);
    else if (!e.moving) target = FACE_ANG[e.face] != null ? FACE_ANG[e.face] : o.ang;
    if (G.speaker === e) target = Math.atan2(p.x - e.x, p.y - e.y);         // turn to face you while talking
    let diff = target - o.ang; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    o.ang += diff * Math.min(1, dt * 8);
    o.root.position.set(e.x, 0, e.y);
    o.root.rotation.y = o.ang;

    // walk cycle driven by distance travelled (feet don't slide)
    const wantWalk = e.moving && moved > 0.05 ? 1 : 0;
    o.wa += (wantWalk - o.wa) * Math.min(1, dt * 8);
    o.wp += (moved / HM) / 1.35 * Math.PI * 2;
    const amp = o.wa * (e.speed > 90 ? 1.25 : 1);
    const s = Math.sin(o.wp), c = Math.cos(o.wp);
    const P = {
      legL: -s * 0.5 * amp, legR: s * 0.5 * amp,
      kneeL: amp * (0.08 + 0.85 * Math.max(0, c)), kneeR: amp * (0.08 + 0.85 * Math.max(0, -c)),
      bob: -0.028 * amp * Math.abs(s) + 0.012 * amp, hipsYaw: -s * 0.07 * amp, spineYaw: s * 0.12 * amp,
    };

    // arms: natural swing, slightly away from the body
    let shL = s * 0.42 * amp, shR = -s * 0.42 * amp;
    let elL = -(0.12 + 0.45 * amp * Math.max(0, -s)), elR = -(0.12 + 0.45 * amp * Math.max(0, s));
    let shLz = -0.09, shRz = 0.09, lean = 0, nod = 0;
    // idle: breathing and weight shift
    const br = Math.sin(t * 1.9 + e.phase);
    P.hipsRoll = (1 - o.wa) * Math.sin(t * 0.6 + e.phase) * 0.025;

    if (e.kind === 'officer') { shL = shR = -0.6; elL = elR = -0.8; shLz = -0.12; shRz = 0.12; }
    if (!o.rb && (e.state === 'queue' || e.holding === 'file')) elR = Math.min(elR, -0.9 + amp * 0.5);
    if (e.bubble === '৳') { lean = 0.12; shR = -0.5 + Math.sin(t * 4) * 0.15; elR = -1.2; }    // whispering, rubbing fingers
    if (e.state === 'arrested') { shL = shR = 0.5; elL = elR = -1.0; shLz = 0.25; shRz = -0.25; lean = 0.15; }
    if (G.speaker === e) {                                                                // talking to you — gestures
      shR = -0.55 + Math.sin(t * 3.4) * 0.22; elR = -1.0 + Math.sin(t * 4.6 + 1) * 0.3; shRz = 0.2;
      if (e.kind === 'dalal') { shL = -0.35 + Math.sin(t * 2.7) * 0.15; elL = -0.9; }
      nod = Math.sin(t * 3) * 0.05;
    }
    Object.assign(P, { armL: shL, armR: shR, armLz: shLz, armRz: shRz, elbowL: elL, elbowR: elR, lean: lean + br * 0.01 });

    // head: look at you when you're close (people notice you), otherwise glance around
    o.lookT -= dt;
    let look = o.lookTarget;
    if (G.speaker === e || (d < 150 && e.kind !== 'officer') || (e.state === 'approach')) {
      look = Math.atan2(p.x - e.x, p.y - e.y) - o.ang;
      look = Math.atan2(Math.sin(look), Math.cos(look));
    } else if (o.lookT <= 0) { o.lookT = rand(2, 5); o.lookTarget = Math.random() < 0.5 ? 0 : rand(-0.7, 0.7); }
    look = Math.max(-1.1, Math.min(1.1, look));
    o.headYaw += (look - o.headYaw) * Math.min(1, dt * 5);
    P.nod = nod + (d < 150 ? -0.04 : 0); P.headYaw = o.headYaw;
    if (o.rb) rbPose(o, P);
    else {
      o.legL.rotation.x = P.legL; o.legR.rotation.x = P.legR;
      o.kneeL.rotation.x = P.kneeL; o.kneeR.rotation.x = P.kneeR;
      o.hips.position.y = 0.95 + P.bob; o.hips.rotation.set(0, P.hipsYaw, P.hipsRoll);
      o.spine.rotation.set(P.lean, P.spineYaw, 0);
      o.spine.scale.set(1, 1 + br * 0.006, 1 + br * 0.012);
      if (o.skirt) o.skirt.rotation.x = s * 0.06 * amp;
      o.armL.rotation.set(P.armL, 0, P.armLz); o.armR.rotation.set(P.armR, 0, P.armRz);
      o.elbowL.rotation.x = P.elbowL; o.elbowR.rotation.x = P.elbowR;
      o.head.rotation.set(P.nod, P.headYaw, 0);
    }
  }
  for (const [id, o] of R3.people) if (!seen.has(id)) { R3.scene.remove(o.root); R3.people.delete(id); }
}

// ---------- dialog portrait rendered from the same 3D person ----------
function portrait3D(look, canvas2d) {
  if (!R3.renderer) return false;
  const W = canvas2d.width, H = canvas2d.height;
  if (!R3.pScene) {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color('#33433b');
    sc.add(new THREE.HemisphereLight('#f4f0ff', '#6a5a4a', 0.95));
    const key = new THREE.DirectionalLight('#fff0dc', 0.75); key.position.set(30, 50, 60); sc.add(key);
    const rim = new THREE.DirectionalLight('#9fc4ff', 0.35); rim.position.set(-40, 30, -40); sc.add(rim);
    R3.pScene = sc;
    R3.pCam = new THREE.PerspectiveCamera(26, W / H, 1, 200);
    R3.pRT = new THREE.WebGLRenderTarget(W, H);
    R3.pRT.texture.encoding = THREE.sRGBEncoding;
    R3.pBuf = new Uint8Array(W * H * 4);
  }
  if (R3.pPerson) R3.pScene.remove(R3.pPerson.root);
  let o = look.avatar && RB.templates[look.avatar] ? rbPortrait(look.avatar, R3.pScene, R3.pCam) : null;
  if (!o) {
    o = personMesh(look);
    o.armL.rotation.set(0, 0, -0.09); o.armR.rotation.set(0, 0, 0.09);
    o.elbowL.rotation.x = o.elbowR.rotation.x = -0.15;
    o.root.rotation.y = -0.25;
    R3.pScene.add(o.root);
    R3.pCam.position.set(3, 36, 36); R3.pCam.lookAt(0, 33.2, 0);
  }
  R3.pPerson = o;
  R3.pScene.environment = R3.envMap || null;
  const r = R3.renderer;
  const prevShadow = r.shadowMap.enabled;
  r.setRenderTarget(R3.pRT);
  r.render(R3.pScene, R3.pCam);
  r.readRenderTargetPixels(R3.pRT, 0, 0, W, H, R3.pBuf);
  r.setRenderTarget(null);
  r.shadowMap.enabled = prevShadow;
  const g = canvas2d.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {                       // WebGL rows are bottom-up
    img.data.set(R3.pBuf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.putImageData(img, 0, 0);
  return true;
}

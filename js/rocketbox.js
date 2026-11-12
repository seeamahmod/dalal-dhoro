// ============================================================
//  বাস্তব মানুষ — realistic people from the Microsoft Rocketbox
//  avatar library (MIT licence, see assets/people/LICENSE).
//  The models are loaded once, cloned per person, and their Biped
//  skeletons are posed every frame by the same walk / gesture code
//  that drives the built-in procedural people.
// ============================================================

const AVATAR_SETS = {
  citizenM: ['Male_Adult_15', 'Male_Adult_17', 'Male_Adult_04', 'Male_Adult_05', 'Male_Adult_07', 'Male_Adult_10'],
  citizenF: ['Female_Adult_06', 'Female_Adult_10', 'Female_Adult_11'],
  officerM: ['Business_Male_04', 'Business_Male_05', 'Business_Male_06'],
  officerF: ['Business_Female_01'],
  police: ['Police_Male_01'],
};
// what each person is wearing — used in the notebook and police reports
const AVATAR_DESC = {
  Male_Adult_15: 'সাদা পাঞ্জাবি, টুপি, দাড়ি',
  Male_Adult_17: 'নীল-সাদা জ্যাকেট, ক্যাপ, দাড়ি',
  Male_Adult_04: 'কোঁকড়া চুল, কালো জ্যাকেট',
  Male_Adult_05: 'পাকা দাড়ি, ঘিয়া কোটি',
  Male_Adult_07: 'ধূসর ব্লেজার, খোঁচা দাড়ি',
  Male_Adult_10: 'লাল জ্যাকেট',
  Female_Adult_06: 'সাদা হিজাব',
  Female_Adult_10: 'কালো বোরকা',
  Female_Adult_11: 'বাদামি কার্ডিগান',
  Business_Male_04: 'টাক মাথা, ধূসর কোটি',
  Business_Male_05: 'কালো স্যুট, বেগুনি শার্ট',
  Business_Male_06: 'সাদা শার্ট',
  Business_Female_01: 'কালো স্যুট',
  Police_Male_01: 'পুলিশের পোশাক',
};
const AVATAR_FEMALE = n => /Female/.test(n);
const RB = { templates: {}, rest: {}, loaded: 0, total: 0, failed: false };

function loadAvatars(onProgress) {
  if (!THREE.FBXLoader || !THREE.SkeletonUtils) { RB.failed = true; return; }
  const names = [...new Set(Object.values(AVATAR_SETS).flat())];
  RB.total = names.length;
  const manager = new THREE.LoadingManager();
  // the FBX files point at the artist's original .tga paths — we supply our own textures instead
  const dummy = { setPath() { return this; }, setCrossOrigin() { return this; }, load() { return new THREE.Texture(); } };
  manager.addHandler(/\.tga$/i, dummy);
  const loader = new THREE.FBXLoader(manager);
  const tl = new THREE.TextureLoader();
  for (const n of names) {
    const done = () => { RB.loaded++; onProgress && onProgress(RB.loaded, RB.total); };
    loader.load(`assets/people/${n}/model.fbx`, obj => {
      try { RB.templates[n] = prepAvatar(n, obj, tl); } catch (err) { console.warn('avatar', n, err); }
      done();
    }, undefined, err => { console.warn('avatar', n, err); done(); });
  }
}

const HAS_OPACITY = new Set(['Business_Female_01', 'Female_Adult_06', 'Female_Adult_10', 'Female_Adult_11', 'Male_Adult_04', 'Male_Adult_05', 'Male_Adult_07', 'Male_Adult_10']);

function prepAvatar(name, obj, tl) {
  const base = `assets/people/${name}/`;
  const tex = f => { const t = tl.load(base + f); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return t; };
  const body = tex('body.jpg'), head = tex('head.jpg');
  const opacity = HAS_OPACITY.has(name) ? tex('opacity.png') : null;
  const equip = name === 'Police_Male_01' ? tex('equipment.jpg') : null;
  const mk = (map, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, skinning: true, roughness: 0.68, metalness: 0 }, extra));
  const mats = {
    body: mk(body), head: mk(head),
    opacity: opacity ? mk(opacity, { transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false }) : null,
    equip: equip ? mk(equip) : null,
  };
  const pickMat = m => {
    const n = (m && m.name || '').toLowerCase();
    if (n.includes('opacity') || n.includes('hair') || n.includes('lash')) return mats.opacity || mats.head;
    if (n.includes('head') || n.includes('eye') || n.includes('teeth') || n.includes('tongue')) return mats.head;
    if (n.includes('equip')) return mats.equip || mats.body;
    if (n.includes('pistol')) return null;
    return mats.body;
  };
  // the FBX files carry the artist's scene lights/cameras — drop them (they'd flood the scene with light)
  const junk = [];
  obj.traverse(m => { if (m.isLight || m.isCamera) junk.push(m); });
  for (const j of junk) j.parent.remove(j);
  obj.traverse(m => {
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material = m.material.map(x => pickMat(x) || mats.body);
    else { const pm = pickMat(m.material); if (pm) m.material = pm; else m.visible = false; }
    if (/pistol/i.test(m.name)) m.visible = false;
    m.castShadow = true; m.receiveShadow = false;
  });

  // normalise: real-world height, standing on y = 0, facing +z
  const inner = new THREE.Group(); inner.add(obj);
  const root = new THREE.Group(); root.add(inner);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const h = box.max.y - box.min.y;
  const target = (AVATAR_FEMALE(name) ? 1.63 : 1.72) * HM;
  const s = target / h;
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  root.updateMatrixWorld(true);
  const bone = n => obj.getObjectByName(n);
  const headB = bone('Bip01_Head'), nose = bone('Bip01_MNose');
  if (headB && nose) {
    const a = headB.getWorldPosition(new THREE.Vector3()), b = nose.getWorldPosition(new THREE.Vector3());
    if (b.z < a.z) { inner.rotation.y = Math.PI; root.updateMatrixWorld(true); }
  }

  // rest-pose data per bone (same for every clone)
  const rest = {};
  const rootInv = new THREE.Quaternion();
  const BONES = ['Pelvis', 'Spine1', 'Spine2', 'Head', 'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand'];
  for (const k of BONES) {
    const b = bone('Bip01_' + k); if (!b) continue;
    const C = b.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
    rest[k] = { q0: b.quaternion.clone(), C, Ci: C.clone().invert(), pos: b.getWorldPosition(new THREE.Vector3()) };
  }
  // arms hang down instead of the T-pose
  for (const side of ['L', 'R']) {
    const ua = rest[side + '_UpperArm'], fa = rest[side + '_Forearm'];
    if (!ua || !fa) continue;
    const dir = fa.pos.clone().sub(ua.pos).normalize();
    const out = Math.sign(dir.x) || 1;
    ua.down = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(out * 0.16, -1, 0.03).normalize());
    ua.out = out;
  }
  // which leg/arm is on the -x side (matches the procedural rig's "L")
  rest.swapLR = rest.L_Thigh && rest.L_Thigh.pos.x > 0;
  rest.headY = headB ? headB.getWorldPosition(new THREE.Vector3()).y : 35;
  RB.rest[name] = rest;
  return root;
}

// a posable clone for one person
function rbPerson(name) {
  const tpl = RB.templates[name];
  if (!tpl) return null;
  const root = THREE.SkeletonUtils.clone(tpl);
  const rest = RB.rest[name];
  const bones = {};
  root.traverse(o => { if (o.isBone && o.name.startsWith('Bip01_')) bones[o.name.slice(6)] = o; });
  const inner = root.children[0];
  return { root, inner, baseY: inner.position.y, bones, rest, rb: true, name };
}

// pose: same parameters the procedural rig uses (radians; character space, +z forward)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler();
const AX = new THREE.Vector3(1, 0, 0);
function setBone(o, key, R) {
  const b = o.bones[key], r = o.rest[key];
  if (!b || !r) return;
  // q = C⁻¹ · R · C · q0  (R is a rotation in character space, relative to the rest pose)
  b.quaternion.copy(r.Ci).multiply(R).multiply(r.C).multiply(r.q0);
}
function rbPose(o, P) {
  const sw = o.rest.swapLR;
  const L = sw ? 'R_' : 'L_', Rr = sw ? 'L_' : 'R_';
  const rx = a => _q2.setFromAxisAngle(AX, a).clone();
  // legs
  setBone(o, L + 'Thigh', rx(P.legL)); setBone(o, Rr + 'Thigh', rx(P.legR));
  setBone(o, L + 'Calf', rx(P.kneeL)); setBone(o, Rr + 'Calf', rx(P.kneeR));
  // torso & head
  setBone(o, 'Pelvis', _q3.setFromEuler(_e.set(0, P.hipsYaw, P.hipsRoll, 'YXZ')).clone());
  setBone(o, 'Spine1', _q3.setFromEuler(_e.set(P.lean, P.spineYaw, 0, 'YXZ')).clone());
  setBone(o, 'Head', _q3.setFromEuler(_e.set(P.nod, P.headYaw, 0, 'YXZ')).clone());
  // arms: hang down, then swing (x) and spread (z); elbows bend around the character's x axis
  for (const [side, sh, shz, el] of [[L, P.armL, P.armLz, P.elbowL], [Rr, P.armR, P.armRz, P.elbowR]]) {
    const ua = o.rest[side + 'UpperArm']; if (!ua || !ua.down) continue;
    const spread = shz;                     // same convention as the procedural rig (−x arm: negative = outward)
    const Rarm = new THREE.Quaternion().setFromEuler(_e.set(sh, 0, spread, 'XYZ')).multiply(ua.down);
    setBone(o, side + 'UpperArm', Rarm);
    const bend = new THREE.Quaternion().setFromAxisAngle(AX, el);
    const Rfore = Rarm.clone().invert().multiply(bend).multiply(Rarm);
    setBone(o, side + 'Forearm', Rfore);
  }
  o.inner.position.y = o.baseY + P.bob * HM;
}

// render a dialog portrait from the real model
function rbPortrait(name, sc, cam) {
  const o = rbPerson(name); if (!o) return null;
  rbPose(o, { legL: 0, legR: 0, kneeL: 0, kneeR: 0, hipsYaw: 0, hipsRoll: 0, lean: 0, spineYaw: 0, nod: 0, headYaw: 0,
    armL: 0, armR: 0, armLz: -0.05, armRz: 0.05, elbowL: -0.12, elbowR: -0.12, bob: 0 });
  o.root.rotation.y = -0.3;
  sc.add(o.root);
  const hy = o.rest.headY;
  cam.position.set(4, hy + 1.5, 26); cam.lookAt(0, hy - 1.5, 0);
  return o;
}

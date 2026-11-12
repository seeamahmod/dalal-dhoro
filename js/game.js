// ============================================================
//  দালাল ধরো — গেম লজিক, AI, সংলাপ ও UI
// ============================================================

const $ = s => document.querySelector(s);
const canvas = $('#game');
const CLOCK = 1;                 // game minutes per real second
const DAY_START = 9 * 60, DAY_END = 17 * 60, LUNCH_A = 13 * 60, LUNCH_B = 14 * 60;
const SAVE_KEY = 'dalal-dhoro-v1';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const round50 = n => Math.max(50, Math.round(n / 50) * 50);
const bn = n => toBn(n);                                            // Bangla digits
const tk = n => '৳' + toBn(Math.round(n).toLocaleString('en-IN'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] != null ? v[k] : '');

let G = null;                    // current run
let save = loadSave();
let staticMap = null;
const keys = {};
let nextId = 1;

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { best: {} }; }
  catch (e) { return { best: {} }; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

// ---------------- Entities ----------------
function mk(kind, props) {
  return Object.assign({
    id: nextId++, kind, x: 0, y: 0, path: [], speed: 60, moving: false, face: 'down',
    phase: Math.random() * 6, state: 'idle', timer: rand(0, 3), cool: 0, look: randomLook(),
  }, props);
}

const COLOR_NAMES = {
  '#e8e8e8': 'সাদা', '#5b7fa6': 'নীল', '#a63d3d': 'লাল', '#3d7a5b': 'সবুজ', '#c9a24a': 'সরিষা রঙের',
  '#6a5a8a': 'বেগুনি', '#d98c4a': 'কমলা', '#4a8a9a': 'ফিরোজা', '#8a8a8a': 'ধূসর', '#f2e6c8': 'ঘিয়া',
  '#2e4a6a': 'গাঢ় নীল', '#b85c8a': 'গোলাপি',
};
function describe(L) {
  if (L.avatar && AVATAR_DESC[L.avatar]) return AVATAR_DESC[L.avatar];
  const c = COLOR_NAMES[L.shirt] || '';
  if (L.female) return `${c} কামিজ, ওড়না`;
  const bits = [`${c} ${L.panjabi ? 'পাঞ্জাবি' : 'শার্ট'}`];
  if (L.lungi) bits.push('লুঙ্গি');
  if (L.cap) bits.push('সাদা টুপি');
  if (L.beard) bits.push('দাড়ি');
  if (L.glasses) bits.push('চশমা');
  return bits.join(', ');
}

// ---------------- Paths & movement ----------------
function buildPath(fx, fy, tx, ty) {
  const pts = [];
  const lv = y => y < 632 ? 0 : (y < 1180 ? 1 : 2);
  const cross = (a, b) => (a > 362 && b < 296) || (a < 296 && b > 362);
  let cur = lv(fy), dst = lv(ty), cy = fy;
  if (cur === dst && cur === 0 && cross(fy, ty)) {
    pts.push({ x: 800, y: fy > 362 ? 380 : 280 }, { x: 800, y: fy > 362 ? 280 : 380 });
  }
  while (cur !== dst) {
    if (cur > dst) {
      if (cur === 2) { pts.push({ x: 800, y: 1205 }, { x: 800, y: 1150 }); cy = 1150; cur = 1; }
      else {
        pts.push({ x: 800, y: 690 }, { x: 800, y: 600 }); cy = 600; cur = 0;
        if (cross(cy, ty)) pts.push({ x: 800, y: 380 }, { x: 800, y: 280 });
      }
    } else {
      if (cur === 0) {
        if (cross(cy, 600)) pts.push({ x: 800, y: 280 }, { x: 800, y: 380 });
        pts.push({ x: 800, y: 600 }, { x: 800, y: 690 }); cy = 690; cur = 1;
      } else { pts.push({ x: 800, y: 1150 }, { x: 800, y: 1205 }); cy = 1205; cur = 2; }
    }
  }
  pts.push({ x: tx, y: ty });
  return pts;
}
function goTo(e, x, y) { e.path = buildPath(e.x, e.y, x, y); e.stuck = 0; }

function blocked(x, y, r) {
  for (const o of G.layout.obs) {
    if (x + r > o.x && x - r < o.x + o.w && y + r * 0.6 > o.y && y - r * 0.6 < o.y + o.h) return true;
  }
  return false;
}
// people keep a personal-space gap from the player (first-person camera)
function crowded(e, nx, ny) {
  const p = G.player;
  if (e === p) {
    for (const o of G.ents) {
      if (o === p || o.kind === 'officer' || o.remove) continue;
      const d0 = Math.hypot(o.x - p.x, o.y - p.y), d1 = Math.hypot(o.x - nx, o.y - ny);
      if (d1 < 20 && d1 < d0) return true;
    }
    return false;
  }
  if (e.kind === 'constable' || e.state === 'arrested' || e.state === 'leaving' || e.state === 'toQueue') return false;
  if (e.state === 'queue') { const d0q = Math.hypot(e.x - p.x, e.y - p.y), d1q = Math.hypot(nx - p.x, ny - p.y); return d1q < 18 && d1q < d0q; }
  const d0 = Math.hypot(e.x - p.x, e.y - p.y), d1 = Math.hypot(nx - p.x, ny - p.y);
  return d1 < 30 && d1 < d0;
}
function stepMove(e, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) { e.moving = false; return 0; }
  const sp = e.speed * dt;
  const mx = dx / len * Math.min(sp, len), my = dy / len * Math.min(sp, len);
  const ox = e.x, oy = e.y;
  if (!blocked(e.x + mx, e.y, 9) && !crowded(e, e.x + mx, e.y)) e.x += mx;
  if (!blocked(e.x, e.y + my, 9) && !crowded(e, e.x, e.y + my)) e.y += my;
  e.x = Math.max(-60, Math.min(WORLD_W + 60, e.x));
  e.y = Math.max(20, Math.min(WORLD_H - 8, e.y));
  e.moving = true;
  if (Math.abs(mx) > Math.abs(my)) e.face = mx > 0 ? 'right' : 'left'; else e.face = my > 0 ? 'down' : 'up';
  return Math.hypot(e.x - ox, e.y - oy);
}
function followPath(e, dt) {
  if (!e.path.length) { e.moving = false; return true; }
  const t = e.path[0];
  const dx = t.x - e.x, dy = t.y - e.y;
  if (Math.hypot(dx, dy) < 6) { e.path.shift(); if (!e.path.length) { e.moving = false; return true; } return false; }
  const moved = stepMove(e, dx, dy, dt);
  if (moved < e.speed * dt * 0.25) {
    e.stuck = (e.stuck || 0) + dt;
    if (e.stuck > 0.8) {                       // nudge sideways to get around corners
      const side = (e.id % 2 ? 1 : -1);
      if (!blocked(e.x + side * 3, e.y, 9)) e.x += side * 3; else if (!blocked(e.x, e.y - 3, 9)) e.y -= 3;
    }
    if (e.stuck > 2.5) { e.path = []; e.stuck = 0; e.moving = false; return true; }
  } else e.stuck = 0;
  return false;
}

// ---------------- Run setup ----------------
function startRun(officeIdx) {
  const office = OFFICES[officeIdx];
  const layout = buildLayout(office);
  staticMap = renderStaticMap(office, layout);            // 2D map → minimap
  build3D(office, layout);
  nextId = 1;
  G = {
    officeIdx, office, layout,
    min: DAY_START, money: office.startMoney,
    steps: office.steps.map(s => ({ ...s, status: 'todo' })),
    ents: [], vehicles: [], fx: [], toasts: [], notes: new Map(), jobs: [],
    hasCopy: false, dialog: null, speaker: null, over: false, paused: false, yaw: 0, pitch: -0.04,
    pitchCool: 6, lastQueue: null, t: 0,
    serverDown: Math.random() < 0.7 ? { a: randi(630, 900), len: randi(25, 45) } : null,
    announced: {},
    stats: { fees: 0, ghush: 0, dalalLost: 0, recovered: 0, dalalsCaught: 0, officersExposed: 0, falseReports: 0, fooled: 0 },
  };
  const usedNames = new Set();
  const nameOf = (female) => {
    let n; let tries = 0;
    do {
      n = pick(female ? FEMALE_NAMES : MALE_NAMES);
      if (tries > 6 || Math.random() < 0.5) n += ' ' + pick(female ? SURNAMES_F : SURNAMES_M);
      tries++;
    } while (usedNames.has(n) && tries < 60);
    usedNames.add(n); return n;
  };

  // player
  G.player = mk('player', { name: 'আপনি', speed: 150, look: { ...randomLook({ female: false }), shirt: '#f2e6c8', lungi: null, panjabi: false, cap: false }, holding: 'file' });
  Object.assign(G.player, layout.spots.playerStart);
  G.player.face = 'up';
  G.ents.push(G.player);

  // officers (honest or not — hidden from the player)
  const offNames = [...OFFICER_NAMES].sort(() => Math.random() - 0.5);
  layout.desks.forEach((d, i) => {
    const step = Math.floor(i / 2);
    const name = offNames[i % offNames.length];
    G.ents.push(mk('officer', {
      name, queue: [], serveT: 5, deskIdx: i, step, desk: d, x: d.x, y: d.officerY, face: 'down',
      honest: Math.random() > office.dishonestChance,
      look: officerLook(name),
    }));
  });
  // make sure no step is 100% clean: at least one dishonest officer per step most of the time
  for (let s = 0; s < office.steps.length; s++) {
    const pair = G.ents.filter(e => e.kind === 'officer' && e.step === s);
    if (pair.every(o => o.honest) && Math.random() < 0.8) pick(pair).honest = false;
  }
  // queues: honest desks have long lines, crooked desks look "fast"
  for (const o of officers()) {
    const q = o.honest ? randi(2, maxQ(o) - 1) : randi(0, 1);
    o.queue = []; o.serveT = serveTime(o);
    for (let k = 0; k < q; k++) {
      const sp0 = slotPos(o, k);
      const c = mk('citizen', { x: sp0.x, y: sp0.y, face: 'up', state: 'queue', holding: 'file' });
      c.look = randomLook(); c.name = nameOf(c.look.female);
      o.queue.push(c); G.ents.push(c);
    }
  }
  // wandering citizens
  for (let k = 0; k < 9; k++) {
    const zone = k < 5 ? 'yard' : 'in';
    const p = randomPoint(zone);
    const c = mk('citizen', { x: p.x, y: p.y, zone, state: 'wander', speed: rand(40, 60), holding: Math.random() < .5 ? 'file' : null });
    c.name = nameOf(c.look.female); G.ents.push(c);
  }
  // dalals — look exactly like everyone else
  for (let k = 0; k < office.dalals; k++) {
    const zone = k < office.dalals * 0.6 ? 'gate' : (k % 2 ? 'yard' : 'in');
    const p = randomPoint(zone);
    const d = mk('dalal', {
      x: p.x, y: p.y, zone, state: 'wander', speed: rand(50, 65), taken: 0, refused: 0,
      price: Math.round(office.dalalPrice * rand(0.7, 1.3) / 100) * 100, cool: rand(0, 6),
      look: randomLook({ female: false }),
    });
    d.name = nameOf(false); G.ents.push(d);
  }
  // genuine helpful strangers — same opener as a dalal
  for (let k = 0; k < 3; k++) {
    const zone = k === 2 ? 'in' : 'gate';
    const p = randomPoint(zone);
    const h = mk('helper', { x: p.x, y: p.y, zone, state: 'wander', speed: rand(45, 60), cool: rand(10, 30), tips: 0 });
    h.name = nameOf(h.look.female); G.ents.push(h);
  }
  // police, info desk, vendors
  const sp = layout.spots;
  G.inLine = null; G.leaveAfter = null;
  G.ents.push(mk('police', { name: 'এসআই মাহবুব', ...sp.policeOut, look: randomLook({ female: false, uniform: 'police' }), face: 'down' }));
  G.ents.push(mk('police', { name: 'কনস্টেবল রফিক', ...sp.policeIn, look: randomLook({ female: false, uniform: 'police' }), face: 'up' }));
  G.ents.push(mk('info', { name: 'তথ্য ডেস্ক', ...sp.infoDesk, look: randomLook({ formal: true }), face: 'down' }));
  G.ents.push(mk('vendor', { name: 'চা-ওয়ালা হাশেম মামা', sub: 'tea', ...sp.teaSeller, look: { ...randomLook({ female: false }), lungi: '#2d5a8a', shirt: '#e8e8e8', cap: true } }));
  G.ents.push(mk('vendor', { name: 'ফটোকপির দোকান', sub: 'copy', ...sp.copySeller, look: randomLook({ female: false }) }));

  // traffic
  const types = ['rickshaw', 'rickshaw', 'rickshaw', 'cng', 'cng', 'bus', 'car'];
  for (let k = 0; k < 9; k++) {
    const dir = k % 2 ? 1 : -1;
    G.vehicles.push({ type: pick(types), dir, x: rand(0, WORLD_W), y: dir > 0 ? 1236 : 1294, speed: rand(30, 90), color: pick(['#2f6fb5', '#c0392b', '#2f8a5a', '#b5852f', '#7a3fb5']) });
  }

  assignAvatars();
  showScreen(null);
  $('#hud').hidden = false;
  $('#toasts').innerHTML = ''; $('#notebook').hidden = true; R3.turnTo = null;
  buildObjectives();
  toast(`অফিস খুলেছে সকাল ৯টায়। আপনার কাছে আছে ${tk(G.money)}। বিকাল ৫টার আগে কাজ শেষ করুন।`, 'info');
  toast('অচেনা লোকজন আপনার কাছে আসবে। কে দালাল, আপনি জানেন না।', 'warn');
  updateHud();
}
// an officer's body matches their name (female names → female officer)
const isFemaleName = n => /বেগম|ইয়াসমিন|আক্তার|মোসাম্মৎ|ফারহানা|নিলুফার|রোকেয়া/.test(n);
const officerLook = name => {
  const L = randomLook({ formal: true, uniform: 'officer', female: isFemaleName(name), shirt: pick(['#e8e8e8', '#dfe9f2', '#f2e6c8', '#cfd8e0']) });
  L.avatar = pick(AVATAR_SETS[L.female ? 'officerF' : 'officerM']);
  return L;
};
// give everyone a realistic Rocketbox model that fits their role (spread across the available faces)
function assignAvatars() {
  const next = {};
  const take = set => { const list = AVATAR_SETS[set]; if (next[set] == null) next[set] = randi(0, list.length - 1); return list[next[set]++ % list.length]; };
  for (const e of G.ents) {
    if (e === G.player || e.look.avatar) continue;
    if (e.kind === 'vendor') e.look.avatar = e.sub === 'tea' ? 'Male_Adult_05' : 'Male_Adult_17';
    else if (e.kind === 'police' || e.kind === 'constable') e.look.avatar = 'Police_Male_01';
    else if (e.kind === 'info') e.look.avatar = take(e.look.female ? 'officerF' : 'officerM');
    else e.look.avatar = take(e.look.female ? 'citizenF' : 'citizenM');
  }
}
// ---------------- Queues ----------------
const maxQ = o => o.desk.row === 'top' ? 4 : 5;                       // the line can't run into the furniture
const slotPos = (o, i) => ({ x: o.desk.x + (i % 2 ? 1.5 : -1.5), y: o.desk.queueY + i * 24 });
const serveTime = o => (o.honest || o.replaced) ? rand(7, 10) : rand(3, 5);   // game minutes per person
const atFront = o => o.queue[0] === G.player;

function joinQueue(o) {
  if (G.inLine) return;
  o.queue.push(G.player); G.inLine = o;
  const ahead = o.queue.length - 1;
  toast(ahead ? `কাউন্টার ${bn(counterNo(o))}-এর লাইনে দাঁড়ালেন। সামনে ${bn(ahead)} জন।` : `কাউন্টার ${bn(counterNo(o))}-এ কেউ নেই — সরাসরি সামনে।`, 'info');
}
function leaveQueue(msg) {
  const o = G.inLine; if (!o) return;
  o.queue = o.queue.filter(c => c !== G.player); G.inLine = null;
  if (msg) toast(msg, 'warn');
}
function updateQueues(dtMin, dt) {
  const stopped = isLunch() || isServerDown();
  for (const o of officers()) {
    const q = o.queue;
    q.forEach((c, i) => {
      if (c === G.player) return;
      if (c.state === 'toQueue') { if (followPath(c, dt)) c.state = 'queue'; return; }
      const s = slotPos(o, i);
      if (dist(c, s) > 1.5) { c.speed = 45; stepMove(c, s.x - c.x, s.y - c.y, dt); }
      else { c.moving = false; c.face = 'up'; }
    });
    // the officer serves whoever is at the front
    if (!stopped && q.length && q[0] !== G.player && q[0].state === 'queue' && dist(q[0], slotPos(o, 0)) < 4) {
      o.serveT -= dtMin;
      if (o.serveT <= 0) {
        const c = q.shift();
        c.state = 'wander'; c.zone = 'in'; c.speed = rand(40, 60); c.timer = 0;
        const t = randomPoint('in'); goTo(c, t.x, t.y);
        o.serveT = serveTime(o);
      }
    }
    if (q.length >= maxQ(o)) continue;
    const free = () => G.ents.filter(c => c.kind === 'citizen' && c.state === 'wander' && c.y < 632 && dist(c, G.player) > 60);
    // new people keep arriving and join the back of the line
    if (Math.random() < dtMin * (o.honest || o.replaced ? 0.06 : 0.02)) {
      const cs = free(); if (cs.length) {
        const c = pick(cs); const s = slotPos(o, q.length);
        c.state = 'toQueue'; c.holding = 'file'; goTo(c, s.x, s.y); q.push(c);
      }
    }
    // a dalal's client walks straight to the front of a crooked counter
    if (!o.honest && !o.replaced && q.length && !atFront(o) && Math.random() < dtMin * 0.025) {
      const cs = free(); if (cs.length) {
        const c = pick(cs); const s = slotPos(o, 0);
        c.state = 'toQueue'; c.holding = 'file'; goTo(c, s.x, s.y); q.unshift(c);
        c.bubble = '৳'; setTimeout(() => { c.bubble = null; }, 4000);
        if (G.inLine === o || dist(G.player, o.desk) < 260) {
          toast(`দালালের লোক লাইন ভেঙে কাউন্টার ${bn(counterNo(o))}-এর একদম সামনে ঢুকে গেল!`, 'bad');
          note(o, 'দালালের লোককে লাইন ছাড়াই সবার আগে কাজ করে দিল।');
        }
      }
    }
  }
}

const officers = () => G.ents.filter(e => e.kind === 'officer');
const currentStep = () => G.steps.findIndex(s => s.status === 'todo');
const isLunch = () => G.min >= LUNCH_A && G.min < LUNCH_B;
const isServerDown = () => G.serverDown && G.min >= G.serverDown.a && G.min < G.serverDown.a + G.serverDown.len;
const counterNo = o => o.deskIdx + 1;

// ---------------- Notebook ----------------
function note(e, text) {
  if (!G.notes.has(e.id)) G.notes.set(e.id, { e, name: e.name, desc: describe(e.look), lines: [] });
  const n = G.notes.get(e.id);
  if (text) n.lines.push(`${clockStr(G.min)} — ${text}`);
  renderNotebook();
}

// ---------------- Time & money ----------------
function addTime(m, why) {
  G.min += m;
  floatText(G.player.x, G.player.y - 50, `+${bn(m)} মিনিট`, '#ffcf5a');
  if (why) toast(`${why} (+${bn(m)} মিনিট)`, 'warn');
}
function spend(amount, kind) {
  G.money -= amount;
  floatText(G.player.x, G.player.y - 40, '-' + tk(amount), kind === 'fee' ? '#9fe29f' : '#ff7a6a');
  updateHud();
}
function clockStr(m) {
  m = Math.floor(m);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const part = h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : 'সন্ধ্যা';
  h = ((h + 11) % 12) + 1;
  return `${part} ${bn(h)}:${bn(String(mm).padStart(2, '0'))}`;
}

// ---------------- Main update ----------------
function update(dt) {
  if (!G) return;
  G.t += dt;
  for (const v of G.vehicles) {
    v.x += v.dir * v.speed * dt;
    if (v.x > WORLD_W + 80) v.x = -80; if (v.x < -80) v.x = WORLD_W + 80;
  }
  G.fx = G.fx.filter(f => (f.t += dt) < 1.6);
  if (G.over || G.dialog || G.paused) return;

  const ff = G.inLine && !atFront(G.inLine) ? 6 : 1;                 // waiting in line: time flies (but still counts)
  G.min += dt * CLOCK * ff;
  G.pitchCool -= dt;
  updateQueues(dt * CLOCK * ff, dt);
  if (G.leaveAfter && !G.dialog) { G.leaveAfter = null; leaveQueue(); }
  timeEvents();
  if (G.min >= DAY_END) return endRun(false, 'closed');

  updatePlayer(dt);
  for (const e of G.ents) {
    if (e === G.player) continue;
    e.cool -= dt;
    switch (e.kind) {
      case 'citizen': aiCitizen(e, dt); break;
      case 'dalal': aiDalal(e, dt); break;
      case 'helper': aiHelper(e, dt); break;
      case 'constable': aiConstable(e, dt); break;
    }
  }
  for (const j of G.jobs) {
    j.timer -= dt;
    if (j.timer <= 0 && !j.fired) { j.fired = true; dalalCheat(j); }
  }
  G.jobs = G.jobs.filter(j => !j.fired);
  G.ents = G.ents.filter(e => !e.remove);
  updatePrompt();
}

function timeEvents() {
  const a = G.announced;
  if (!a.lunch && G.min >= LUNCH_A) { a.lunch = 1; toast('দুপুর ১টা — লাঞ্চ ও নামাজের বিরতি। ২টা পর্যন্ত অফিসাররা সিটে নেই।', 'warn'); }
  if (!a.lunchEnd && G.min >= LUNCH_B) { a.lunchEnd = 1; toast('দুপুর ২টা — অফিসাররা (ধীরে ধীরে) ফিরছেন।', 'info'); }
  if (G.serverDown && !a.server && G.min >= G.serverDown.a) { a.server = 1; toast('"সার্ভার ডাউন" — সব কাউন্টারের কম্পিউটার বন্ধ।', 'warn'); }
  if (G.serverDown && !a.serverUp && G.min >= G.serverDown.a + G.serverDown.len) { a.serverUp = 1; toast('সার্ভার আবার চালু হয়েছে।', 'info'); }
  if (!a.late && G.min >= 16 * 60) { a.late = 1; toast('বিকাল ৪টা — অফিস বন্ধ হতে আর মাত্র এক ঘণ্টা!', 'bad'); }
}

function updatePlayer(dt) {
  const p = G.player;
  // first person: W/S forward-back, A/D strafe, arrow keys turn
  if (G.inLine) {
    const moving = keys.w || keys.s || keys.a || keys.d || keys.ArrowUp || keys.ArrowDown || R3.joy.x || R3.joy.y;
    if (moving && !atFront(G.inLine)) leaveQueue('লাইন ছেড়ে দিলেন — জায়গাটা গেল।');
    else if (!moving) {
      const sp = slotPos(G.inLine, G.inLine.queue.indexOf(p));
      if (dist(p, sp) > 1.5) { p.speed = 50; stepMove(p, sp.x - p.x, sp.y - p.y, dt); } else p.moving = false;
      if (keys.ArrowLeft) G.yaw -= 2.2 * dt;
      if (keys.ArrowRight) G.yaw += 2.2 * dt;
      return;
    }
  }
  if (keys.ArrowLeft) G.yaw -= 2.2 * dt;
  if (keys.ArrowRight) G.yaw += 2.2 * dt;
  let fw = 0, st = 0;
  if (keys.w || keys.ArrowUp) fw += 1;
  if (keys.s || keys.ArrowDown) fw -= 1;
  if (keys.a) st -= 1;
  if (keys.d) st += 1;
  if (R3.joy.x || R3.joy.y) { fw = -R3.joy.y; st = R3.joy.x; }
  p.speed = keys.Shift ? 175 : 115;
  const sy = Math.sin(G.yaw), cy = Math.cos(G.yaw);
  const dx = fw * sy + st * cy, dy = -fw * cy + st * sy;
  if (Math.abs(dx) + Math.abs(dy) > 0.05) stepMove(p, dx, dy, dt);
  else p.moving = false;
  if (p.y > 1340) p.y = 1340;
}

function wander(e, dt, zone) {
  if (followPath(e, dt)) {
    e.timer -= dt;
    if (e.timer <= 0) { const t = randomPoint(zone || e.zone); goTo(e, t.x, t.y); e.timer = rand(2, 6); }
  }
}

function aiCitizen(e, dt) {
  if (e.state === 'queue' || e.state === 'toQueue') return;
  wander(e, dt);
}

function canApproach(e) {
  return G.pitchCool <= 0 && e.cool <= 0 && !G.player.atCounter && dist(e, G.player) < 210 &&
    G.player.y < 1190 && !G.dialog;
}

function aiDalal(e, dt) {
  const p = G.player;
  switch (e.state) {
    case 'wander':
      if (e.refused < 3 && canApproach(e) && Math.random() < dt * 1.2) {
        e.state = 'approach'; e.timer = 9; G.pitchCool = 4; goTo(e, p.x, p.y); e.speed = 95; break;
      }
      if (followPath(e, dt)) {
        e.timer -= dt; e.bubble = null;
        if (e.timer <= 0) {
          const r = Math.random();
          const crooked = officers().filter(o => !o.honest && !o.replaced);
          if (r < 0.18 && crooked.length) {                // whisper to a crooked officer — a clue!
            const o = pick(crooked); goTo(e, o.desk.x + 34, o.desk.queueY - 2); e.state = 'visit'; e.timer = 5;
          } else if (r < 0.32) {                             // pester another citizen
            const cs = G.ents.filter(c => c.kind === 'citizen' && c.state === 'wander' && dist(c, e) < 500);
            if (cs.length) { const c = pick(cs); goTo(e, c.x + 20, c.y); e.state = 'pester'; e.timer = 5; e.target = c; }
            else { const t = randomPoint(e.zone); goTo(e, t.x, t.y); e.timer = rand(2, 5); }
          } else { const t = randomPoint(e.zone); goTo(e, t.x, t.y); e.timer = rand(2, 5); }
        }
      }
      break;
    case 'visit': case 'pester':
      if (followPath(e, dt)) {
        e.bubble = '৳'; e.face = e.state === 'visit' ? 'up' : 'left';
        e.timer -= dt; if (e.timer <= 0) { e.state = 'wander'; e.bubble = null; e.timer = 0; e.target = null; }
      }
      break;
    case 'approach':
      e.timer -= dt;
      if (e.timer <= 0 || G.player.atCounter) { e.state = 'wander'; e.speed = 58; e.cool = 8; break; }
      if (Math.random() < dt * 3) goTo(e, p.x, p.y);
      followPath(e, dt);
      if (dist(e, p) < 46) { e.state = 'wander'; e.speed = 58; e.path = []; e.moving = false; encounter(e); }
      break;
    case 'working':
      e.bubble = '…';
      followPath(e, dt);
      break;
    case 'seek':                                   // coming back to deliver the "news"
      if (G.dialog) break;
      if (Math.random() < dt * 3) goTo(e, p.x, p.y);
      followPath(e, dt);
      if (dist(e, p) < 48) { e.path = []; e.moving = false; const f = e.onReach; e.onReach = null; e.state = 'cheated'; f && f(); }
      break;
    case 'leaving':
      e.bubble = null;
      if (followPath(e, dt)) {
        e.state = 'gone'; e.remove = true;
        toast(`${e.name} ফোন ধরছে না… আপনার ${tk(e.taken)} নিয়ে উধাও!`, 'bad');
        note(e, `আপনার ${tk(e.taken)} নিয়ে পালিয়েছে। ফোন বন্ধ।`);
        G.stats.fooled++;
      }
      break;
    case 'cheated': case 'flee':
      e.bubble = null;
      if (dist(e, p) < 140 && Math.random() < dt * 2) {          // avoids you
        const ax = e.x + (e.x - p.x) * 2, ay = e.y + (e.y - p.y) * 2;
        goTo(e, Math.max(40, Math.min(1560, ax)), Math.max(700, Math.min(1150, ay)));
      }
      wander(e, dt, 'yard');
      break;
    case 'arrested':
      e.bubble = null; e.moving = false;
      if (e.escort) { e.path = [{ x: e.escort.x + 16, y: e.escort.y + 4 }]; followPath(e, dt); e.speed = 80; }
      break;
  }
}

function aiHelper(e, dt) {
  if (e.tips < 2 && canApproach(e) && Math.random() < dt * 0.35) {
    e.state = 'approach'; e.timer = 9; G.pitchCool = 4; e.speed = 85; goTo(e, G.player.x, G.player.y);
  }
  if (e.state === 'approach') {
    e.timer -= dt;
    if (e.timer <= 0) { e.state = 'wander'; e.speed = 52; return; }
    if (Math.random() < dt * 3) goTo(e, G.player.x, G.player.y);
    followPath(e, dt);
    if (dist(e, G.player) < 46) { e.state = 'wander'; e.speed = 52; e.path = []; encounter(e); }
    return;
  }
  wander(e, dt);
}

function aiConstable(e, dt) {
  if (e.state === 'grab') { e.timer -= dt; e.moving = false; if (e.timer <= 0) { e.state = 'escort'; e.path = buildPath(e.x, e.y, -50, 1236); e.speed = 80; } }
  else if (e.state === 'escort') {
    if (followPath(e, dt) || e.x < -40) { e.remove = true; if (e.prisoner) e.prisoner.remove = true; }
  }
}

// ---------------- Encounters (dalal or helper — same opening) ----------------
function encounter(e) {
  e.cool = 25; G.pitchCool = rand(9, 15);
  const v = vars(e);
  note(e, e.met ? null : 'এগিয়ে এসে "সাহায্য" করতে চাইল।');
  if (e.met) { (e.kind === 'dalal' ? dalalPitch : helperTalk)(e); return; }
  e.met = true;
  dialog(e, fill(pick(LINES.openers), v), [
    { label: 'হ্যাঁ, বলেন… (শুনুন)', fn: () => (e.kind === 'dalal' ? dalalPitch : helperTalk)(e) },
    { label: 'না, ধন্যবাদ। আমি নিজেই করব।', fn: () => { if (e.kind === 'dalal') { e.refused++; say(e, pick(LINES.dalalRefused)); } else say(e, 'ঠিক আছে ভাই, ভালো থাকবেন।'); } },
  ]);
}
function vars(e) {
  const s = currentStep();
  const st = G.steps[s >= 0 ? s : 0];
  return { step: st.name, desk: st.desk, office: G.office.name, amt: tk(e && e.price || 0), copy: G.office.copyName };
}

function dalalPitch(e) {
  const v = vars(e);
  const opts = [
    { label: `${tk(e.price)} দিন — ওনাকে দিয়ে করান`, cls: 'danger', fn: () => payDalal(e, e.price) },
  ];
  if (!e.haggled) opts.push({ label: 'অনেক বেশি! কম করেন (দরদাম)', fn: () => {
    e.haggled = true; e.price = Math.round(e.price * rand(0.6, 0.8) / 100) * 100;
    dialog(e, fill(pick(LINES.dalalNegotiate), { amt: tk(e.price) }), [
      { label: `ঠিক আছে, ${tk(e.price)} দিন`, cls: 'danger', fn: () => payDalal(e, e.price) },
      { label: 'না, লাগবে না।', fn: () => { e.refused++; say(e, pick(LINES.dalalRefused)); } },
    ]);
  } });
  opts.push({ label: 'না ভাই, আমি লাইনে দাঁড়াব। (না বলুন)', fn: () => { e.refused++; say(e, pick(LINES.dalalRefused)); } });
  opts.push({ label: 'আপনি দালাল! পুলিশকে বলব। (হুমকি দিন)', fn: () => {
    e.refused = 9; e.state = 'flee';
    say(e, 'কী বলেন ভাই! আমি তো হেল্প করতে চাইছিলাম… (সে তাড়াতাড়ি সরে পড়ল)');
    note(e, 'পুলিশের কথা বলতেই তাড়াহুড়ো করে সরে গেল।');
  } });
  note(e, `"${v.step}" করে দেওয়ার জন্য ${tk(e.price)} চাইল।`);
  const inLine = G.inLine && !atFront(G.inLine);
  const pitch = inLine ? fill(pick(LINES.dalalPitchQueue), { ...v, amt: tk(e.price), n: bn(G.inLine.queue.indexOf(G.player)) }) : fill(pick(LINES.dalalPitch), { ...v, amt: tk(e.price) });
  dialog(e, pitch, opts);
}

function payDalal(e, amt) {
  if (G.money < amt) { say(e, `ভাই, ${tk(amt)}-ও নাই? ঠিক আছে, পরে আসেন।`); return; }
  spend(amt, 'dalal');
  e.taken += amt; G.stats.dalalLost += amt;
  const s = currentStep();
  note(e, `"${G.steps[s].name}" করার জন্য ওকে ${tk(amt)} দিয়েছেন।`);
  say(e, fill(pick(LINES.dalalAccepted), vars(e)));
  e.state = 'working';
  const d = deskForStep(s);
  goTo(e, d.x + 40, d.queueY - 4);
  G.jobs.push({ d: e, step: s, timer: rand(14, 34), phase: 0 });
  toast(`${e.name} আপনার ফাইল নিয়ে "কাজ" করছে। ওর দিকে নজর রাখুন…`, 'info');
}
function deskForStep(s) { return officers().find(o => o.step === s).desk; }

function dalalCheat(j) {
  const e = j.d;
  if (e.state === 'arrested' || e.remove) return;
  const types = j.phase === 0 ? ['vanish', 'vanish', 'more', 'more', 'fake', 'fake', 'cant'] : ['vanish', 'cant'];
  const type = pick(types);
  if (type === 'vanish') {
    e.state = 'leaving'; e.speed = 90;
    e.path = buildPath(e.x, e.y, Math.random() < .5 ? -60 : WORLD_W + 60, 1236);
    return;
  }
  e.state = 'seek'; e.speed = 95;
  if (type === 'more') {
    const extra = Math.round(e.taken * rand(0.4, 0.8) / 100) * 100;
    e.onReach = () => {
      note(e, `ফিরে এসে আরও ${tk(extra)} চাইল।`);
      dialog(e, fill(pick(LINES.dalalMoreMoney), { amt: tk(extra) }), [
        { label: `আরও ${tk(extra)} দিন`, cls: 'danger', fn: () => {
          if (G.money < extra) { say(e, 'টাকা নাই? তাইলে কাজও নাই। আগের টাকা ফেরত হবে না।'); return; }
          spend(extra, 'dalal'); e.taken += extra; G.stats.dalalLost += extra;
          note(e, `আরও ${tk(extra)} দিয়েছেন।`);
          say(e, 'এই তো! আর ১৫ মিনিট, আমি আসতেছি।');
          e.state = 'working'; G.jobs.push({ d: e, step: j.step, timer: rand(12, 24), phase: 1 });
        } },
        { label: 'না! আমার টাকা ফেরত দেন।', fn: () => {
          say(e, 'টাকা তো বসরে দিয়ে দিছি ভাই। ফেরত হবে না। কাজও হবে না।');
          note(e, `আপনার ${tk(e.taken)} ফেরত দিতে রাজি হলো না।`); G.stats.fooled++;
        } },
      ]);
    };
  } else if (type === 'fake') {
    e.onReach = () => {
      const st = G.steps[j.step];
      dialog(e, pick(LINES.dalalFake), [{ label: 'স্লিপটা নিন', fn: () => {
        if (st.status === 'todo') { st.status = 'fake'; buildObjectives(); toast(`"${st.name}" সম্পন্ন দেখাচ্ছে (${e.name}-এর স্লিপ)।`, 'info'); }
        note(e, `"${st.name}"-এর একটা "রসিদ" দিল।`); checkWin();
      } }]);
    };
  } else {
    e.onReach = () => {
      note(e, `বলল কাজ হবে না — আপনার ${tk(e.taken)} রেখে দিল।`); G.stats.fooled++;
      dialog(e, pick(LINES.dalalCantDo), [{ label: '…', fn: () => { } }]);
    };
  }
}

function helperTalk(e) {
  e.tips++;
  note(e, 'বিনা পয়সায় পরামর্শ দিল। কিছুই চায়নি।');
  const r = Math.random() < 0.5 ? rumor() : pick(LINES.helperTips);
  say(e, r);
}

function rumor() {
  const s = Math.max(0, currentStep());
  const cands = officers().filter(o => o.step >= s);
  const o = pick(cands.length ? cands : officers());
  const truthful = Math.random() < 0.8;
  const good = o.honest === truthful;
  return fill(pick(good ? LINES.rumorGood : LINES.rumorBad), { c: bn(counterNo(o)) });
}

// ---------------- Talking (player initiated) ----------------
function interact(e) {
  if (!e || G.dialog) return;
  G.player.path = [];
  e.face = facing(e, G.player);
  switch (e.kind) {
    case 'officer': return talkOfficer(e);
    case 'dalal':
      if (e.state === 'working') return say(e, 'কাজ চলতেছে ভাই, একটু ধৈর্য ধরেন। আমি আসতেছি।');
      if (e.state === 'cheated') return say(e, 'কী চাই? আমি ব্যস্ত। (সে আপনার দিকে তাকাচ্ছেই না)');
      if (e.state === 'flee' || e.refused >= 3) return say(e, 'আমি কিছু জানি না ভাই।');
      return encounter(e);
    case 'helper': return e.met ? helperTalk(e) : encounter(e);
    case 'citizen': return talkCitizen(e);
    case 'police': return talkPolice(e);
    case 'info': return talkInfo(e);
    case 'vendor': return e.sub === 'tea' ? talkTea(e) : talkCopy(e);
    case 'charter': return showCharter();
    case 'acc': return talkACC();
    case 'queue': return joinQueue(e.o);
  }
}
function facing(a, b) { const dx = b.x - a.x, dy = b.y - a.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }

function talkCitizen(e) {
  if (!e.line) e.line = Math.random() < 0.55 ? rumor() : pick(LINES.citizenFlavor);
  note(e, e.noted ? null : `বলল: "${e.line}"`); e.noted = true;
  say(e, e.line);
}

function talkInfo(e) {
  const s = currentStep();
  if (s < 0) return say(e, 'আপনার সব কাজ শেষ। ভালো থাকবেন!');
  const st = G.steps[s];
  const c = officers().filter(o => o.step === s).map(o => bn(counterNo(o))).join(' অথবা ');
  let t = `আপনার পরের ধাপ "${st.name}" — কাউন্টার ${c}।`;
  if (st.fee) t += ` সরকারি ফি ${tk(st.fee)} — শুধু কাউন্টারে দেবেন এবং রসিদ নেবেন।`;
  if (st.copy && !G.hasCopy) t += ` আপনার ${G.office.copyName} লাগবে; ফটোকপির দোকান বাইরের মাঠে।`;
  t += ' টাকার বিনিময়ে কারও "সাহায্য" লাগে না। দালাল বিরক্ত করলে গেটের বা দরজার পাশের পুলিশকে জানান।';
  say(e, t);
}

function talkTea(e) {
  dialog(e, 'চা খাবেন মামা? দুধ চা ১৫ টাকা, রং চা ১০। (চা-ওয়ালারা সব খবর রাখে…)', [
    { label: `এক কাপ রং চা (${tk(10)})`, fn: () => { if (G.money < 10) return say(e, 'পরে দিয়েন।'); spend(10); addTime(5); say(e, 'নেন মামা। আর শোনেন — ' + rumor()); } },
    { label: 'না, থাক।', fn: () => { } },
  ]);
}
function talkCopy(e) {
  if (G.hasCopy) return say(e, 'আপনার কপি তো নিয়ে গেছেন। আর কিছু?');
  dialog(e, `ফটোকপি, কম্পোজ, প্রিন্ট। ${G.office.copyName}? পাতা ৫ টাকা, ২ কপি ${tk(10)}।`, [
    { label: `কপি করান (${tk(10)})`, fn: () => { if (G.money < 10) return; spend(10); addTime(5); G.hasCopy = true; toast(`আপনার কাছে এখন ${G.office.copyName} আছে।`, 'info'); updateHud(); say(e, 'এই নেন। সত্যায়ন লাগলে অফিসারকে দিয়ে করায় নিবেন, টাকা লাগে না।'); } },
    { label: 'না, লাগবে না।', fn: () => { } },
  ]);
}

// ---------------- Officers ----------------
function talkOfficer(o) {
  if (isLunch()) return dialog(o, LINES.lunch, [{ label: 'আচ্ছা…', fn: () => { } }], { name: `কাউন্টার ${bn(counterNo(o))}`, title: 'খালি চেয়ার' });
  // any officer can spot a fake dalal slip
  const fk = G.steps.findIndex(s => s.status === 'fake');
  if (fk >= 0) {
    G.steps[fk].status = 'todo'; buildObjectives();
    G.stats.fooled++;
    addTime(15);
    return dialog(o, fill(LINES.fakeSlip, { step: G.steps[fk].name }), [{ label: 'হায় হায়…', fn: () => toast('দালালের স্লিপটা জাল ছিল। ওই ধাপ আবার করতে হবে।', 'bad') }]);
  }
  if (!G.inLine && o.queue.length === 0) joinQueue(o);                // nobody waiting — walk right up
  if (G.inLine === o && !atFront(o)) { toast(`এখনো আপনার পালা আসেনি — সামনে ${bn(o.queue.indexOf(G.player))} জন।`, 'info'); return; }
  if (G.inLine !== o || !atFront(o)) {
    const front = o.queue.find(c => c !== G.player);
    return dialog(front || o, pick(LINES.lineCut), [{ label: 'আচ্ছা, পিছনে যাচ্ছি…', fn: () => { } }]);
  }
  G.leaveAfter = o;                                                    // after talking you step away from the counter
  const s = currentStep();
  const st = G.steps[o.step];
  if (st.status === 'done') return say(o, LINES.officerDone);
  if (o.step !== s) return say(o, fill(LINES.officerWrongStep, { desk: st.desk, step: G.steps[s].name }));

  const crooked = !o.honest && !o.replaced;
  const opts = [];
  let text;
  if (isServerDown()) {
    if (!crooked) return say(o, LINES.serverDown);
    o.demand = o.demand || round50(G.office.bribe * rand(0.7, 1.3));
    text = fill(LINES.serverDownBad, { amt: tk(o.demand) });
  } else if (st.copy && !G.hasCopy) {
    if (!crooked) return say(o, fill(LINES.officerNeedCopy, { copy: G.office.copyName }));
    o.demand = o.demand || round50(G.office.bribe * rand(0.7, 1.3));
    text = fill(LINES.officerNeedCopy, { copy: G.office.copyName }) + ` …অথবা ${tk(o.demand)} দেন, কপি ছাড়াই করে দেই।`;
  } else if (!crooked) {
    return honestServe(o, st);
  } else {
    o.demand = o.demand || round50(G.office.bribe * rand(0.6, 1.4));
    text = fill(pick(LINES.officerDemand), { amt: tk(o.demand) });
  }
  o.demanded = true;
  note(o, `কাউন্টার ${bn(counterNo(o))}: আপনার কাছে ${tk(o.demand)} "স্পিড মানি" চাইল।`);
  opts.push({ label: `${tk(o.demand)} ঘুষ দিন`, cls: 'danger', fn: () => payBribe(o, st) });
  opts.push({ label: 'না বলুন — "সিটিজেন চার্টারে এটা লেখা নাই!"', fn: () => insist(o, st) });
  opts.push({ label: 'দুদক হটলাইন ১০৬-এ কল দিন (প্রমাণ আছে)', cls: 'good', fn: () => accReport(o, true) });
  opts.push({ label: 'চলে যান', fn: () => { } });
  dialog(o, text, opts);
}

function honestServe(o, st) {
  const done = () => completeStep(o.step, o);
  if (st.fee) {
    if (G.money < st.fee) return endRun(false, 'broke');
    return dialog(o, pick(LINES.officerHonest) + ' ' + fill(LINES.officerFee, { amt: tk(st.fee) }), [{ label: `সরকারি ফি ${tk(st.fee)} দিন`, cls: 'good', fn: done }]);
  }
  dialog(o, pick(LINES.officerHonest), [{ label: 'ধন্যবাদ!', cls: 'good', fn: done }]);
}

function payBribe(o, st) {
  const need = o.demand + (st.fee || 0);
  if (G.money < need) return say(o, 'এইটুকু টাকা নিয়ে আসছেন? কাল আসেন।');
  spend(o.demand); G.stats.ghush += o.demand;
  note(o, `${tk(o.demand)} ঘুষ দিয়েছেন।`);
  toast(`${tk(o.demand)} ঘুষ দিলেন। কাজ হলো… কিন্তু দুর্নীতিই জিতল।`, 'bad');
  completeStep(o.step, o);
}

function insist(o, st) {
  o.refusals = (o.refusals || 0) + 1;
  const chance = Math.min(0.55, 0.2 + o.refusals * 0.12);
  if (Math.random() < chance) {
    note(o, 'নিয়মের কথা বলায় শেষে রাজি হলো।');
    return dialog(o, LINES.officerGiveIn, [{ label: 'ধন্যবাদ।', cls: 'good', fn: () => completeStep(o.step, o) }]);
  }
  G.lastQueue = null;
  const m = randi(30, 55);
  dialog(o, pick(LINES.officerStall), [{ label: 'হুম…', fn: () => addTime(m, `কাউন্টার ${bn(counterNo(o))} আপনার ফাইল আটকে রাখল`) }]);
}

function completeStep(i, o) {
  const st = G.steps[i];
  if (st.fee) {
    if (G.money < st.fee) return endRun(false, 'broke');
    spend(st.fee, 'fee'); G.stats.fees += st.fee;
  }
  st.status = 'done';
  G.lastQueue = null;
  floatText(o.x, o.y - 50, '✓ ' + st.name, '#8ff08f');
  toast(`✓ ${st.name} — সম্পন্ন।`, 'good');
  buildObjectives(); updateHud();
  checkWin();
}

function checkWin() {
  if (G.steps.every(s => s.status === 'done')) return setTimeout(() => endRun(true), 600);
  if (G.steps.every(s => s.status !== 'todo')) {
    // only fake slips remain — the final desk catches it
    const fk = G.steps.findIndex(s => s.status === 'fake');
    G.steps[fk].status = 'todo'; buildObjectives(); G.stats.fooled++;
    const last = officers().find(o => o.step === G.steps.length - 1);
    dialog(last, fill(LINES.fakeSlip, { step: G.steps[fk].name }), [{ label: 'হায় হায়…', fn: () => { } }]);
  }
}

// ---------------- ACC (দুদক, hotline 106) ----------------
const ACC_SPEAKER = { name: 'দুদক হটলাইন ১০৬', title: 'দুর্নীতি দমন কমিশন', look: null };
function talkACC() {
  const os = officers();
  const opts = os.slice(0, 10).map(o => ({
    label: `কাউন্টার ${bn(counterNo(o))} — ${G.steps[o.step].desk}${o.demanded ? ' (আপনার কাছে টাকা চেয়েছে)' : ''}${o.replaced ? ' (নতুন অফিসার)' : ''}`,
    fn: () => accReport(o, o.demanded),
  }));
  opts.push({ label: 'বাতিল', fn: () => { } });
  dialog(ACC_SPEAKER,
    'দুর্নীতিবাজ অফিসারের বিরুদ্ধে অভিযোগ করতে ১০৬-এ কল করুন। প্রমাণ থাকলে (আপনার কাছে টাকা চাইলে) দুদক টিম সাথে সাথে অভিযান চালাতে পারে। প্রমাণ ছাড়া অভিযোগে সময় লাগে — আর মিথ্যা অভিযোগে সবার সময় নষ্ট হয়।', opts);
}

function accReport(o, proof) {
  if (o.replaced && o.honest) {
    G.stats.falseReports++;
    return dialog(ACC_SPEAKER, 'এই অফিসার সবে এখানে যোগ দিয়েছেন, ওনার বিরুদ্ধে কোনো অভিযোগ নেই। অভিযোগ গ্রহণ করা হলো না।', [{ label: 'আচ্ছা', fn: () => addTime(10) }]);
  }
  if (!o.honest && proof) {
    return dialog(ACC_SPEAKER, `১০৬: "ধন্যবাদ। দুদকের এনফোর্সমেন্ট টিম আসছে।" …চল্লিশ মিনিট পর দুদকের জ্যাকেট পরা কর্মকর্তারা এসে কাউন্টার ${bn(counterNo(o))}-কে হাতেনাতে ধরলেন।`, [
      { label: 'ন্যায়বিচার!', cls: 'good', fn: () => { addTime(40); exposeOfficer(o, true); } }]);
  }
  if (!o.honest) {
    if (Math.random() < 0.7) return dialog(ACC_SPEAKER, `১০৬: "কাউন্টার ${bn(counterNo(o))}-এর বিরুদ্ধে আরও অভিযোগ আছে।" অনেকক্ষণ পর পরিদর্শক দল এসে তাকে সাময়িক বরখাস্ত করল।`, [
      { label: 'অবশেষে।', cls: 'good', fn: () => { addTime(75); exposeOfficer(o, false); } }]);
    return dialog(ACC_SPEAKER, '১০৬: "আপনার অভিযোগ নথিভুক্ত হয়েছে। ব্যবস্থা নিতে প্রমাণ দরকার।" আজ কিছুই হলো না।', [{ label: 'হুম।', fn: () => addTime(40) }]);
  }
  G.stats.falseReports++;
  dialog(ACC_SPEAKER, `১০৬ একজন পরিদর্শক পাঠাল। কাউন্টার ${bn(counterNo(o))}-এর ফাইল আর রেজিস্টার একদম ঠিকঠাক। "দয়া করে মিথ্যা অভিযোগ করবেন না।"`, [
    { label: 'দুঃখিত…', fn: () => addTime(50, 'মিথ্যা অভিযোগ') }]);
}

function exposeOfficer(o, finishStep) {
  G.stats.officersExposed++;
  note(o, 'দুদকের হাতে ধরা পড়ে সাময়িক বরখাস্ত।');
  floatText(o.x, o.y - 50, 'দুদক কর্তৃক বরখাস্ত', '#ffdf5a');
  flash(o.x, o.y);
  const newName = pick(OFFICER_NAMES.filter(n => !officers().some(x => x.name === n)));
  Object.assign(o, { name: newName, honest: true, replaced: true, demanded: false, demand: 0, look: officerLook(newName) });
  toast(`কাউন্টার ${bn(counterNo(o))}-এর দুর্নীতিবাজ অফিসার বরখাস্ত। ${newName} দায়িত্ব নিলেন।`, 'good');
  if (finishStep && o.step === currentStep()) {
    setTimeout(() => dialog(o, 'আমি নতুন এসেছি। এই ঝামেলার জন্য দুঃখিত। আপনার কাজটা এখনই করে দিচ্ছি।', [
      { label: 'ধন্যবাদ!', cls: 'good', fn: () => { const st = G.steps[o.step]; if (st.fee && G.money < st.fee) return endRun(false, 'broke'); completeStep(o.step, o); } }]), 300);
  }
}

// ---------------- Police ----------------
function talkPolice(pol) {
  const met = [...G.notes.values()].filter(n => ['dalal', 'helper', 'citizen'].includes(n.e.kind) && n.e.state !== 'arrested' && !n.reported);
  const opts = met.slice(-7).map(n => ({
    label: `${n.name}-এর নামে রিপোর্ট — ${n.desc}`,
    fn: () => reportToPolice(pol, n),
  }));
  opts.push({ label: 'শুধু পরামর্শ চাই', fn: () => say(pol, 'দালালরা সাধারণ মানুষের মতোই দেখতে। যে-ই "কাজ করে দিব" বলে টাকা চায়, তাকে আমাদের দেখায় দিবেন। সাথে সাথে ধরব।') });
  opts.push({ label: 'কিছু না', fn: () => { } });
  dialog(pol, met.length ? 'জি, বলেন। কোনো দালাল আপনাকে হয়রানি করতেছে? কে?' : 'কোনো সমস্যা? দালাল চিনতে পারলে আমাকে বলবেন — সাথে সাথে ধরব।', opts);
}

function reportToPolice(pol, n) {
  const e = n.e;
  n.reported = true;
  if (e.kind === 'dalal') {
    if (e.remove || e.state === 'gone') {
      addTime(15);
      return say(pol, `${e.name}? সে তো পালায় গেছে। জিডি করে রাখলাম, কিন্তু টাকা ফেরত পাওয়া কঠিন। পরে কাউরে টাকা দেওয়ার আগে আমাদের জানাবেন।`);
    }
    // police catch him instantly
    const refund = e.taken;
    say(pol, `ঠিক আছে! ওয়্যারলেসে বলে দিচ্ছি… "${e.name}, ${n.desc}" — ধর ওরে!`);
    arrest(e);
    G.stats.dalalsCaught++;
    if (refund > 0) {
      G.money += refund; G.stats.recovered += refund;
      floatText(G.player.x, G.player.y - 40, '+' + tk(refund), '#8ff08f');
      toast(`পুলিশ ${e.name}-এর কাছ থেকে আপনার ${tk(refund)} উদ্ধার করেছে!`, 'good');
    }
    G.jobs = G.jobs.filter(j => j.d !== e);
    note(e, `পুলিশের হাতে গ্রেপ্তার${refund ? ` — আপনার ${tk(refund)} ফেরত` : ''}।`);
    addTime(5);
    updateHud();
  } else {
    G.stats.falseReports++;
    note(e, 'আপনি পুলিশে রিপোর্ট করেছিলেন — উনি নির্দোষ।');
    dialog(pol, `আমরা ${e.name}-কে জিজ্ঞেস করলাম। উনি সাধারণ মানুষ, নিজের কাজে আসছেন। প্রমাণ ছাড়া কাউরে দালাল বলবেন না, ভাই।`, [
      { label: 'দুঃখিত…', fn: () => addTime(20, 'ভুল রিপোর্ট') }]);
  }
}

function arrest(e) {
  e.state = 'arrested'; e.path = []; e.bubble = null;
  const c = mk('constable', { name: 'পুলিশ', x: e.x - 18, y: e.y + 2, look: { ...randomLook({ female: false, uniform: 'police' }), avatar: 'Police_Male_01' }, state: 'grab', timer: 1.4, prisoner: e });
  e.escort = c;
  G.ents.push(c);
  flash(e.x, e.y);
  floatText(e.x, e.y - 50, 'গ্রেপ্তার!', '#ff6a5a');
}

// ---------------- Charter ----------------
function showCharter() {
  const rows = G.steps.map((s, i) => {
    const cs = officers().filter(o => o.step === i).map(o => bn(counterNo(o))).join(' / ');
    return `<tr><td>${bn(i + 1)}</td><td>${s.name}${s.copy ? `<br><small>লাগবে: ${G.office.copyName}</small>` : ''}</td><td>${cs}</td><td>${s.fee ? tk(s.fee) : 'বিনামূল্যে'}</td></tr>`;
  }).join('');
  dialogHTML({ name: 'সিটিজেন চার্টার', title: 'নাগরিক সেবা সনদ — ' + G.office.nameBn, look: null },
    `<table class="charter"><tr><th>#</th><th>সেবার ধাপ</th><th>কাউন্টার</th><th>সরকারি ফি</th></tr>${rows}</table><p class="small">${CHARTER_NOTE}</p>`,
    [{ label: 'বন্ধ করুন', fn: () => { } }]);
}

// ---------------- End of run ----------------
function endRun(win, reason) {
  if (G.over) return;
  G.over = true; G.dialog = null; G.speaker = null; $('#dialog').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const s = G.stats;
  const lost = s.dalalLost - s.recovered;
  let stars = 0, title, msg;
  if (win) {
    stars = (s.ghush === 0 && lost === 0) ? 3 : (s.ghush + lost <= G.office.bribe * 1.5 ? 2 : 1);
    title = stars === 3 ? 'কাজ হয়ে গেছে — এক টাকাও ঘুষ ছাড়া!' : 'কাজ হয়ে গেছে… কিন্তু কিছু টাকা গেল।';
    msg = stars === 3 ? 'আপনি সৎ পথেই সিস্টেমকে হারালেন। সবাই এমন করলে দালালরা না খেয়ে মরবে।' :
      'কাজ শেষ, কিন্তু আপনার কিছু টাকা দুর্নীতির পেটে গেল।';
    save.best[G.office.id] = Math.max(save.best[G.office.id] || 0, stars);
    writeSave();
  } else {
    title = reason === 'broke' ? 'টাকা শেষ। সরকারি ফি দেওয়ার টাকা নেই।' : 'বিকাল ৫টা — অফিস বন্ধ। "কাল আসেন।"';
    msg = reason === 'broke' ? 'ঘুষ আর দালালের পেছনে সরকারি ফি-র টাকাও চলে গেল।' :
      'দিন শেষ, কাজ হয়নি। কাল আবার সেই একই লাইন।';
  }
  $('#res-title').textContent = title;
  $('#res-msg').textContent = msg;
  $('#res-stars').textContent = win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '✖';
  $('#res-stars').className = 'stars' + (win ? '' : ' fail');
  const done = G.steps.filter(x => x.status === 'done').length;
  $('#res-stats').innerHTML = [
    ['সম্পন্ন ধাপ', `${bn(done)} / ${bn(G.steps.length)}`],
    ['সময়', clockStr(Math.min(G.min, DAY_END))],
    ['সরকারি ফি দিয়েছেন', tk(s.fees)],
    ['ঘুষ দিয়েছেন', tk(s.ghush)],
    ['দালালের কাছে হারিয়েছেন', tk(lost) + (s.recovered ? ` (${tk(s.recovered)} উদ্ধার)` : '')],
    ['গ্রেপ্তার হওয়া দালাল', `${bn(s.dalalsCaught)} / ${bn(G.office.dalals)}`],
    ['ধরা পড়া দুর্নীতিবাজ অফিসার', bn(s.officersExposed)],
    ['যতবার প্রতারিত হয়েছেন', bn(s.fooled)],
    ['ভুল অভিযোগ', bn(s.falseReports)],
    ['বাকি টাকা', tk(G.money)],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  showScreen('#result');
}

// ---------------- Dialog UI ----------------
function say(e, text) { dialog(e, text, [{ label: 'ঠিক আছে', fn: () => { } }]); }
function dialog(e, text, choices, override) {
  const t = document.createElement('div'); t.textContent = text;
  dialogHTML(e, t.innerHTML, choices, override);
}
function dialogHTML(e, html, choices, override) {
  G.dialog = true;
  G.player.moving = false;
  G.speaker = e && e.id ? e : null;                  // the 3D person gestures while talking
  if (document.pointerLockElement) document.exitPointerLock();
  if (e && e.x != null) {
    const tx = e.kind === 'officer' ? e.desk.x : e.x, ty = e.kind === 'officer' ? e.desk.officerY : e.y;
    R3.turnTo = Math.atan2(tx - G.player.x, -(ty - G.player.y));
  }
  const name = (override && override.name) || e.name;
  let title = (override && override.title) || e.title;
  if (!title) {
    title = {
      officer: `কাউন্টার ${bn(e.deskIdx + 1)} · ${e.step != null ? G.steps[e.step].desk : ''}`,
      police: 'বাংলাদেশ পুলিশ', info: 'তথ্য সেবা', vendor: 'দোকান', constable: 'পুলিশ',
    }[e.kind] || 'অচেনা লোক';
  }
  $('#dlg-name').textContent = name;
  $('#dlg-title').textContent = title;
  $('#dlg-text').innerHTML = html;
  drawPortrait(e);
  const box = $('#dlg-choices'); box.innerHTML = '';
  choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'choice ' + (c.cls || '');
    b.innerHTML = `<kbd>${bn(i + 1)}</kbd> ${c.label}`;
    b.onclick = () => { closeDialog(); c.fn && c.fn(); lockPointer(); };
    box.appendChild(b);
  });
  $('#dialog').hidden = false;
}
function closeDialog() { $('#dialog').hidden = true; if (G) { G.dialog = null; G.speaker = null; } updateHud(); }

function drawPortrait(e) {
  const c = $('#dlg-portrait'), g = c.getContext('2d');
  if (e && e.look && portrait3D(e.look, c)) return;     // 3D render of the real person
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = e && e.name === 'সিটিজেন চার্টার' ? '#1f5f2f' : '#b8262b';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 64px "Hind Siliguri", system-ui'; g.textAlign = 'center';
  g.fillText(e && e.name === 'সিটিজেন চার্টার' ? '📜' : '১০৬', c.width / 2, c.height / 2 + 22);
}

// ---------------- Toasts / floating text ----------------
function toast(text, kind = 'info') {
  const box = $('#toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + kind; d.textContent = text;
  box.prepend(d);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, 6000);
}
function floatText(x, y, text, color) { G.fx.push({ x, y, text, color, t: 0 }); }
function flash(x, y) { G.fx.push({ x, y, flash: true, t: 0 }); }

// ---------------- HUD ----------------
function buildObjectives() {
  const s = currentStep();
  $('#obj-list').innerHTML = G.steps.map((st, i) => {
    const cs = officers().filter(o => o.step === i).map(o => bn(counterNo(o))).join(' / ');
    const state = st.status !== 'todo' ? 'done' : (i === s ? 'cur' : '');
    return `<li class="${state}"><span class="ic">${st.status !== 'todo' ? '✓' : (i === s ? '▶' : '○')}</span>
      <div><b>${st.name}</b><small>কাউন্টার ${cs}${st.fee ? ' · ফি ' + tk(st.fee) : ''}${st.copy ? ' · ফটোকপি লাগবে' : ''}</small></div></li>`;
  }).join('');
}
function updateHud() {
  if (!G) return;
  $('#hud-office').textContent = G.office.nameBn;
  $('#hud-clock').textContent = clockStr(G.min);
  $('#hud-clock').classList.toggle('late', G.min > 16 * 60);
  $('#hud-money').textContent = tk(G.money);
  $('#hud-copy').hidden = !G.hasCopy;
  const li = G.inLine ? G.inLine.queue.indexOf(G.player) : -1;
  $('#hud-status').textContent = isLunch() ? 'লাঞ্চ বিরতি' : (isServerDown() ? 'সার্ভার ডাউন' : '');
  $('#hud-line').hidden = !G.inLine;
  if (G.inLine) $('#hud-line').textContent = li > 0 ? `🧍 লাইনে · সামনে ${bn(li)} জন ⏩` : '🧍 আপনার পালা — E চাপুন';
}
function renderNotebook() {
  if (!G) return;
  const list = [...G.notes.values()].filter(n => n.lines.length);
  $('#nb-list').innerHTML = list.length ? list.reverse().map(n => `
    <div class="nb-item"><b>${n.name}</b> <small>${n.e.kind === 'officer' ? 'কাউন্টার ' + bn(counterNo(n.e)) : n.desc}</small>
    <ul>${n.lines.map(l => `<li>${l}</li>`).join('')}</ul></div>`).join('') :
    '<p class="small">এখনো কেউ নেই। যাদের সাথে কথা বলবেন, তাদের কথা এখানে লেখা থাকবে — কাকে রিপোর্ট করবেন, তা ঠিক করতে কাজে লাগবে।</p>';
}

// ---------------- Interaction prompt ----------------
let focus = null;
function interactables() {
  const p = G.player;
  const list = [];
  for (const e of G.ents) {
    if (e === p || e.kind === 'constable' || e.state === 'arrested' || e.remove) continue;
    if (e.kind === 'officer') {
      const front = { x: e.desk.x, y: e.desk.queueY };
      const d = dist(front, p);
      if (d < 50) list.push({ e, d });
      continue;
    }
    if (e.kind === 'info') { const d = dist({ x: e.x, y: e.y + 46 }, p); if (d < 50) list.push({ e, d }); continue; }
    if (e.kind === 'vendor') { const d = dist({ x: e.x, y: e.y + 80 }, p); if (d < 55) list.push({ e, d }); continue; }
    const d = dist(e, p); if (d < 58) list.push({ e, d });
  }
  if (!G.inLine) for (const o of officers()) {
    if (o.queue.length >= maxQ(o)) continue;
    const tail = slotPos(o, o.queue.length);
    const d = dist(tail, p);
    if (d < 34) list.push({ e: { kind: 'queue', o, x: tail.x, y: tail.y - 30, name: `লাইনে দাঁড়ান — কাউন্টার ${bn(counterNo(o))}` + (o.queue.length ? ` (সামনে ${bn(o.queue.length)} জন)` : '') }, d: d - 5 });
  }
  const sp = G.layout.spots;
  const dc = dist(sp.charter, p); if (dc < 40) list.push({ e: { kind: 'charter', name: 'সিটিজেন চার্টার বোর্ড' }, d: dc });
  const da = dist(sp.acc, p); if (da < 40) list.push({ e: { kind: 'acc', name: 'দুদক হটলাইন ১০৬ পোস্টার' }, d: da });
  const fx = Math.sin(G.yaw), fy = -Math.cos(G.yaw);
  const out = [];
  for (const it of list) {
    const e = it.e;
    const tx = e.kind === 'officer' ? e.desk.x : e.kind === 'charter' ? sp.charter.x : e.kind === 'acc' ? sp.acc.x : e.x;
    const ty = e.kind === 'officer' ? e.desk.counterY : e.kind === 'charter' ? 640 : e.kind === 'acc' ? 640 : e.y;
    const vx = tx - p.x, vy = ty - p.y, l = Math.hypot(vx, vy) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vy * fy) / l)));
    if (ang < 0.75 || l < 20) out.push({ e, d: it.d + ang * 40 });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
function updatePrompt() {
  const l = interactables();
  focus = l.length ? l[0].e : null;
  const pr = $('#prompt');
  if (focus && !G.dialog) {
    let n = focus.name;
    if (focus.kind === 'officer') n = isLunch() ? `কাউন্টার ${bn(counterNo(focus))} (খালি)` : `কাউন্টার ${bn(counterNo(focus))}-এর অফিসার`;
    pr.innerHTML = `<kbd>E</kbd> কথা বলুন: ${n}`; pr.hidden = false;
  } else pr.hidden = true;
  G.player.atCounter = !!(G.inLine && atFront(G.inLine));
}

// ---------------- Loop ----------------
let last = performance.now(), hudTimer = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  if (G && R3.scene && R3.renderer) render3D(dt);
  // the mouse cursor only appears when you need to pick an answer (dialog, pause, notebook, menus)
  document.body.classList.toggle('hide-cursor', !!(G && !G.over && !G.dialog && !G.paused && $('#notebook').hidden));
  hudTimer += dt;
  if (hudTimer > 0.25 && G) { hudTimer = 0; updateHud(); }
  requestAnimationFrame(loop);
}

// ---------------- Input ----------------
addEventListener('keydown', ev => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (G && !$('#dialog').hidden && /^[1-9]$/.test(k)) {
    const b = $('#dlg-choices').children[+k - 1]; if (b) b.click(); ev.preventDefault(); return;
  }
  if (G && !$('#dialog').hidden && (k === 'Enter' || k === ' ') && $('#dlg-choices').children.length === 1) { $('#dlg-choices').children[0].click(); ev.preventDefault(); return; }
  keys[k] = true;
  if (G && 'wasd'.includes(k) && k.length === 1) lockPointer();
  if (!G || G.over) return;
  if ((k === 'e' || k === 'Enter' || k === ' ') && !G.dialog && focus) { interact(focus); ev.preventDefault(); }
  if (k === 'n') toggleNotebook();
  if (k === 'Escape') togglePause();
  if (k.startsWith('Arrow') || k === ' ') ev.preventDefault();
});
addEventListener('keyup', ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

$('#btn-talk').addEventListener('click', () => { if (G && focus && !G.dialog) interact(focus); });

// ---------------- Screens ----------------
function showScreen(sel) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = true);
  if (sel) $(sel).hidden = false;
}
// The office (map) is chosen automatically — a different one from last time
function randomOffice() {
  let i;
  do { i = randi(0, OFFICES.length - 1); } while (OFFICES.length > 1 && i === save.last);
  return i;
}
let pendingOffice = 0;
function briefing(i) {
  pendingOffice = i;
  save.last = i; writeSave();
  const o = OFFICES[i];
  const fees = o.steps.reduce((a, s) => a + s.fee, 0);
  $('#brief-title').innerHTML = `<small>আজ আপনাকে যেতে হবে</small>${o.nameBn}<span>📍 ${o.place}</span>`;
  $('#brief-body').innerHTML = `
    <p class="task">🎯 ${o.task}</p>
    <ul>
      <li>আপনার কাছে আছে <b>${tk(o.startMoney)}</b>। সরকারি ফি মোট <b>${tk(fees)}</b>। এর বাইরে যে টাকা দেবেন, তা চিরতরে গেল।</li>
      <li>অফিস সময় <b>সকাল ৯টা – বিকাল ৫টা</b>। দুপুর ১–২টা লাঞ্চ ও নামাজের বিরতি। লাইন, ফাইল আটকানো আর "সার্ভার ডাউন" — সবকিছুতে সময় যায়।</li>
      <li>মোট ${bn(o.steps.length)}টি ধাপ, প্রতিটি দুটি কাউন্টারের যেকোনো একটিতে। <b>কোন অফিসার ঘুষখোর, আপনি জানেন না।</b></li>
      <li>অচেনা লোকজন "সাহায্য" করতে এগিয়ে আসবে। কেউ কেউ সত্যিই ভালো মানুষ। বেশিরভাগই <b>দালাল</b> — আর দালাল <b>একসময় না একসময় ঠকাবেই</b>।</li>
      <li>দালালের কথা <b>পুলিশকে</b> জানান (গেটের পুলিশ বক্স বা দরজার পাশে) — সাথে সাথে গ্রেপ্তার করবে, আর সে পালিয়ে না গেলে আপনার টাকাও উদ্ধার করবে।</li>
      <li>ঘুষখোর অফিসারের কথা <b>দুদক হটলাইন ১০৬</b>-এ জানান (দরজার পাশের লাল পোস্টার, অথবা কাউন্টারে টাকা চাইলে সেখান থেকেই)।</li>
    </ul>`;
  showScreen('#briefing');
}

function toggleNotebook() { if (!G) return; const nb = $('#notebook'); nb.hidden = !nb.hidden; renderNotebook(); }
function togglePause() {
  if (!G || G.over) return;
  G.paused = !G.paused;
  $('#pause').hidden = !G.paused;
}
function toTitle() {
  G = null; $('#pause').hidden = true; $('#hud').hidden = true; $('#notebook').hidden = true; $('#dialog').hidden = true;
  showScreen('#title');
}

$('#btn-play').onclick = () => briefing(randomOffice());
$('#btn-how').onclick = () => showScreen('#howto');
$('#how-back').onclick = () => showScreen('#title');
$('#brief-back').onclick = () => showScreen('#title');
$('#brief-go').onclick = () => { startRun(pendingOffice); lockPointer(); };
$('#btn-notebook').onclick = toggleNotebook;
$('#nb-close').onclick = toggleNotebook;
$('#btn-charter').onclick = () => { if (G && !G.dialog && !G.over) showCharter(); };
$('#btn-pause').onclick = togglePause;
$('#pause-resume').onclick = () => { togglePause(); lockPointer(); };
$('#pause-quit').onclick = toTitle;
$('#res-retry').onclick = () => { startRun(G.officeIdx); lockPointer(); };
$('#res-next').onclick = () => briefing(randomOffice());
$('#res-menu').onclick = toTitle;
document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.over && !G.paused) togglePause(); });

try {
  init3D();
  // realistic people load in the background while you read the title screen
  loadAvatars((n, t) => {
    $('#load-status').textContent = n < t ? `বাস্তব মানুষ লোড হচ্ছে… ${bn(n)}/${bn(t)}` : '';
  });
  if (RB.failed) $('#load-status').textContent = '';
}
catch (err) {
  // no WebGL (very old device, or GPU blocked): explain instead of failing silently
  $('#btn-play').disabled = true;
  $('.tag').innerHTML = '⚠️ আপনার ব্রাউজারে 3D গ্রাফিক্স (WebGL) চালু করা গেল না।<br>ব্রাউজার আপডেট করুন অথবা হার্ডওয়্যার অ্যাক্সেলারেশন চালু করুন।';
}
requestAnimationFrame(loop);

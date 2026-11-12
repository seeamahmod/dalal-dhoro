// ============================================================
//  World: layout of an office compound + all drawing code
// ============================================================

const WORLD_W = 1600, WORLD_H = 1320;
const DOOR = { x1: 740, x2: 860, y: 632 };          // building entrance
const GATE = { x1: 720, x2: 880, y: 1178 };         // compound gate
const ROAD_Y = 1194;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Layout ----------
function buildLayout(office) {
  const obs = [];                       // solid rects {x,y,w,h}
  const add = (x, y, w, h) => { obs.push({ x, y, w, h }); };

  // building walls (16px thick)
  add(80, 40, 1440, 16);                // top
  add(80, 40, 16, 600);                 // left
  add(1504, 40, 16, 600);               // right
  add(80, 624, DOOR.x1 - 80, 16);       // bottom-left
  add(DOOR.x2, 624, 1520 - DOOR.x2, 16);// bottom-right
  // compound walls
  add(0, 640, 12, 546);                 // left
  add(1588, 640, 12, 546);              // right
  add(0, 1170, GATE.x1, 16);            // bottom-left
  add(GATE.x2, 1170, 1600 - GATE.x2, 16);
  // world edge (road bottom) — invisible
  add(0, WORLD_H - 4, WORLD_W, 4);

  // ---- counters ----
  const n = office.steps.length * 2;
  const top = Math.ceil(n / 2), mid = n - top;
  const desks = [];
  // staff enclosure along the top wall
  add(96, 56, 1408, 88);
  for (let i = 0; i < top; i++) {
    const x = top === 1 ? 800 : 200 + i * (1200 / (top - 1));
    desks.push({ x, counterY: 118, officerY: 100, queueY: 196, row: 'top' });
  }
  // two island enclosures in the middle (gap in the centre for walking)
  const left = Math.ceil(mid / 2), right = mid - left;
  add(150, 296, 560, 66);
  add(890, 296, 560, 66);
  for (let i = 0; i < left; i++) {
    const x = left === 1 ? 430 : 210 + i * (440 / (left - 1));
    desks.push({ x, counterY: 336, officerY: 320, queueY: 410, row: 'mid' });
  }
  for (let i = 0; i < right; i++) {
    const x = right === 1 ? 1170 : 950 + i * (440 / (right - 1));
    desks.push({ x, counterY: 336, officerY: 320, queueY: 410, row: 'mid' });
  }
  // interior furniture
  add(250, 540, 100, 26);               // information desk
  add(1000, 520, 380, 14); add(1000, 572, 380, 14);   // benches right
  add(430, 520, 240, 14);               // bench left
  add(110, 570, 30, 40);                // water filter

  // ---- yard props ----
  const props = [];
  const P = (type, x, y, w, h, solid = true) => { props.push({ type, x, y, w, h }); if (solid) add(x, y, w, h); };
  P('teastall', 110, 900, 140, 60);
  P('bench', 120, 990, 110, 14);
  P('copyshop', 1320, 900, 150, 60);
  P('policebox', 930, 1090, 64, 56);
  const trees = [[60, 700], [300, 720], [1300, 720], [1540, 700], [60, 1120], [1540, 1110], [460, 1120], [1150, 1120]];
  for (const [x, y] of trees) { props.push({ type: 'tree', x, y }); add(x - 8, y - 8, 16, 16); }
  if (office.yard === 'garden') {
    P('flowerbed', 420, 820, 200, 50); P('flowerbed', 980, 820, 200, 50);
    P('car', 300, 1040, 90, 46); P('car', 1170, 1030, 90, 46);
  } else if (office.yard === 'vehicles') {
    for (let i = 0; i < 4; i++) P('car', 330 + i * 0, 760 + i * 70, 90, 46);
    for (let i = 0; i < 3; i++) P('truck', 1040, 760 + i * 90, 150, 60);
    for (let i = 0; i < 5; i++) P('bike', 520 + i * 34, 1060, 18, 40);
  } else if (office.yard === 'village') {
    P('shed', 380, 780, 200, 90); P('pond', 1000, 760, 230, 120);
    P('haystack', 1120, 1010, 70, 70); P('flowerbed', 420, 1010, 160, 40);
    props.push({ type: 'tree', x: 640, y: 1040 }); add(632, 1032, 16, 16);
  } else if (office.yard === 'containers') {
    const cols = ['#b5452f', '#2d6ea3', '#3f8a4a', '#c99a2e', '#7a4b8f', '#2b7a7a'];
    for (let i = 0; i < 3; i++) P('container', 300, 740 + i * 60, 160, 44, true), props[props.length - 1].color = cols[i];
    for (let i = 0; i < 3; i++) P('container', 1040, 740 + i * 60, 160, 44, true), props[props.length - 1].color = cols[i + 3];
    P('truck', 380, 1030, 150, 60); P('car', 1150, 1040, 90, 46);
  }

  // notable spots
  const spots = {
    playerStart: { x: 800, y: 1200 },
    gateOut: { x: 800, y: 1250 },
    gateIn: { x: 800, y: 1140 },
    doorOut: { x: 800, y: 670 },
    doorIn: { x: 800, y: 600 },
    charter: { x: 680, y: 604, wall: { x: 640, y: 610, w: 84, h: 14 } },
    acc: { x: 920, y: 604, wall: { x: 880, y: 610, w: 80, h: 14 } },
    infoDesk: { x: 300, y: 526 },
    policeOut: { x: 905, y: 1110 },
    policeIn: { x: 975, y: 592 },
    teaSeller: { x: 180, y: 888 },
    copySeller: { x: 1395, y: 888 },
  };
  return { obs, desks, props, spots };
}

// Zones for random wandering
function randomPoint(zone) {
  if (zone === 'in') {
    const pts = [[160 + Math.random() * 1280, 420 + Math.random() * 90],
                 [760 + Math.random() * 80, 180 + Math.random() * 380],
                 [112 + Math.random() * 26, 180 + Math.random() * 300],
                 [1462 + Math.random() * 26, 180 + Math.random() * 300]];
    const p = pts[Math.floor(Math.random() * pts.length)];
    return { x: p[0], y: p[1] };
  }
  if (zone === 'gate') return { x: 540 + Math.random() * 340, y: 1030 + Math.random() * 120 };
  return { x: 60 + Math.random() * 1480, y: 700 + Math.random() * 440 };
}

function zoneOf(y) { return y < 632 ? 'in' : (y < 1180 ? 'yard' : 'road'); }

// ---------- Static map render (once, to an offscreen canvas) ----------
// ground=true: texture for the 3D floor (3D-modelled furniture/props are skipped, 2048px for sharpness)
function renderStaticMap(office, layout, ground = false) {
  const c = document.createElement('canvas');
  c.width = ground ? 2048 : WORLD_W; c.height = ground ? 2048 : WORLD_H;
  const g = c.getContext('2d');
  if (ground) g.scale(2048 / WORLD_W, 2048 / WORLD_H);
  const th = office.theme;

  // yard ground
  g.fillStyle = '#9db27a'; g.fillRect(0, 640, WORLD_W, 560);
  // grass noise
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(70,100,50,.18)' : 'rgba(200,210,150,.15)';
    g.fillRect(Math.random() * WORLD_W, 640 + Math.random() * 540, 3, 2);
  }
  // dusty patches
  g.fillStyle = 'rgba(180,160,120,.35)';
  for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(Math.random() * WORLD_W, 700 + Math.random() * 460, 40 + Math.random() * 60, 18 + Math.random() * 20, 0, 0, 7); g.fill(); }
  // concrete paths
  g.fillStyle = '#cfc8b8'; g.fillRect(740, 640, 120, 540);
  g.fillRect(200, 960, 1250, 60);
  g.strokeStyle = 'rgba(0,0,0,.08)';
  for (let y = 640; y < 1180; y += 30) { g.beginPath(); g.moveTo(740, y); g.lineTo(860, y); g.stroke(); }
  for (let x = 200; x < 1450; x += 30) { g.beginPath(); g.moveTo(x, 960); g.lineTo(x, 1020); g.stroke(); }

  // road + footpath
  g.fillStyle = '#bdb6a6'; g.fillRect(0, 1186, WORLD_W, 22);
  g.fillStyle = '#4a4a4d'; g.fillRect(0, 1208, WORLD_W, 112);
  g.strokeStyle = '#e9e2b0'; g.lineWidth = 3; g.setLineDash([30, 24]);
  g.beginPath(); g.moveTo(0, 1264); g.lineTo(WORLD_W, 1264); g.stroke(); g.setLineDash([]);
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(Math.random() * WORLD_W, 1210 + Math.random() * 108, 6, 2); }

  // compound walls (brick with whitewash top)
  const wall = (x, y, w, h) => {
    g.fillStyle = '#a5523b'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.15)';
    for (let yy = y; yy < y + h; yy += 5) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
    g.fillStyle = '#efe9dc'; g.fillRect(x, y, w, 4);
  };
  wall(0, 640, 12, 546); wall(1588, 640, 12, 546);
  wall(0, 1170, GATE.x1, 16); wall(GATE.x2, 1170, 1600 - GATE.x2, 16);
  // gate pillars + sign board
  g.fillStyle = '#e9e2d0'; g.fillRect(GATE.x1 - 14, 1160, 18, 34); g.fillRect(GATE.x2 - 4, 1160, 18, 34);
  g.fillStyle = '#5a5a5a';
  for (let x = GATE.x1 + 6; x < GATE.x2; x += 10) g.fillRect(x, 1176, 2, 4); // open gate rails
  if (!ground) signBoard(g, 610, 1144, 380, 22, th.board, office.nameBn);

  // ---- building ----
  // interior floor (tiles)
  for (let y = 56; y < 624; y += 32) for (let x = 96; x < 1504; x += 32) {
    g.fillStyle = ((x + y) / 32) % 2 ? th.floorA : th.floorB; g.fillRect(x, y, 32, 32);
  }
  g.fillStyle = 'rgba(0,0,0,.05)';
  for (let i = 0; i < 60; i++) g.fillRect(96 + Math.random() * 1400, 60 + Math.random() * 560, 20, 10); // stains
  // staff enclosure (wooden floor)
  g.fillStyle = '#b48a5a'; g.fillRect(96, 56, 1408, 62);
  g.fillStyle = 'rgba(0,0,0,.08)'; for (let x = 96; x < 1504; x += 14) g.fillRect(x, 56, 1, 62);
  g.fillStyle = '#b48a5a'; g.fillRect(150, 296, 560, 40); g.fillRect(890, 296, 560, 40);
  g.fillStyle = 'rgba(0,0,0,.08)';
  for (let x = 150; x < 710; x += 14) g.fillRect(x, 296, 1, 40);
  for (let x = 890; x < 1450; x += 14) g.fillRect(x, 296, 1, 40);
  // long counters
  const counterBar = (x, y, w) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(x, y, w, 26);
    g.fillStyle = '#8a643e'; g.fillRect(x, y, w, 8);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + 26, w, 3);
  };
  counterBar(96, 118, 1408);
  counterBar(150, 336, 560); counterBar(890, 336, 560);
  // partitions behind mid islands
  g.fillStyle = '#8f9aa0'; g.fillRect(150, 292, 560, 6); g.fillRect(890, 292, 560, 6);
  // staff tables, file stacks, almirahs
  if (!ground) for (const d of layout.desks) {
    const ty = d.row === 'top' ? 66 : 300;
    g.fillStyle = '#5b3d22'; g.fillRect(d.x - 34, ty, 68, 22);
    g.fillStyle = '#efe6c8';
    for (let k = 0; k < 4; k++) { g.fillRect(d.x - 30 + k * 4, ty + 2 - k * 2, 16, 10); g.strokeStyle = '#c4b48a'; g.strokeRect(d.x - 30 + k * 4, ty + 2 - k * 2, 16, 10); }
    g.fillStyle = '#c8b46a'; g.fillRect(d.x + 8, ty + 4, 18, 12); // red-tape file
    g.fillStyle = '#b03030'; g.fillRect(d.x + 8, ty + 9, 18, 2);
    // computer monitor on counter
    g.fillStyle = '#2a2a2a'; g.fillRect(d.x + 20, d.counterY + 2, 22, 14);
    g.fillStyle = '#5d8fb0'; g.fillRect(d.x + 22, d.counterY + 4, 18, 10);
  }
  if (!ground) for (let x = 110; x < 1500; x += 230) { g.fillStyle = '#7c8a8f'; g.fillRect(x, 58, 40, 10); } // almirahs
  // windows on top wall
  // walls
  g.fillStyle = th.wall;
  g.fillRect(80, 40, 1440, 16); g.fillRect(80, 40, 16, 600); g.fillRect(1504, 40, 16, 600);
  g.fillRect(80, 624, DOOR.x1 - 80, 16); g.fillRect(DOOR.x2, 624, 1520 - DOOR.x2, 16);
  g.fillStyle = th.trim;
  g.fillRect(80, 40, 1440, 3); g.fillRect(80, 637, DOOR.x1 - 80, 3); g.fillRect(DOOR.x2, 637, 1520 - DOOR.x2, 3);
  for (let x = 160; x < 1480; x += 160) { g.fillStyle = '#9cc7d8'; g.fillRect(x, 42, 60, 10); g.fillStyle = '#5d7d8a'; g.fillRect(x + 29, 42, 2, 10); }
  // door frame
  g.fillStyle = '#5b3d22'; g.fillRect(DOOR.x1 - 6, 620, 6, 22); g.fillRect(DOOR.x2, 620, 6, 22);
  g.fillStyle = 'rgba(80,60,40,.25)'; g.fillRect(DOOR.x1, 600, DOOR.x2 - DOOR.x1, 40); // doormat
  // building name plate (outside)
  if (ground) {                       // 3D scene models the rest
    for (const p of layout.props) if (p.type === 'flowerbed' || p.type === 'pond') drawProp(g, p, office);
    return c;
  }
  signBoard(g, 620, 650, 360, 22, th.board, office.name);

  // interior decor
  // information desk
  g.fillStyle = '#6b4a2b'; g.fillRect(250, 540, 100, 26); g.fillStyle = '#8a643e'; g.fillRect(250, 540, 100, 7);
  label(g, 'তথ্য সেবা', 300, 582, '#333', 10);
  // benches
  const bench = (x, y, w) => { g.fillStyle = '#7d8a93'; g.fillRect(x, y, w, 14); g.fillStyle = '#9fadb6'; for (let i = x + 2; i < x + w; i += 22) g.fillRect(i, y + 2, 18, 10); };
  bench(1000, 520, 380); bench(1000, 572, 380); bench(430, 520, 240);
  // water filter
  g.fillStyle = '#3d7fbf'; g.fillRect(110, 570, 30, 40); g.fillStyle = '#9fd0f0'; g.fillRect(114, 574, 22, 14);
  // plants
  for (const [x, y] of [[120, 160], [1480, 160], [720, 600], [880, 600]]) plant(g, x, y);
  // citizen charter + ACC poster on the bottom wall
  const ch = layout.spots.charter.wall;
  g.fillStyle = '#1f5f2f'; g.fillRect(ch.x, ch.y, ch.w, ch.h);
  label(g, 'সিটিজেন চার্টার', ch.x + ch.w / 2, ch.y + 11, '#fff', 9);
  const ac = layout.spots.acc.wall;
  g.fillStyle = '#b8262b'; g.fillRect(ac.x, ac.y, ac.w, ac.h);
  label(g, 'দুদক হটলাইন ১০৬', ac.x + ac.w / 2, ac.y + 11, '#fff', 9);
  // banners on top wall (ironic)
  label(g, '"দুর্নীতিমুক্ত সেবা আমাদের অঙ্গীকার"', 800, 30, '#3a3a3a', 13);

  // counter number plates
  layout.desks.forEach((d, i) => {
    const s = office.steps[Math.floor(i / 2)];
    const y = d.counterY + 30;
    g.fillStyle = '#123'; rr(g, d.x - 52, y + 2, 104, 30, 4); g.fill();
    label(g, 'কাউন্টার ' + toBn(i + 1), d.x, y + 14, '#ffe07a', 10);
    label(g, s.desk, d.x, y + 27, '#fff', 9.5);
  });

  // yard props
  for (const p of layout.props) drawProp(g, p, office);

  // labels on yard shops
  return c;
}

function toBn(n) { return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }

function label(g, text, x, y, color, size) {
  g.font = `600 ${size}px "Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif`;
  g.textAlign = 'center'; g.fillStyle = color; g.fillText(text, x, y);
}
function signBoard(g, x, y, w, h, color, text) {
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = color; g.fillRect(x, y, w, h);
  g.strokeStyle = '#f2e6a8'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, w - 4, h - 4); g.lineWidth = 1;
  label(g, text, x + w / 2, y + h / 2 + 5, '#fff', 13);
}
function plant(g, x, y) {
  g.fillStyle = '#8a4b2a'; g.fillRect(x - 7, y - 2, 14, 10);
  g.fillStyle = '#2f7a3a';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + Math.cos(i) * 6, y - 6 + Math.sin(i * 2) * 3, 7, 3.5, i, 0, 7); g.fill(); }
}

function drawProp(g, p, office) {
  const { x, y, w, h } = p;
  switch (p.type) {
    case 'tree': {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x + 6, y + 8, 34, 16, 0, 0, 7); g.fill();
      g.fillStyle = '#6b4a2b'; g.fillRect(x - 4, y - 10, 8, 18);
      for (const [dx, dy, r, c] of [[0, -30, 30, '#2f6a2f'], [-14, -20, 20, '#3b7d36'], [14, -22, 20, '#367532'], [0, -40, 18, '#4b8e40']]) {
        g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill();
      }
      break;
    }
    case 'teastall': {
      g.fillStyle = '#7d5a36'; g.fillRect(x, y, w, h);
      g.fillStyle = '#c0392b'; g.fillRect(x - 6, y - 16, w + 12, 18);           // tin awning
      g.fillStyle = 'rgba(255,255,255,.2)'; for (let i = x - 6; i < x + w + 6; i += 10) g.fillRect(i, y - 16, 4, 18);
      g.fillStyle = '#ddd'; g.beginPath(); g.arc(x + 30, y + 22, 9, 0, 7); g.fill(); // kettle
      g.fillStyle = '#e8d9a8'; for (let i = 0; i < 5; i++) g.fillRect(x + 60 + i * 12, y + 18, 8, 10); // biscuit jars
      g.fillStyle = '#f0c040'; g.fillRect(x + 50, y + 40, 70, 10); // banana bunch
      label(g, 'চা স্টল', x + w / 2, y - 3, '#fff', 11);
      break;
    }
    case 'copyshop': {
      g.fillStyle = '#e5e1d6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#2d6ea3'; g.fillRect(x - 4, y - 16, w + 8, 18);
      label(g, 'ফটোকপি · কম্পোজ · প্রিন্ট', x + w / 2, y - 3, '#fff', 10);
      g.fillStyle = '#555'; g.fillRect(x + 14, y + 14, 40, 28); g.fillStyle = '#8bc'; g.fillRect(x + 18, y + 18, 32, 6);
      g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillRect(x + 70 + i * 16, y + 16, 12, 16);
      break;
    }
    case 'policebox': {
      g.fillStyle = '#2c3e66'; g.fillRect(x, y, w, h);
      g.fillStyle = '#e8eef8'; g.fillRect(x + 6, y + 6, w - 12, 14);
      label(g, 'পুলিশ বক্স', x + w / 2, y + 17, '#2c3e66', 10);
      g.fillStyle = '#c33'; g.fillRect(x + w / 2 - 6, y - 6, 12, 6);
      break;
    }
    case 'bench': g.fillStyle = '#6b4a2b'; g.fillRect(x, y, w, h); break;
    case 'flowerbed': {
      g.fillStyle = '#6a8a3a'; rr(g, x, y, w, h, 10); g.fill();
      const cs = ['#e74c3c', '#f1c40f', '#ff79b0', '#ffffff'];
      for (let i = 0; i < w * h / 120; i++) { g.fillStyle = cs[i % 4]; g.beginPath(); g.arc(x + 6 + Math.random() * (w - 12), y + 6 + Math.random() * (h - 12), 2.5, 0, 7); g.fill(); }
      break;
    }
    case 'car': {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 4, y + 4, w, h);
      const cols = ['#d9d9d9', '#2f4f6f', '#8b1e1e', '#e0e0e0', '#3a3a3a'];
      g.fillStyle = cols[Math.floor((x + y) % cols.length)]; rr(g, x, y, w, h, 10); g.fill();
      g.fillStyle = '#2b3b46'; rr(g, x + 18, y + 6, w - 40, h - 12, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 22, y + 9, w - 48, 4);
      break;
    }
    case 'truck': {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 4, y + 4, w, h);
      g.fillStyle = '#c75b1e'; g.fillRect(x, y, w * .7, h);                      // decorated BD truck body
      g.fillStyle = '#f2c230'; for (let i = 0; i < 6; i++) g.fillRect(x + 6 + i * 16, y + 6, 8, h - 12);
      g.fillStyle = '#2f6b3b'; rr(g, x + w * .72, y + 4, w * .28, h - 8, 6); g.fill();
      g.fillStyle = '#9cc7d8'; g.fillRect(x + w * .9, y + 10, 6, h - 20);
      break;
    }
    case 'bike': {
      g.fillStyle = '#222'; g.fillRect(x + 6, y, 6, h);
      g.fillStyle = '#b22'; g.fillRect(x + 3, y + 12, 12, 16);
      break;
    }
    case 'shed': {
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 6, y + 6, w, h);
      g.fillStyle = '#9aa3a8'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = x; i < x + w; i += 8) { g.beginPath(); g.moveTo(i, y); g.lineTo(i, y + h); g.stroke(); }
      label(g, 'রেকর্ড রুম', x + w / 2, y + h / 2 + 4, '#333', 12);
      break;
    }
    case 'pond': {
      g.fillStyle = '#5a7a4a'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 + 6, h / 2 + 6, 0, 0, 7); g.fill();
      g.fillStyle = '#4f86a0'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.ellipse(x + w / 2 - 30, y + h / 2 - 15, 30, 6, 0, 0, 7); g.fill();
      break;
    }
    case 'haystack': {
      g.fillStyle = '#d8b44a'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, 7); g.fill();
      g.strokeStyle = '#b8942a'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + Math.cos(i) * w / 2, y + h / 2 + Math.sin(i) * h / 2); g.stroke(); }
      break;
    }
    case 'container': {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 5, y + 5, w, h);
      g.fillStyle = p.color; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = x + 4; i < x + w; i += 8) g.fillRect(i, y, 3, h);
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = 'bold 9px monospace'; g.textAlign = 'left';
      g.fillText('MSKU ' + (100000 + ((x * 7 + y * 13) % 899999)), x + 6, y + 12);
      break;
    }
  }
}

// ---------- People ----------
const SKINS = ['#8d5a3b', '#a0694a', '#7a4b30', '#b07a55', '#6b4129', '#c08a63'];
const SHIRTS = ['#e8e8e8', '#5b7fa6', '#a63d3d', '#3d7a5b', '#c9a24a', '#6a5a8a', '#d98c4a', '#4a8a9a', '#8a8a8a', '#f2e6c8', '#2e4a6a', '#b85c8a'];
const PANTS = ['#2f3640', '#4a4a4a', '#3b3b5a', '#5a4a3a', '#22303a'];
const LUNGI = ['#2d5a8a', '#6a2d2d', '#2d6a4a', '#4a3a6a'];
const HIJAB = ['#2d2d2d', '#7a2d4a', '#2d4a7a', '#c08aa0', '#3a6a5a', '#8a6a2d'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function randomLook(opts = {}) {
  const female = opts.female != null ? opts.female : Math.random() < 0.25;
  return {
    female,
    skin: pick(SKINS),
    shirt: opts.shirt || pick(SHIRTS),
    pants: female ? pick(HIJAB) : pick(PANTS),
    lungi: !female && !opts.formal && Math.random() < 0.25 ? pick(LUNGI) : null,
    panjabi: !female && !opts.formal && Math.random() < 0.2,
    cap: !female && Math.random() < 0.2,
    beard: !female && Math.random() < 0.35,
    glasses: Math.random() < (opts.formal ? 0.5 : 0.12),
    hijab: female ? pick(HIJAB) : null,
    bald: !female && Math.random() < 0.12,
    uniform: opts.uniform || null,
  };
}

// draws a person with feet at (x,y)
function drawPerson(g, p, t) {
  const L = p.look;
  const x = p.x, y = p.y;
  const walk = p.moving ? Math.sin(t * 12 + p.phase) : 0;
  const bob = p.moving ? Math.abs(walk) * 1.5 : 0;
  const back = p.face === 'up';

  // shadow
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y, 11, 4.5, 0, 0, 7); g.fill();

  let shirt = L.shirt, pants = L.pants;
  if (L.uniform === 'police') { shirt = '#556070'; pants = '#3a4250'; }
  if (L.uniform === 'officer') { pants = '#2a2f3a'; }

  // legs / lungi / saree
  if (L.lungi || L.female) {
    g.fillStyle = L.female ? (L.hijab || pants) : L.lungi;
    g.beginPath(); g.moveTo(x - 7, y - 13); g.lineTo(x + 7, y - 13); g.lineTo(x + 8 + walk, y - 1); g.lineTo(x - 8 + walk, y - 1); g.closePath(); g.fill();
    if (L.lungi) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x - 7, y - 9, 14, 1.5); g.fillRect(x - 7, y - 5, 14, 1.5); }
    g.fillStyle = '#3a2a20'; g.fillRect(x - 6 + walk, y - 2, 4, 2); g.fillRect(x + 2 - walk, y - 2, 4, 2);
  } else {
    g.fillStyle = pants;
    g.fillRect(x - 6, y - 14 + (walk > 0 ? 0 : 0), 5, 13 - walk * 1.5);
    g.fillRect(x + 1, y - 14, 5, 13 + walk * 1.5);
    g.fillStyle = '#222'; g.fillRect(x - 7, y - 2 - walk * 1.5, 6, 2.5); g.fillRect(x + 1, y - 2 + walk * 1.5, 6, 2.5);
  }

  const by = y - 13 - bob;
  // body (shirt / panjabi)
  const bodyH = L.panjabi ? 19 : 15;
  g.fillStyle = shirt;
  rr(g, x - 8, by - 15, 16, bodyH, 4); g.fill();
  if (L.uniform === 'police') {
    g.fillStyle = '#c9a74a'; g.fillRect(x - 8, by - 15, 16, 2); // shoulder
    g.fillStyle = '#222'; g.fillRect(x - 8, by - 3, 16, 2);      // belt
    if (!back) { g.fillStyle = '#d9c26a'; g.fillRect(x + 2, by - 11, 3, 3); }
  }
  if (L.uniform === 'officer' && !back) { g.fillStyle = '#8a2b2b'; g.fillRect(x - 1, by - 14, 2, 10); } // tie
  if (L.female) { g.fillStyle = L.hijab; g.beginPath(); g.moveTo(x - 9, by - 13); g.lineTo(x + 9, by - 6); g.lineTo(x + 9, by - 2); g.lineTo(x - 9, by - 9); g.fill(); }
  // arms
  g.fillStyle = shirt;
  g.fillRect(x - 11, by - 13 - walk, 3.5, 11); g.fillRect(x + 7.5, by - 13 + walk, 3.5, 11);
  g.fillStyle = L.skin;
  g.fillRect(x - 11, by - 3 - walk, 3.5, 3); g.fillRect(x + 7.5, by - 3 + walk, 3.5, 3);
  if (p.holding === 'file') { g.fillStyle = '#e8d48a'; g.fillRect(x + 6, by - 8, 8, 10); }

  // head
  const hy = by - 22;
  g.fillStyle = L.skin; g.beginPath(); g.arc(x, hy, 7.5, 0, 7); g.fill();
  if (L.female) {
    g.fillStyle = L.hijab; g.beginPath(); g.arc(x, hy - 1, 8.6, Math.PI * 0.95, Math.PI * 2.05); g.fill();
    if (back) { g.beginPath(); g.arc(x, hy, 8.6, 0, 7); g.fill(); }
    else { g.fillRect(x - 8.6, hy - 1, 2.5, 9); g.fillRect(x + 6.1, hy - 1, 2.5, 9); }
  } else if (back) {
    g.fillStyle = L.bald ? L.skin : '#1b1512'; g.beginPath(); g.arc(x, hy, 7.6, 0, 7); g.fill();
  } else if (!L.bald) {
    g.fillStyle = '#1b1512'; g.beginPath(); g.arc(x, hy - 1, 7.8, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(x - 7.8, hy - 2, 2, 4); g.fillRect(x + 5.8, hy - 2, 2, 4);
  } else { g.fillStyle = '#1b1512'; g.fillRect(x - 7.6, hy - 2, 2, 4); g.fillRect(x + 5.6, hy - 2, 2, 4); }
  if (!back) {
    g.fillStyle = '#1a1a1a'; g.fillRect(x - 3.5, hy, 2, 2); g.fillRect(x + 1.5, hy, 2, 2);
    if (L.beard) { g.fillStyle = '#1b1512'; g.beginPath(); g.arc(x, hy + 3, 6.5, 0.15, Math.PI - 0.15); g.fill(); }
    else { g.fillStyle = '#5a2e22'; g.fillRect(x - 2, hy + 4, 4, 1); }
    if (L.glasses) { g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(x - 5, hy - 1, 4, 3.5); g.strokeRect(x + 1, hy - 1, 4, 3.5); }
  }
  if (L.cap && !L.uniform) { g.fillStyle = '#f4f4f4'; g.beginPath(); g.ellipse(x, hy - 5, 7, 3.5, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(x - 7, hy - 6, 14, 2); }
  if (L.uniform === 'police') {
    g.fillStyle = '#2d3440'; g.beginPath(); g.ellipse(x, hy - 6, 9, 4, 0, 0, 7); g.fill();
    g.fillRect(x - 6, hy - 11, 12, 5); g.fillStyle = '#d9c26a'; g.fillRect(x - 1.5, hy - 10, 3, 3);
  }
}

// ---------- Moving traffic on the road ----------
function drawVehicle(g, v) {
  const { x, y, type, dir, color } = v;
  g.save(); g.translate(x, y); if (dir < 0) g.scale(-1, 1);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-28, 4, 60, 10);
  if (type === 'rickshaw') {
    g.fillStyle = '#222'; g.beginPath(); g.arc(-14, 8, 6, 0, 7); g.arc(14, 8, 6, 0, 7); g.fill();
    g.fillStyle = color; g.fillRect(-20, -14, 22, 18);                 // hood
    g.fillStyle = '#f2c230'; g.fillRect(-20, -14, 22, 3); g.fillStyle = '#e74c3c'; g.fillRect(-20, -2, 22, 3);
    g.fillStyle = '#555'; g.fillRect(2, 0, 20, 3);
    g.fillStyle = '#8d5a3b'; g.beginPath(); g.arc(20, -12, 4, 0, 7); g.fill(); // puller
    g.fillStyle = '#ddd'; g.fillRect(17, -8, 7, 9);
  } else if (type === 'cng') {
    g.fillStyle = '#222'; g.beginPath(); g.arc(-12, 9, 5, 0, 7); g.arc(14, 9, 5, 0, 7); g.fill();
    g.fillStyle = '#1f8a3a'; rr(g, -22, -16, 44, 26, 8); g.fill();
    g.fillStyle = '#111'; g.fillRect(-18, -12, 34, 8);
  } else if (type === 'bus') {
    g.fillStyle = '#222'; g.beginPath(); g.arc(-40, 10, 6, 0, 7); g.arc(40, 10, 6, 0, 7); g.fill();
    g.fillStyle = color; rr(g, -56, -24, 112, 34, 5); g.fill();
    g.fillStyle = '#9cc7d8'; for (let i = -50; i < 46; i += 16) g.fillRect(i, -18, 12, 10);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-56, 2, 112, 3);
  } else {
    g.fillStyle = '#222'; g.beginPath(); g.arc(-18, 9, 5, 0, 7); g.arc(18, 9, 5, 0, 7); g.fill();
    g.fillStyle = color; rr(g, -28, -14, 56, 24, 7); g.fill();
    g.fillStyle = '#2b3b46'; g.fillRect(-10, -12, 22, 10);
  }
  g.restore();
}

function drawFan(g, x, y, t) {
  g.save(); g.translate(x, y); g.rotate(t * 9);
  g.fillStyle = 'rgba(60,60,60,.28)';
  for (let i = 0; i < 3; i++) { g.rotate(Math.PI * 2 / 3); g.beginPath(); g.ellipse(16, 0, 16, 4, 0, 0, 7); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(40,40,40,.5)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
}

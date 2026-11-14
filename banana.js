/* Pew Pew — the banana section.
   A low-poly banana that aims where you tap and fires lasers and flowers.
   The crescent shape with the straight front is approved by Robin: do not restyle it without asking. */
import * as THREE from './vendor/three.module.min.js';

const section = document.getElementById('play');
const canvas = document.getElementById('banana');
const cta = document.getElementById('portfolio-cta');
const hint = document.getElementById('banana-hint');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- knobs you might want to tune ---------- */
const LOOK = {
  black: 0x0f0f0e,
  bolt: 0xff5a4d,            // laser colour
  boltSpeed: 24,             // units per second
  flowersPerShot: 7,
  flowerColors: [0xa9b0ff, 0xf4d7b5, 0x9db2a6, 0xffb3c7, 0xf1eee6],  // pastels from the portfolio deck
  flowerCentre: 0xffd84d,
  aimDepth: 0.6,             // the banana aims at a plane just behind itself, so we see it from the side
};

// Transparent canvas: the page's drifting background shows through, so there is no hard edge.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
camera.position.set(0, 0, 9);

/* ---------- light: soft and matte, like the bears ---------- */
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4f38, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0xa9b0ff, 1.3); rim.position.set(-4, 2, -3); scene.add(rim);
const flash = new THREE.PointLight(LOOK.bolt, 0, 9, 2); scene.add(flash);

/* ---------- stars ---------- */
{
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 70 + Math.random() * 90;
    const th = Math.random() * Math.PI * 2, y = (Math.random() * 2 - 1);
    const s = Math.sqrt(1 - y * y);
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * y * 0.8;
    pos[i * 3 + 2] = -Math.abs(r * s * Math.sin(th)) - 20;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf1eee6, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5 })));
}

/* ---------- the banana: low-poly, built from code ---------- */
const muzzleLocal = new THREE.Vector3();
function buildBanana() {
  // The crescent banana Robin approved. Do not restyle it without asking.
  const R = 1.5, r0 = 0.27, SIDES = 5;
  const TIP_STRAIGHT = 0.35;          // the front 35% is straight, so the barrel clearly points where it shoots
  const arcLen = R * THREE.MathUtils.degToRad(125);   // same overall length as before
  const B = THREE.MathUtils.degToRad(90);
  const A = B + (1 - TIP_STRAIGHT) * arcLen / R;      // the rest keeps the same curve as before
  const C = (hex) => new THREE.Color(hex);
  const tip = C(0x3b2f1e), deep = C(0xe0b834), yellow = C(0xf6cf3e), bright = C(0xf9dc5c),
        neck = C(0xc9c34a), stem = C(0x8a7a3a), stemEnd = C(0x4a3b22);
  // [position along the banana 0..1, thickness, colour]. Held by the stem; the dark tip is the barrel.
  const rings = [
    [0.00, 0.10, tip], [0.04, 0.42, deep], [0.14, 0.82, yellow], [0.30, 1.00, bright],
    [0.50, 1.04, bright], [0.70, 0.98, yellow], [0.84, 0.78, yellow], [0.92, 0.46, neck],
    [0.96, 0.27, stem], [1.07, 0.24, stem],
  ];
  function frame(t) {
    const tc = Math.min(Math.max(t, TIP_STRAIGHT), 1);
    const phi = A + (B - A) * (tc - TIP_STRAIGHT) / (1 - TIP_STRAIGHT);
    const P = new THREE.Vector3(R * Math.cos(phi), R * Math.sin(phi), 0);
    const T = new THREE.Vector3(Math.sin(phi), -Math.cos(phi), 0);
    const N = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    if (t < TIP_STRAIGHT) P.addScaledVector(T, (t - TIP_STRAIGHT) * arcLen);
    if (t > 1) P.addScaledVector(T, (t - 1) * arcLen);
    return { P, T, N };
  }
  const Bn = new THREE.Vector3(0, 0, 1);
  const mid = frame(0.5).P.clone();
  const ringPts = rings.map(([t, k]) => {
    const f = frame(t), pts = [];
    for (let i = 0; i < SIDES; i++) {
      const th = (i / SIDES) * Math.PI * 2;
      pts.push(f.P.clone().addScaledVector(f.N, Math.cos(th) * r0 * k).addScaledVector(Bn, Math.sin(th) * r0 * k).sub(mid));
    }
    return { pts, centre: f.P.clone().sub(mid) };
  });
  const pos = [], col = [];
  const tri = (a, b, c, color) => { for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); } };
  for (let i = 0; i < rings.length - 1; i++) {
    const c = rings[i][2].clone().lerp(rings[i + 1][2], 0.5);
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      const a = ringPts[i].pts[k], b = ringPts[i].pts[k2], d = ringPts[i + 1].pts[k], e = ringPts[i + 1].pts[k2];
      const shade = c.clone().multiplyScalar(0.94 + ((i * 7 + k * 3) % 5) * 0.03);   // slight facet variation
      tri(a, b, e, shade); tri(a, e, d, shade);
    }
  }
  const first = ringPts[0], last = ringPts[ringPts.length - 1];
  for (let k = 0; k < SIDES; k++) {
    const k2 = (k + 1) % SIDES;
    tri(first.centre, first.pts[k2], first.pts[k], tip);
    tri(last.centre, last.pts[k], last.pts[k2], stemEnd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }));
  // Turned over: the stem is the handle hanging down and back, the tip points exactly where we aim.
  const half = Math.atan2(Math.cos(A), -Math.sin(A)) / 2;
  mesh.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(half), Math.sin(half), 0), Math.PI);
  muzzleLocal.copy(first.centre).applyQuaternion(mesh.quaternion);
  return mesh;
}

const pivot = new THREE.Group();   // aims the banana
const kick = new THREE.Group();    // recoil
kick.add(buildBanana());
pivot.add(kick);
scene.add(pivot);
const basePos = new THREE.Vector3(0, -0.5, 1.5);

/* ---------- laser bolts ---------- */
const boltCore = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff1ea });
const glowTex = (() => {            // a soft streak of light, painted once
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.translate(128, 32); x.scale(4, 1);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(-32, -32, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const bolts = [];
const UP = new THREE.Vector3(0, 1, 0);
function spawnBolt(from, dir) {
  let b = bolts.find((x) => !x.alive);
  if (!b) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(boltCore, coreMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: LOOK.bolt, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(5.2, 0.95, 1);
    g.add(core); scene.add(g); scene.add(glow);
    b = { g, glow, dir: new THREE.Vector3(), alive: false, age: 0, travelled: 0 };
    bolts.push(b);
  }
  b.alive = true; b.age = 0; b.travelled = 0;
  b.dir.copy(dir);
  b.g.position.copy(from).addScaledVector(dir, 1.3);
  b.g.quaternion.setFromUnitVectors(UP, dir);
  b.g.visible = true;
  // turn the glow streak to match the bolt's direction on screen
  const p0 = from.clone().project(camera), p1 = from.clone().addScaledVector(dir, 2).project(camera);
  b.glow.material.rotation = Math.atan2(p1.y - p0.y, (p1.x - p0.x) * camera.aspect);
  b.glow.scale.x = Math.max(0.95, 5.2 * Math.sqrt(Math.max(0, 1 - dir.z * dir.z)));   // shorter streak when flying away from us
  b.glow.position.copy(b.g.position);
  b.glow.visible = true;
}

/* ---------- flowers instead of muzzle fire ---------- */
const petalGeo = new THREE.IcosahedronGeometry(0.5, 0); petalGeo.scale(1, 0.32, 0.62);
const centreGeo = new THREE.IcosahedronGeometry(0.34, 0);
const petalMats = LOOK.flowerColors.map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 }));
const centreMat = new THREE.MeshStandardMaterial({ color: LOOK.flowerCentre, flatShading: true, roughness: 0.9 });
const flowers = [];
function makeFlower() {
  const g = new THREE.Group();
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(petalGeo, petalMats[0]);
    const a = (i / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    p.rotation.y = -a;
    g.add(p); petals.push(p);
  }
  const c = new THREE.Mesh(centreGeo, centreMat); c.scale.y = 0.7; g.add(c);
  g.visible = false; scene.add(g);
  return { g, petals, vel: new THREE.Vector3(), spin: new THREE.Vector3(), alive: false, age: 0, life: 1, size: 0.2 };
}
function spawnFlowers(from, dir) {
  for (let i = 0; i < LOOK.flowersPerShot; i++) {
    let f = flowers.find((x) => !x.alive);
    if (!f) { if (flowers.length >= 48) return; f = makeFlower(); flowers.push(f); }
    const mat = petalMats[(Math.random() * petalMats.length) | 0];
    f.petals.forEach((p) => { p.material = mat; });
    f.alive = true; f.age = 0; f.life = 1.3 + Math.random() * 1.0; f.size = 0.17 + Math.random() * 0.16;
    f.g.position.copy(from);
    f.vel.copy(dir).multiplyScalar(1.6 + Math.random() * 3.2)
      .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(3.4));
    f.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(7);
    f.g.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    f.g.scale.setScalar(0.001);
    f.g.visible = true;
  }
}

/* ---------- aiming and firing ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const aimPoint = new THREE.Vector3(-4, 2, LOOK.aimDepth);
const targetQ = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const vF = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3(), vTmp = new THREE.Vector3();
let lastInput = -10, recoil = 0;
const queue = [];   // second "pew" of each pair

function pointFromEvent(e, out) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const s = (LOOK.aimDepth - ray.ray.origin.z) / ray.ray.direction.z;
  out.copy(ray.ray.origin).addScaledVector(ray.ray.direction, s);
  // a tap right on the banana would point it straight away from us; nudge the aim outwards instead
  let dx = out.x - basePos.x, dy = out.y - basePos.y;
  const len = Math.hypot(dx, dy), MIN = 2.0;
  if (len < MIN) {
    if (len < 0.001) { dx = 1; dy = 0.4; }
    const k = MIN / Math.hypot(dx, dy);
    out.x = basePos.x + dx * k; out.y = basePos.y + dy * k;
  }
  return out;
}
function aimQuaternion(point, out) {
  vF.copy(point).sub(pivot.position);
  const dist = vF.length();
  vF.normalize();
  vZ.crossVectors(vF, UP);
  if (vZ.lengthSq() < 1e-6) vZ.set(1, 0, 0);
  vZ.normalize();
  vY.crossVectors(vZ, vF);
  // The tip sits a little off the banana's turning point. Tilt the aim by that much,
  // so the straight line out of the barrel goes through the point, not beside it.
  const sn = THREE.MathUtils.clamp(muzzleLocal.y / Math.max(dist, 0.001), -0.9, 0.9), cs = Math.sqrt(1 - sn * sn);
  vTmp.copy(vF);
  vF.multiplyScalar(cs).addScaledVector(vY, -sn);
  vY.multiplyScalar(cs).addScaledVector(vTmp, sn);
  m4.makeBasis(vF, vY, vZ);
  return out.setFromRotationMatrix(m4);
}
function muzzleWorld(out) { return kick.localToWorld(out.copy(muzzleLocal)); }
function shoot() {
  pivot.updateMatrixWorld(true);
  const from = muzzleWorld(new THREE.Vector3());
  const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(pivot.quaternion);   // straight out of the barrel
  spawnBolt(from, dir);
  spawnFlowers(from, dir);
  flash.position.copy(from); flash.intensity = 26;
  recoil = 1;
}

let clock = null;
function fireAt(clientX, clientY) {
  pointFromEvent({ clientX, clientY }, aimPoint);
  lastInput = clock.getElapsedTime();
  aimQuaternion(aimPoint, targetQ);
  pivot.quaternion.copy(targetQ);   // snap to the target, so the shot goes where you tapped
  shoot();
  queue.push(clock.getElapsedTime() + 0.13);
  if (hint) hint.textContent = 'Pew pew';     // the label names the shot, like the bears' label names the move
}
// "click" only fires for a tap, never for a swipe, so scrolling past on a phone still works.
canvas.addEventListener('click', (e) => fireAt(e.clientX, e.clientY));
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointFromEvent(e, aimPoint);
  lastInput = clock.getElapsedTime();
});

// The portfolio link: the banana shoots at it first, then the link opens.
if (cta) {
  cta.addEventListener('click', (e) => {
    if (reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;   // behave like a normal link
    e.preventDefault();
    const r = cta.getBoundingClientRect();
    fireAt(r.left + r.width / 2, r.top + r.height / 2);
    setTimeout(() => { window.location.href = cta.href; }, 750);
  });
}

pivot.position.copy(basePos);
aimQuaternion(aimPoint, pivot.quaternion);

/* ---------- layout ---------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.position.z = camera.aspect < 1 ? 9 + (1 - camera.aspect) * 7 : 9;   // step back on tall phones
  if (camera.aspect < 1) basePos.set(0.3, 0.7, 1.5);    // phone: banana in the upper part, text below
  else basePos.set(1.6, 0.1, 1.5);                      // wide: banana to the right, text on the left
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

/* ---------- the loop ---------- */
clock = new THREE.Clock();
let running = false;
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
function tick() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  // when nobody is touching it, the banana idly scans the sky
  if (t - lastInput > 2.5) {
    aimPoint.set(basePos.x - 4.2 + Math.sin(t * 0.31) * 1.4, basePos.y + 1.8 + Math.sin(t * 0.47) * 1.4, LOOK.aimDepth);
  }
  pivot.position.copy(basePos);
  pivot.position.y += Math.sin(t * 1.3) * 0.07;
  aimQuaternion(aimPoint, targetQ);
  pivot.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 9));

  // recoil: a small kick back and up, then settle
  recoil *= Math.exp(-dt * 9);
  kick.position.x = -0.32 * recoil;
  kick.rotation.z = 0.26 * recoil;
  flash.intensity *= Math.exp(-dt * 16);

  while (queue.length && queue[0] <= t) { queue.shift(); shoot(); }

  for (const b of bolts) {
    if (!b.alive) continue;
    const step = LOOK.boltSpeed * dt;
    b.g.position.addScaledVector(b.dir, step);
    b.travelled += step; b.age += dt;
    b.g.scale.y = Math.min(1, b.age / 0.06);
    b.glow.position.copy(b.g.position);
    if (b.travelled > 60) { b.alive = false; b.g.visible = false; b.glow.visible = false; }
  }

  for (const f of flowers) {
    if (!f.alive) continue;
    f.age += dt;
    const k = f.age / f.life;
    if (k >= 1) { f.alive = false; f.g.visible = false; continue; }
    f.vel.multiplyScalar(Math.exp(-dt * 1.5));
    f.vel.y -= 0.9 * dt;                       // very gentle fall, we are in space after all
    f.g.position.addScaledVector(f.vel, dt);
    f.g.rotation.x += f.spin.x * dt; f.g.rotation.y += f.spin.y * dt; f.g.rotation.z += f.spin.z * dt;
    const pop = k < 0.14 ? easeOutBack(k / 0.14) : 1;
    const fade = k > 0.62 ? 1 - (k - 0.62) / 0.38 : 1;
    f.g.scale.setScalar(Math.max(0.001, f.size * pop * fade));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
// Only run while the section is on screen, to save battery.
new IntersectionObserver((entries) => {
  const on = entries[0].isIntersecting;
  section.classList.toggle('is-live', on);
  if (on && !running) { running = true; clock.getDelta(); requestAnimationFrame(tick); }
  else if (!on) running = false;
}, { threshold: 0.15 }).observe(section);

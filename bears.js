/* Pew Pew — the bears in the "We join your team" section.
   Three copies of Robin's own low-poly bear, dancing the same move in sync. Tap for the next move.
   Size, spacing and starting angles are approved by Robin: do not change them without asking. */
import * as THREE from './vendor/three.module.min.js';

/* ---------- knobs ---------- */
const LOOK = {
  brighten: 2.4,        // the Blender brown is very dark on a black page; lift it a little. 1 = exactly as in the file
  faceTurn: -0.55,      // resting three-quarter view, in radians
  // where each bear stands: [left-right, front-back, extra turn]. One in front, two behind.
  // The left one shows more of its side, the right one faces you more, like in the portfolio deck.
  spots: [[0, 0.35, 0], [-1.85, -0.35, -0.16], [1.85, -0.35, 0.1]],
  distance: 9.6,        // how far away the camera is; it sets how strong the perspective is
  floor: -0.2, ceiling: 2.25,   // the slice of height the canvas shows: feet at 0, room above for the hop and the pirouette
};

const canvas = document.getElementById('bears');
const hint = document.getElementById('bears-hint');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3228, 1.5));
const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(-2.5, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xa9b0ff, 1.6); rim.position.set(4, 2, -4); scene.add(rim);

/* ---------- the bear: Robin's own Blender model, loaded as data ---------- */
const HIP_Z = -0.43;                // where the hips are, front to back
const HIP_DROP = 0.18;              // how far the tops of the legs sit below the hips

/* ---------- the skeleton ----------
   Joint positions were measured from the model. Each bone also has a line segment and a radius,
   used once at load to decide which bones each corner of the mesh follows. */
const LEG_X = 0.12, FRONT_Z = 0.38, HIND_Z = -0.43;
const SPEC = [
  // name     parent    joint position          segment start        segment end          radius
  ['hips',   null,     [0, 0.68, HIP_Z],        [0, 0.68, -0.68],    [0, 0.68, -0.26],    0.30],
  ['spine',  'hips',   [0, 0.68, -0.22],        [0, 0.66, -0.24],    [0, 0.66, 0.12],     0.30],
  ['chest',  'spine',  [0, 0.68, 0.14],         [0, 0.68, 0.14],     [0, 0.70, 0.48],     0.30],
  ['head',   'chest',  [0, 0.70, 0.52],         [0, 0.70, 0.60],     [0, 0.60, 0.95],     0.30],
  ['flU',    'chest',  [LEG_X, 0.50, FRONT_Z],  [LEG_X, 0.48, FRONT_Z],  [LEG_X, 0.27, FRONT_Z],  0.10],
  ['flL',    'flU',    [LEG_X, 0.25, FRONT_Z],  [LEG_X, 0.23, FRONT_Z],  [LEG_X, 0.0, 0.46],      0.10],
  ['frU',    'chest',  [-LEG_X, 0.50, FRONT_Z], [-LEG_X, 0.48, FRONT_Z], [-LEG_X, 0.27, FRONT_Z], 0.10],
  ['frL',    'frU',    [-LEG_X, 0.25, FRONT_Z], [-LEG_X, 0.23, FRONT_Z], [-LEG_X, 0.0, 0.46],     0.10],
  ['hlU',    'hips',   [LEG_X, 0.50, HIND_Z],   [LEG_X, 0.48, HIND_Z],   [LEG_X, 0.27, HIND_Z],   0.10],
  ['hlL',    'hlU',    [LEG_X, 0.25, HIND_Z],   [LEG_X, 0.23, HIND_Z],   [LEG_X, 0.0, -0.37],     0.10],
  ['hrU',    'hips',   [-LEG_X, 0.50, HIND_Z],  [-LEG_X, 0.48, HIND_Z],  [-LEG_X, 0.27, HIND_Z],  0.10],
  ['hrL',    'hrU',    [-LEG_X, 0.25, HIND_Z],  [-LEG_X, 0.23, HIND_Z],  [-LEG_X, 0.0, -0.37],    0.10],
];
const rest = {};
for (const [name, , at] of SPEC) rest[name] = new THREE.Vector3(...at);

const data = await (await fetch('bear.json')).json();
const bears = [];
{
  const P = data.positions, n = P.length / 3;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), ab = new THREE.Vector3(), q = new THREE.Vector3();
  const cache = new Map();   // the same corner appears in several triangles; give every copy identical weights so nothing tears
  for (let i = 0; i < n; i++) {
    const key = P[i * 3] + ',' + P[i * 3 + 1] + ',' + P[i * 3 + 2];
    let w = cache.get(key);
    if (!w) {
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const scored = SPEC.map(([, , , s0, s1, r], bi) => {
        a.set(...s0); b.set(...s1); ab.subVectors(b, a);
        const t = Math.min(1, Math.max(0, q.subVectors(v, a).dot(ab) / ab.lengthSq()));
        const d = q.copy(a).addScaledVector(ab, t).distanceTo(v);
        return [bi, Math.pow(Math.max(d / r, 0.05), -7)];     // nearer bones win strongly, so the facets stay crisp
      }).sort((x, y) => y[1] - x[1]).slice(0, 3);
      let sum = scored.reduce((acc, x) => acc + x[1], 0);
      w = scored.map(([bi, sc]) => [bi, sc / sum]);
      if (w[0][1] > 0.9) w = [[w[0][0], 1], [0, 0], [0, 0]];   // fully owned by one bone
      cache.set(key, w);
    }
    for (let k = 0; k < 3; k++) { skinIndex[i * 4 + k] = w[k][0]; skinWeight[i * 4 + k] = w[k][1]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  g.computeVertexNormals();
  const c = new THREE.Color().setRGB(...data.colorLinear.map((x) => Math.min(1, x * LOOK.brighten)));
  const mat = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: data.roughness, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.35 });
  // Every bear shares the same shape and colour but gets its own skeleton.
  LOOK.spots.forEach(([x, z, extraTurn], i) => {
    const root = new THREE.Group();     // where the bear stands, plus hops
    const yaw = new THREE.Group();      // turning on the spot
    const shift = new THREE.Group();    // moves the spin axis to the pose's pivot
    const body = new THREE.Group();     // squash and stretch
    scene.add(root); root.add(yaw); yaw.add(shift); shift.add(body);
    const bone = {}, boneList = [];
    for (const [name, parent] of SPEC) {
      const b = new THREE.Bone(); b.name = name;
      b.position.copy(rest[name]); if (parent) { b.position.sub(rest[parent]); bone[parent].add(b); }
      bone[name] = b; boneList.push(b);
    }
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.frustumCulled = false;
    mesh.add(bone.hips);
    body.add(mesh);
    mesh.bind(new THREE.Skeleton(boneList));
    for (const e of data.eyes) {     // the eyes ride on the head bone
      const eye = new THREE.Mesh(new THREE.SphereGeometry(e.r, 12, 10), eyeMat);
      eye.position.set(...e.p).sub(rest.head); bone.head.add(eye);
    }
    bears.push({ x, z, face: LOOK.faceTurn + extraTurn, root, yaw, shift, body, bone, phase: i * 2.1 });   // phase: each one idles a little differently
  });
}

/* ---------- dance moves ---------- */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const TAU = Math.PI * 2;
// Each move takes u (0..1 through the move) and returns a pose.
// Whole body: turn (spin), hop (height), squash (1 = normal),
//   pivot [x, z] (the spot on the bear that the spin turns around), slide (body moved back or forward).
// Bones: [pitch, yaw, roll] in radians. Pitch + = nose or foot swings down and back.
// Legs: [upper swing, knee bend, sideways splay].
const MOVES = [
  { name: 'pirouette', secs: 3.0, pose: (u) => {
      const up = smooth(0, 0.22, u) * (1 - smooth(0.8, 1, u)), a = up * 1.22;
      return {
        turn: TAU * 2 * inOut((u - 0.16) / 0.68), squash: 1,
        // Rising tips the body back around the hips, which would lift and slide the feet.
        // Lower and move the body by the same amount so the standing foot stays planted, and spin around that foot.
        hop: -HIP_DROP * (1 - Math.cos(a)), slide: -HIP_DROP * Math.sin(a),
        pivot: [LEG_X * up, (HIND_Z + 0.04) * up],
        hips: [-a, 0, 0], head: [up * 0.8, 0, 0],
        hl: [a, 0, 0],                               // standing leg stays straight under the body
        hr: [a - up * 1.35, up * 1.5, -up * 0.35],   // other knee lifted high, foot by the standing knee, like a dancer
        fl: [-up * 2.2, up * 0.55, up * 0.3], fr: [-up * 2.2, up * 0.55, -up * 0.3],   // arms rounded overhead
      };
    } },
  { name: 'hop spin', secs: 1.3, pose: (u) => {
      const v = clamp01((u - 0.22) / 0.56), air = Math.sin(Math.PI * v);
      const crouch = smooth(0, 0.2, u) * (1 - smooth(0.2, 0.32, u)) + smooth(0.76, 0.85, u) * (1 - smooth(0.85, 1, u));
      const k = crouch * 0.9 + air * 0.8;            // how folded the legs are
      return {
        turn: TAU * inOut(v), hop: air * 0.75 - crouch * 0.07, squash: 1 - crouch * 0.1 + air * 0.06,
        head: [-air * 0.25 + crouch * 0.2, 0, 0],
        fl: [-k * 0.55, k * 1.1, air * 0.25], fr: [-k * 0.55, k * 1.1, -air * 0.25],
        hl: [-k * 0.55, k * 1.1, air * 0.2], hr: [-k * 0.55, k * 1.1, -air * 0.2],
      };
    } },
  { name: 'wiggle', secs: 2.0, pose: (u) => {
      const env = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u)), w = u * TAU * 4, s = Math.sin(w) * env;
      return {
        hop: Math.abs(Math.sin(w)) * 0.03 * env, squash: 1,
        hips: [0, s * 0.3, s * 0.12], spine: [0, -s * 0.3, -s * 0.06], chest: [0, -s * 0.22, -s * 0.1],
        head: [0, s * 0.3, s * 0.25],
        fl: [-Math.max(0, s) * 0.55, Math.max(0, s) * 1.0, 0], fr: [-Math.max(0, -s) * 0.55, Math.max(0, -s) * 1.0, 0],
      };
    } },
];
const ZERO = [0, 0, 0];
function applyPose(bone, p, t) {
  const set = (b, r) => b.rotation.set(r[0], r[1], r[2]);
  set(bone.hips, p.hips || ZERO); set(bone.spine, p.spine || ZERO); set(bone.chest, p.chest || ZERO);
  const h = p.head || ZERO;
  set(bone.head, [h[0] + Math.sin(t * 0.9) * 0.03, h[1] + Math.sin(t * 0.5) * 0.14, h[2]]);   // idle: looks around a little
  for (const leg of ['fl', 'fr', 'hl', 'hr']) {
    const r = p[leg] || ZERO;
    bone[leg + 'U'].rotation.set(r[0], 0, r[2]);
    bone[leg + 'L'].rotation.set(r[1], 0, 0);
  }
}
let current = null, startAt = 0, nextIndex = 0, queued = false;
function dance() {
  if (current) { queued = true; return; }   // finish the move in progress, then do the next
  current = MOVES[nextIndex]; nextIndex = (nextIndex + 1) % MOVES.length;
  startAt = clock.getElapsedTime();
  hint.textContent = current.name;
}
// a tap, or a sideways swipe
let downX = null, swiped = false;
canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; swiped = false; });
canvas.addEventListener('pointerup', (e) => { if (downX !== null && Math.abs(e.clientX - downX) > 30) { swiped = true; dance(); } downX = null; });
canvas.addEventListener('click', () => { if (!swiped) dance(); });

/* ---------- layout ---------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // The camera stays at one distance and zooms instead, so the bears keep the same perspective on every screen.
  // Zoom until all three fit across and the tallest move fits top to bottom.
  const span = Math.max(...LOOK.spots.map(([x]) => Math.abs(x))) * 2 + 2.4;
  const half = Math.max((LOOK.ceiling - LOOK.floor) / 2, span / (2 * camera.aspect));
  const mid = (LOOK.ceiling + LOOK.floor) / 2;
  camera.fov = 2 * Math.atan(half / LOOK.distance) * 180 / Math.PI;
  camera.position.set(0, mid + 0.4, LOOK.distance);
  camera.lookAt(0, mid, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

/* ---------- the loop ---------- */
const clock = new THREE.Clock();
let running = false;
function tick() {
  if (!running) return;
  const t = clock.getElapsedTime();
  let p = {};
  if (current) {
    const u = (t - startAt) / current.secs;
    if (u >= 1) { current = null; if (queued) { queued = false; dance(); } }
    else p = current.pose(u);
  }
  const [px, pz] = p.pivot || [0, 0];
  for (const bear of bears) {      // every bear gets the same pose, so they dance in sync
    const ti = t + bear.phase;
    applyPose(bear.bone, p, ti);
    const cf = Math.cos(bear.face), sf = Math.sin(bear.face);
    bear.yaw.rotation.y = bear.face + Math.sin(ti * 0.4) * 0.06 + (p.turn || 0);
    // Spin around the pose's pivot (the standing foot in the pirouette), not around the middle of the body.
    bear.shift.position.set(-px, 0, -pz + (p.slide || 0));
    bear.root.position.set(bear.x + px * cf + pz * sf, p.hop || 0, bear.z - px * sf + pz * cf);
    const s = (p.squash || 1) + Math.sin(ti * 1.6) * 0.012, k = 1 / Math.sqrt(s);   // breathing
    bear.body.scale.set(k, s, k);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
// Only run while the bears are on screen, to save battery. The first time they come into view they do one move unasked.
let greeted = false;
new IntersectionObserver((entries) => {
  const on = entries[0].isIntersecting;
  if (on && !running) { running = true; requestAnimationFrame(tick); }
  else if (!on) running = false;
  if (on && !greeted && !reduceMotion && entries[0].intersectionRatio > 0.6) { greeted = true; setTimeout(dance, 700); }
}, { threshold: [0, 0.6] }).observe(canvas);

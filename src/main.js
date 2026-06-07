import "./styles.css";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const OSS_ASSET_BASE = "https://xc-public.oss-cn-chengdu.aliyuncs.com/assets/assets/";
const shooterUrl = `${OSS_ASSET_BASE}%E9%93%83%E9%93%9B-CG-kDcnl.glb`;
const keeperUrl = `${OSS_ASSET_BASE}%E7%8C%AA%E5%B0%8F%E5%BC%9F-BTeDCkvq.glb`;

const canvas = document.querySelector("#game-canvas");
const loadStatus = document.querySelector("#load-status");
const animationStatus = document.querySelector("#animation-status");
const inputStatus = document.querySelector("#input-status");
const scoreRound = document.querySelector("#score-round");
const scoreLeft = document.querySelector("#score-left");
const scoreRight = document.querySelector("#score-right");
canvas.focus();

const FIELD_WIDTH = 18;
const FIELD_LENGTH = 30;
const HALF_WIDTH = FIELD_WIDTH / 2;
const HALF_LENGTH = FIELD_LENGTH / 2;
const GOAL_Z = -HALF_LENGTH - 0.55;
const GOAL_WIDTH = 4.2;
const GOAL_HEIGHT = 1.55;
const SHOT_START = new THREE.Vector3(0, 0.3, -7.6);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8ee);
scene.fog = new THREE.Fog(0x8fc8ee, 42, 92);

const shooterCamera = new THREE.PerspectiveCamera(54, 1, 0.05, 160);
const keeperCamera = new THREE.PerspectiveCamera(54, 1, 0.05, 160);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x7aa176, 1.25);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff3d5, 2.8);
sun.position.set(-9, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);

const game = {
  phase: "ready",
  round: 1,
  maxRounds: 5,
  shooterScore: 0,
  keeperScore: 0,
  charge: 0,
  aimX: 0,
  aimY: 0.42,
  message: "射手按住 Space 蓄力，松开射门",
  resultTimer: 0,
  ballVelocity: new THREE.Vector3(),
  keeperDiveTimer: 0,
};

const keys = new Set();
let lastFrameTime = performance.now();
const tempVector = new THREE.Vector3();
const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();

const shooter = createActor({
  role: "shooter",
  url: shooterUrl,
  name: "铃铛",
  markerColor: 0xffffff,
  start: new THREE.Vector3(-0.75, 0.05, -6.3),
  targetHeight: 1.55,
  speed: 3.8,
});

const keeper = createActor({
  role: "keeper",
  url: keeperUrl,
  name: "猪小弟",
  markerColor: 0xfff2a8,
  start: new THREE.Vector3(0, 0.05, -13.65),
  targetHeight: 1.35,
  speed: 4.4,
});

const ball = createFootball();
const aimReticle = createAimReticle();
const chargeMeter = createChargeMeter();
const shotArrow = createShotArrow();
scene.add(ball, aimReticle, chargeMeter.root, shotArrow);

createWorld();
loadActors();
resetRound();
renderer.setAnimationLoop(tick);

window.__schoolFootballGame = {
  game,
  shooter,
  keeper,
  scene,
  shooterCamera,
  keeperCamera,
  renderer,
};
window.__lastGameInput = "none";

window.addEventListener("resize", handleResize);
const controlledKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "KeyR",
]);
const handledKeyEvents = new WeakSet();

document.addEventListener("pointerdown", () => canvas.focus());

window.addEventListener("keydown", (event) => {
  if (handledKeyEvents.has(event)) return;
  handledKeyEvents.add(event);
  const code = getKeyCode(event);
  if (controlledKeys.has(code)) event.preventDefault();
  keys.add(code);
  window.__lastGameInput = `down:${code}`;
  updateInputStatus();

  if (code === "KeyR") {
    resetMatch();
  }

  if (code === "Space") {
    if (game.phase === "ready") {
      startCharging("Space");
    }
  }

  if (code === "Enter" && game.phase === "shot") {
    game.keeperDiveTimer = 0.48;
  }
});

window.addEventListener("keyup", (event) => {
  if (handledKeyEvents.has(event)) return;
  handledKeyEvents.add(event);
  const code = getKeyCode(event);
  if (controlledKeys.has(code)) event.preventDefault();
  keys.delete(code);
  window.__lastGameInput = `up:${code}`;
  updateInputStatus();
  if (code === "Space" && game.phase === "charging") {
    shootBall();
  }
});
document.addEventListener("keydown", handleCapturedKeyDown, true);
document.addEventListener("keyup", handleCapturedKeyUp, true);
canvas.addEventListener("keydown", handleCapturedKeyDown, true);
canvas.addEventListener("keyup", handleCapturedKeyUp, true);
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) keys.clear();
});

function handleCapturedKeyDown(event) {
  if (handledKeyEvents.has(event)) return;
  handledKeyEvents.add(event);
  const code = getKeyCode(event);
  if (!controlledKeys.has(code)) return;
  event.preventDefault();
  keys.add(code);
  window.__lastGameInput = `down:${code}`;
  updateInputStatus();

  if (code === "KeyR") {
    resetMatch();
  } else if (code === "Space" && game.phase === "ready") {
    startCharging("Space");
  } else if (code === "Enter" && game.phase === "shot") {
    game.keeperDiveTimer = 0.48;
  }
}

function handleCapturedKeyUp(event) {
  if (handledKeyEvents.has(event)) return;
  handledKeyEvents.add(event);
  const code = getKeyCode(event);
  if (!controlledKeys.has(code)) return;
  event.preventDefault();
  keys.delete(code);
  window.__lastGameInput = `up:${code}`;
  updateInputStatus();

  if (code === "Space" && game.phase === "charging") {
    shootBall();
  }
}

function startCharging(source) {
  game.phase = "charging";
  game.charge = 0;
  game.message = `蓄力中（${source}）：A/D 调左右，W/S 调高低，松开射门`;
  updateHud();
}

function updateInputStatus() {
  if (!inputStatus) return;
  const active = [...keys].join(" / ");
  inputStatus.textContent = active ? `输入：${active}` : "输入：等待操作";
}

function getKeyCode(event) {
  if (event.code) return event.code;
  const keyMap = {
    w: "KeyW",
    a: "KeyA",
    s: "KeyS",
    d: "KeyD",
    W: "KeyW",
    A: "KeyA",
    S: "KeyS",
    D: "KeyD",
    " ": "Space",
    Spacebar: "Space",
    Enter: "Enter",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    i: "KeyI",
    j: "KeyJ",
    k: "KeyK",
    l: "KeyL",
    r: "KeyR",
    I: "KeyI",
    J: "KeyJ",
    K: "KeyK",
    L: "KeyL",
    R: "KeyR",
  };
  return keyMap[event.key] ?? event.key;
}

function createActor({ role, url, name, markerColor, start, targetHeight, speed }) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.39, 48),
    new THREE.MeshBasicMaterial({
      color: markerColor,
      transparent: true,
      opacity: 0.86,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.018;

  const actor = {
    role,
    url,
    name,
    root: new THREE.Group(),
    model: null,
    marker,
    mixer: null,
    clips: [],
    actions: new Map(),
    activeAction: null,
    idleAction: null,
    moveAction: null,
    ready: false,
    proceduralRig: null,
    proceduralMode: "idle",
    proceduralTime: 0,
    start,
    targetHeight,
    speed,
    direction: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  };

  actor.root.position.copy(start);
  actor.root.add(marker);
  scene.add(actor.root);
  return actor;
}

async function loadActors() {
  setLoadStatus("正在加载两个角色...");
  const loader = new GLTFLoader();

  try {
    await Promise.all([loadActor(loader, shooter), loadActor(loader, keeper)]);
    setLoadStatus("加载完成。");
    updateHud();
  } catch (error) {
    console.error(error);
    setLoadStatus("角色 GLB 加载失败，请检查资源文件。");
  }
}

async function loadActor(loader, actor) {
  const gltf = await loader.loadAsync(actor.url);
  const model = gltf.scene;
  normalizeActorModel(model, actor.targetHeight);

  model.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (child.material) {
        child.material = child.material.clone();
        child.material.side = THREE.DoubleSide;
      }
    }
  });

  actor.model = model;
  actor.root.add(model);
  actor.mixer = new THREE.AnimationMixer(model);
  actor.clips = gltf.animations;
  actor.proceduralRig = createProceduralRig(model);
  actor.ready = true;
  setupActorAnimations(actor);
}

function normalizeActorModel(model, targetHeight) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetHeight / maxSize;

  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y += (size.y * scale) / 2;
}

function setupActorAnimations(actor) {
  if (!actor.clips.length) {
    return;
  }

  for (const clip of actor.clips) {
    actor.actions.set(clip.name, actor.mixer.clipAction(clip));
  }

  const idleClip = findClip(actor, ["idle", "stand", "待机"]) ?? actor.clips[0];
  const moveClip =
    findClip(actor, ["walk", "run", "jog", "move", "走", "跑"]) ??
    actor.clips[Math.min(1, actor.clips.length - 1)];

  actor.idleAction = actor.actions.get(idleClip.name);
  actor.moveAction = actor.actions.get(moveClip.name);
  playActorAction(actor, actor.idleAction);
}

function findClip(actor, keywords) {
  return actor.clips.find((clip) => {
    const name = clip.name.toLowerCase();
    return keywords.some((keyword) => name.includes(keyword.toLowerCase()));
  });
}

function playActorAction(actor, action) {
  if (!action || action === actor.activeAction) return;

  action.enabled = true;
  action.reset();
  action.setEffectiveWeight(1);
  action.setEffectiveTimeScale(1);
  action.play();

  if (actor.activeAction) {
    actor.activeAction.crossFadeTo(action, 0.22, false);
  }

  actor.activeAction = action;
}

function createWorld() {
  setLoadStatus("正在生成点球大赛球场...");

  createTrack();
  createTurf();
  createFieldLines();
  createGoals();
  createSchoolBuildings();
  createBleachers();
  createTrees();
  createBanner();
  createPerimeterFence();
  createSplitMarkers();

  setLoadStatus("球场已生成，正在加载角色...");
}

function createTrack() {
  const trackTexture = createTrackTexture();
  trackTexture.wrapS = THREE.RepeatWrapping;
  trackTexture.wrapT = THREE.RepeatWrapping;
  trackTexture.repeat.set(2.4, 3.4);

  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 48),
    new THREE.MeshStandardMaterial({
      color: 0xb84234,
      roughness: 0.82,
      map: trackTexture,
    }),
  );
  track.rotation.x = -Math.PI / 2;
  track.receiveShadow = true;
  scene.add(track);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(25.5, 37.5),
    new THREE.MeshStandardMaterial({ color: 0x2f8f42, roughness: 0.95 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.01;
  apron.receiveShadow = true;
  scene.add(apron);
}

function createTurf() {
  const turfTexture = createTurfTexture();
  turfTexture.wrapS = THREE.RepeatWrapping;
  turfTexture.wrapT = THREE.RepeatWrapping;
  turfTexture.repeat.set(6, 10);

  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH),
    new THREE.MeshStandardMaterial({
      color: 0x247b3b,
      roughness: 0.9,
      map: turfTexture,
    }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.025;
  turf.receiveShadow = true;
  scene.add(turf);

  for (let i = 0; i < 10; i += 1) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH / 10),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x2f9348 : 0x236f38,
        transparent: true,
        opacity: 0.22,
      }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.032, -HALF_LENGTH + FIELD_LENGTH / 20 + i * (FIELD_LENGTH / 10));
    scene.add(stripe);
  }
}

function createFieldLines() {
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const lineY = 0.045;
  const w = 0.085;

  addLine(0, -HALF_LENGTH, FIELD_WIDTH + w, w, lineMat, lineY);
  addLine(0, HALF_LENGTH, FIELD_WIDTH + w, w, lineMat, lineY);
  addLine(-HALF_WIDTH, 0, w, FIELD_LENGTH + w, lineMat, lineY);
  addLine(HALF_WIDTH, 0, w, FIELD_LENGTH + w, lineMat, lineY);
  addLine(0, 0, FIELD_WIDTH, w, lineMat, lineY);
  addCircle(0, 0, 2.3, lineMat, lineY);
  addCircle(0, 0, 0.14, lineMat, lineY, 16);
  addPenaltyBox(-1);
  addPenaltyBox(1);

  function addPenaltyBox(side) {
    const z = side * HALF_LENGTH;
    const boxDepth = 4.8;
    const boxWidth = 9.8;
    const smallDepth = 2.1;
    const smallWidth = 5.6;
    const penaltySpotZ = z - side * 3.4;

    addLine(0, z - side * boxDepth, boxWidth, w, lineMat, lineY);
    addLine(-boxWidth / 2, z - side * boxDepth / 2, w, boxDepth, lineMat, lineY);
    addLine(boxWidth / 2, z - side * boxDepth / 2, w, boxDepth, lineMat, lineY);
    addLine(0, z - side * smallDepth, smallWidth, w, lineMat, lineY);
    addLine(-smallWidth / 2, z - side * smallDepth / 2, w, smallDepth, lineMat, lineY);
    addLine(smallWidth / 2, z - side * smallDepth / 2, w, smallDepth, lineMat, lineY);
    addCircle(0, penaltySpotZ, 0.12, lineMat, lineY, 16);
  }
}

function addLine(x, z, width, depth, material, y) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

function addCircle(x, z, radius, material, y, segments = 96) {
  const circle = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.035, 8, segments),
    material,
  );
  circle.rotation.x = Math.PI / 2;
  circle.position.set(x, y, z);
  scene.add(circle);
}

function createGoals() {
  createGoal(0, -HALF_LENGTH - 0.55, 0);
  createGoal(0, HALF_LENGTH + 0.55, Math.PI);
}

function createGoal(x, z, rotationY) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;

  const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.34,
    wireframe: true,
  });

  const postGeo = new THREE.CylinderGeometry(0.055, 0.055, GOAL_HEIGHT, 16);
  const crossGeo = new THREE.CylinderGeometry(0.055, 0.055, GOAL_WIDTH, 16);
  const leftPost = new THREE.Mesh(postGeo, postMat);
  const rightPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, 0);
  rightPost.position.set(GOAL_WIDTH / 2, GOAL_HEIGHT / 2, 0);
  const crossbar = new THREE.Mesh(crossGeo, postMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, GOAL_HEIGHT, 0);

  const net = new THREE.Mesh(new THREE.BoxGeometry(GOAL_WIDTH, GOAL_HEIGHT, 1.05, 8, 4, 4), netMat);
  net.position.set(0, GOAL_HEIGHT / 2, -0.52);

  group.add(leftPost, rightPost, crossbar, net);
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  scene.add(group);
}

function createSchoolBuildings() {
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xd9e8f6, roughness: 0.68 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x426f9f, roughness: 0.5 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xa9d8ff,
    roughness: 0.18,
    metalness: 0.05,
  });

  const main = new THREE.Mesh(new THREE.BoxGeometry(21, 5, 2.2), buildingMat);
  main.position.set(0, 2.5, -27.5);
  main.castShadow = true;
  main.receiveShadow = true;
  scene.add(main);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(21.8, 0.35, 2.65), trimMat);
  roof.position.set(0, 5.18, -27.5);
  roof.castShadow = true;
  scene.add(roof);

  for (let floor = 0; floor < 3; floor += 1) {
    for (let col = 0; col < 9; col += 1) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.06), windowMat);
      win.position.set(-8 + col * 2, 1.35 + floor * 1.35, -26.36);
      scene.add(win);
    }
  }

  const side = new THREE.Mesh(new THREE.BoxGeometry(8, 3.8, 2), buildingMat);
  side.position.set(-17, 1.9, -24.5);
  side.rotation.y = -0.22;
  side.castShadow = true;
  side.receiveShadow = true;
  scene.add(side);
}

function createBleachers() {
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4f6f89, roughness: 0.7 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xd6dee6, roughness: 0.8 });

  for (let i = 0; i < 4; i += 1) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.28, 0.75), baseMat);
    base.position.set(0, 0.16 + i * 0.34, 22.5 + i * 0.8);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 0.34), seatMat);
    seat.position.set(0, 0.34 + i * 0.34, 22.28 + i * 0.8);
    seat.castShadow = true;
    scene.add(seat);
  }
}

function createTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d7d3f, roughness: 0.85 });
  const positions = [
    [-18, -18],
    [-19, -10],
    [-18, 4],
    [-19, 15],
    [18, -18],
    [19, -7],
    [18, 6],
    [19, 16],
  ];

  for (const [x, z] of positions) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 12), trunkMat);
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), leafMat);
    leaves.position.set(x, 1.9, z);
    leaves.scale.set(1.05, 1.15, 1.05);
    leaves.castShadow = true;
    scene.add(leaves);
  }
}

function createBanner() {
  const texture = createBannerTexture("叫叫小分队第一届足球大赛");
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(12.5, 1.35),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  banner.position.set(0, 3.25, -24.08);
  scene.add(banner);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
  for (const x of [-6.55, 6.55]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 16), poleMat);
    pole.position.set(x, 1.55, -24.12);
    pole.castShadow = true;
    scene.add(pole);
  }
}

function createPerimeterFence() {
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.55 });
  for (const z of [-22.2, 22.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(32, 0.08, 0.08), railMat);
    rail.position.set(0, 1.0, z);
    scene.add(rail);
  }

  for (let x = -16; x <= 16; x += 2) {
    for (const z of [-22.2, 22.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), railMat);
      post.position.set(x, 0.65, z);
      scene.add(post);
    }
  }
}

function createSplitMarkers() {
  const sideMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.78,
  });
  addLine(-GOAL_WIDTH / 2, -13.4, 0.06, 1.2, sideMat, 0.055);
  addLine(GOAL_WIDTH / 2, -13.4, 0.06, 1.2, sideMat, 0.055);
}

function createFootball() {
  const texture = createFootballTexture();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 32, 20),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.48 }),
  );
  mesh.castShadow = true;
  mesh.userData.radius = 0.28;
  return mesh;
}

function createAimReticle() {
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.34, 48),
    new THREE.MeshBasicMaterial({
      color: 0xfff7ad,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.position.y = 0.075;
  return reticle;
}

function createChargeMeter() {
  const root = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.72 }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x22c55e }),
  );
  back.position.set(0, 0, 0);
  fill.position.set(-0.4, 0, 0.002);
  root.add(back, fill);
  root.visible = false;
  return { root, fill };
}

function createShotArrow() {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.42, 0),
    3,
    0xffd166,
    0.72,
    0.42,
  );
  arrow.visible = false;
  arrow.renderOrder = 30;

  const lineMaterial = arrow.line.material;
  lineMaterial.linewidth = 8;
  lineMaterial.depthTest = false;
  arrow.cone.material.depthTest = false;
  return arrow;
}

function createTurfTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  ctx.fillStyle = "#2b8743";
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
    ctx.fillRect(0, y, 512, 4);
  }

  for (let i = 0; i < 1600; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y, 1, 3);
  }

  return new THREE.CanvasTexture(canvasTexture);
}

function createTrackTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  ctx.fillStyle = "#b84234";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = 3;
  for (let x = 54; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvasTexture);
}

function createBannerTexture(text) {
  const bannerCanvas = document.createElement("canvas");
  bannerCanvas.width = 1536;
  bannerCanvas.height = 384;
  const ctx = bannerCanvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 1536, 0);
  gradient.addColorStop(0, "#b91c1c");
  gradient.addColorStop(0.5, "#ef4444");
  gradient.addColorStop(1, "#b91c1c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1536, 384);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, 0, 1536, 38);
  ctx.fillRect(0, 346, 1536, 38);

  ctx.font = "900 108px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(92, 24, 24, 0.36)";
  ctx.strokeText(text, 768, 192);
  ctx.fillStyle = "#fff7ed";
  ctx.fillText(text, 768, 192);

  const texture = new THREE.CanvasTexture(bannerCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFootballTexture() {
  const ballCanvas = document.createElement("canvas");
  ballCanvas.width = 512;
  ballCanvas.height = 256;
  const ctx = ballCanvas.getContext("2d");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 10;
  for (let x = -40; x < 560; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 72, 256);
    ctx.stroke();
  }
  ctx.fillStyle = "#111827";
  for (let y = 42; y < 256; y += 96) {
    for (let x = 40; x < 512; x += 120) {
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new THREE.CanvasTexture(ballCanvas);
}

function tick() {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.033);
  lastFrameTime = now;

  updateGame(delta);
  updateActorAnimation(shooter, delta);
  updateActorAnimation(keeper, delta);
  updateCameras(delta);
  renderSplitScreen();
}

function updateGame(delta) {
  updateShooter(delta);
  updateKeeper(delta);
  updateShot(delta);
  updateAimAndCharge(delta);

  if (shooter.mixer) shooter.mixer.update(delta);
  if (keeper.mixer) keeper.mixer.update(delta);
}

function updateShooter(delta) {
  if (!shooter.ready) return;

  shooter.direction.set(0, 0, 0);

  if (game.phase === "charging") {
    if (keys.has("KeyA")) game.aimX -= delta * 1.45;
    if (keys.has("KeyD")) game.aimX += delta * 1.45;
    if (keys.has("KeyW")) game.aimY += delta * 0.7;
    if (keys.has("KeyS")) game.aimY -= delta * 0.7;
    game.aimX = THREE.MathUtils.clamp(game.aimX, -0.95, 0.95);
    game.aimY = THREE.MathUtils.clamp(game.aimY, 0.18, 0.95);
    shooter.proceduralMode = "kick-ready";
    shooter.root.lookAt(ball.position.x, shooter.root.position.y, GOAL_Z);
    return;
  }

  if (game.phase !== "ready") {
    shooter.proceduralMode = "idle";
    return;
  }

  if (keys.has("KeyW")) shooter.direction.z -= 1;
  if (keys.has("KeyS")) shooter.direction.z += 1;
  if (keys.has("KeyA")) shooter.direction.x -= 1;
  if (keys.has("KeyD")) shooter.direction.x += 1;

  moveActor(shooter, delta, -4.4, 6.5, -HALF_WIDTH + 0.8, HALF_WIDTH - 0.8);
}

function updateKeeper(delta) {
  if (!keeper.ready) return;

  keeper.direction.set(0, 0, 0);
  if (keys.has("ArrowLeft") || keys.has("KeyJ")) keeper.direction.x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyL")) keeper.direction.x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyI")) keeper.direction.z -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyK")) keeper.direction.z += 1;

  if (game.keeperDiveTimer > 0) {
    game.keeperDiveTimer -= delta;
    keeper.proceduralMode = "dive";
    keeper.root.rotation.z = THREE.MathUtils.lerp(
      keeper.root.rotation.z,
      keeper.direction.x >= 0 ? -0.72 : 0.72,
      0.35,
    );
  } else {
    keeper.root.rotation.z = THREE.MathUtils.lerp(keeper.root.rotation.z, 0, 0.18);
  }

  moveActor(keeper, delta, -14.2, -12.45, -GOAL_WIDTH / 2 - 0.35, GOAL_WIDTH / 2 + 0.35);
  keeper.root.lookAt(ball.position.x, keeper.root.position.y, ball.position.z);
}

function moveActor(actor, delta, minZ, maxZ, minX, maxX) {
  const moving = actor.direction.lengthSq() > 0;

  if (moving) {
    actor.direction.normalize();
    moveForward.set(0, 0, -1);
    moveRight.set(1, 0, 0);
    actor.velocity.copy(moveRight).multiplyScalar(actor.direction.x);
    actor.velocity.addScaledVector(moveForward, -actor.direction.z).normalize();
    actor.root.position.addScaledVector(actor.velocity, actor.speed * delta);
    actor.root.position.x = THREE.MathUtils.clamp(actor.root.position.x, minX, maxX);
    actor.root.position.z = THREE.MathUtils.clamp(actor.root.position.z, minZ, maxZ);
    actor.root.rotation.y = Math.atan2(actor.velocity.x, actor.velocity.z);
    actor.proceduralMode = "walk";
    if (actor.moveAction) playActorAction(actor, actor.moveAction);
  } else if (game.keeperDiveTimer <= 0 || actor !== keeper) {
    actor.proceduralMode = "idle";
    if (actor.idleAction) playActorAction(actor, actor.idleAction);
  }
}

function updateAimAndCharge(delta) {
  const shotTarget = getShotTarget();
  const targetX = shotTarget.x;
  const targetY = 0.14;
  const targetZ = GOAL_Z + 0.1;
  aimReticle.position.set(targetX, targetY, targetZ);
  aimReticle.visible = game.phase === "ready" || game.phase === "charging";

  chargeMeter.root.visible = game.phase === "charging";
  chargeMeter.root.position.copy(ball.position).add(new THREE.Vector3(0, 1.0, 0));
  chargeMeter.root.lookAt(shooterCamera.position);
  shotArrow.visible = game.phase === "charging";

  if (game.phase === "charging") {
    game.charge = Math.min(1, game.charge + delta * 0.52);
    chargeMeter.fill.scale.x = Math.max(0.08, game.charge);
    chargeMeter.fill.position.x = -0.9 + 0.9 * game.charge;
    chargeMeter.fill.material.color.setHSL(0.32 - 0.32 * game.charge, 0.9, 0.55);
    game.message = `蓄力 ${Math.round(game.charge * 100)}%  方向 ${Math.round(game.aimX * 100)}  高度 ${Math.round(game.aimY * 100)}`;
    updateHud();
  }

  if (game.phase === "charging") {
    const arrowOrigin = ball.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    const direction = shotTarget.clone().sub(arrowOrigin).normalize();
    const arrowLength = THREE.MathUtils.lerp(2.2, 5.2, game.charge);
    const arrowColor = new THREE.Color().setHSL(0.32 - 0.32 * game.charge, 0.9, 0.55);
    shotArrow.position.copy(arrowOrigin);
    shotArrow.setDirection(direction);
    shotArrow.setLength(arrowLength, 0.82, 0.48);
    shotArrow.setColor(arrowColor);
  }
}

function shootBall() {
  shotArrow.visible = false;
  const target = getShotTarget();
  const direction = target.sub(ball.position).normalize();
  const power = THREE.MathUtils.lerp(8.2, 15.6, game.charge);
  game.ballVelocity.copy(direction).multiplyScalar(power);
  game.phase = "shot";
  game.message = "射门！守门员按 Enter 扑救，方向键移动";
  shooter.proceduralMode = "kick";
  updateHud();
}

function getShotTarget() {
  return new THREE.Vector3(
    game.aimX * (GOAL_WIDTH / 2),
    THREE.MathUtils.lerp(0.55, GOAL_HEIGHT + 0.45, game.aimY),
    GOAL_Z - 0.2,
  );
}

function updateShot(delta) {
  if (game.phase !== "shot") return;

  game.ballVelocity.y -= 6.2 * delta;
  ball.position.addScaledVector(game.ballVelocity, delta);
  ball.rotation.x += game.ballVelocity.z * delta * 2.5;
  ball.rotation.z -= game.ballVelocity.x * delta * 2.5;

  if (ball.position.y < 0.3) {
    ball.position.y = 0.3;
    game.ballVelocity.y *= -0.28;
    game.ballVelocity.x *= 0.94;
    game.ballVelocity.z *= 0.94;
  }

  const keeperDistance = ball.position.distanceTo(keeper.root.position);
  const saveReach = game.keeperDiveTimer > 0 ? 1.28 : 0.72;
  if (keeperDistance < saveReach && ball.position.z < -11.6) {
    game.phase = "result";
    game.resultTimer = 1.8;
    game.keeperScore += 1;
    game.ballVelocity.set(0, 0, 2.6);
    game.message = "猪小弟扑救成功！";
    updateHud();
    return;
  }

  if (ball.position.z < GOAL_Z - 0.2) {
    const scored =
      Math.abs(ball.position.x) < GOAL_WIDTH / 2 &&
      ball.position.y > 0.25 &&
      ball.position.y < GOAL_HEIGHT;

    game.phase = "result";
    game.resultTimer = 1.8;
    if (scored) {
      game.shooterScore += 1;
      game.message = "进球！铃铛得分";
    } else {
      game.keeperScore += 1;
      game.message = "射偏了，猪小弟守住了";
    }
    updateHud();
    return;
  }

  if (ball.position.z > -2 || Math.abs(ball.position.x) > HALF_WIDTH + 1.5) {
    game.phase = "result";
    game.resultTimer = 1.8;
    game.keeperScore += 1;
    game.message = "球被挡出危险区";
    updateHud();
  }

  if (game.phase === "result") return;

  if (game.resultTimer > 0) {
    game.resultTimer -= delta;
  }
}

function resetRound() {
  game.phase = "ready";
  game.charge = 0;
  game.aimX = 0;
  game.aimY = 0.42;
  game.ballVelocity.set(0, 0, 0);
  game.keeperDiveTimer = 0;
  game.message = "射手按住 Space 蓄力，松开射门";
  ball.position.copy(SHOT_START);
  ball.rotation.set(0, 0, 0);
  shooter.root.position.copy(shooter.start);
  shooter.root.rotation.set(0, 0, 0);
  keeper.root.position.copy(keeper.start);
  keeper.root.rotation.set(0, Math.PI, 0);
  updateHud();
}

function resetMatch() {
  game.round = 1;
  game.shooterScore = 0;
  game.keeperScore = 0;
  resetRound();
}

function advanceRound(delta) {
  if (game.phase !== "result") return;
  game.resultTimer -= delta;
  if (game.resultTimer > 0) return;

  if (game.round >= game.maxRounds) {
    const winner =
      game.shooterScore > game.keeperScore
        ? "铃铛赢下点球大赛"
        : game.shooterScore < game.keeperScore
          ? "猪小弟赢下点球大赛"
          : "双方战平";
    game.message = `${winner}，按 R 重新开始`;
    game.phase = "finished";
    updateHud();
    return;
  }

  game.round += 1;
  resetRound();
}

function updateActorAnimation(actor, delta) {
  actor.proceduralTime += delta * (actor.proceduralMode === "walk" ? 5.8 : 1.8);

  if (actor.proceduralRig && !actor.clips.length) {
    updateProceduralRig(actor);
  } else if (actor.model && !actor.proceduralRig) {
    updateSimpleActorMotion(actor);
  }
}

function updateProceduralRig(actor) {
  const t = actor.proceduralTime;
  const walk = actor.proceduralMode === "walk";
  const kick = actor.proceduralMode === "kick" || actor.proceduralMode === "kick-ready";
  const swing = walk ? Math.sin(t) : 0;
  const counterSwing = walk ? Math.sin(t + Math.PI) : 0;
  const bounce = walk ? Math.abs(Math.sin(t)) : Math.sin(t) * 0.12;
  const kickLift = kick ? 0.72 : 0;

  poseBone(actor.proceduralRig.hips, 0.04 * bounce, 0, 0.02 * swing);
  poseBone(actor.proceduralRig.spine, walk ? -0.03 : 0.025 * Math.sin(t), 0, -0.025 * swing);
  poseBone(actor.proceduralRig.spine1, walk ? -0.02 : 0.016 * Math.sin(t), 0, 0);
  poseBone(actor.proceduralRig.spine2, walk ? 0.025 : 0.012 * Math.sin(t), 0, 0);
  poseBone(actor.proceduralRig.leftUpLeg, 0.58 * swing + kickLift, 0, 0.05);
  poseBone(actor.proceduralRig.leftLeg, Math.max(0, -0.65 * swing), 0, 0);
  poseBone(actor.proceduralRig.leftFoot, -0.22 * swing, 0, 0);
  poseBone(actor.proceduralRig.rightUpLeg, 0.58 * counterSwing, 0, -0.05);
  poseBone(actor.proceduralRig.rightLeg, Math.max(0, -0.65 * counterSwing), 0, 0);
  poseBone(actor.proceduralRig.rightFoot, -0.22 * counterSwing, 0, 0);
  poseBone(actor.proceduralRig.leftArm, -0.42 * counterSwing, 0, 0.12);
  poseBone(actor.proceduralRig.leftForeArm, -0.18 - 0.16 * Math.max(0, counterSwing), 0, 0);
  poseBone(actor.proceduralRig.rightArm, -0.42 * swing, 0, -0.12);
  poseBone(actor.proceduralRig.rightForeArm, -0.18 - 0.16 * Math.max(0, swing), 0, 0);
}

function updateSimpleActorMotion(actor) {
  if (!actor.model) return;
  const t = actor.proceduralTime;
  if (actor.proceduralMode === "walk") {
    actor.model.position.y = Math.sin(t * 2) * 0.035;
    actor.model.rotation.z = Math.sin(t) * 0.08;
  } else if (actor.proceduralMode === "dive") {
    actor.model.position.y = 0.18;
  } else {
    actor.model.position.y = Math.sin(t) * 0.018;
    actor.model.rotation.z = Math.sin(t) * 0.025;
  }
}

function createProceduralRig(model) {
  const bones = new Map();

  model.traverse((child) => {
    if (child.isBone) {
      bones.set(child.name, {
        bone: child,
        base: child.quaternion.clone(),
      });
    }
  });

  const rig = {
    hips: bones.get("Hips"),
    spine: bones.get("Spine"),
    spine1: bones.get("Spine1"),
    spine2: bones.get("Spine2"),
    leftArm: bones.get("LeftArm"),
    leftForeArm: bones.get("LeftForeArm"),
    rightArm: bones.get("RightArm"),
    rightForeArm: bones.get("RightForeArm"),
    leftUpLeg: bones.get("LeftUpLeg"),
    leftLeg: bones.get("LeftLeg"),
    leftFoot: bones.get("LeftFoot"),
    rightUpLeg: bones.get("RightUpLeg"),
    rightLeg: bones.get("RightLeg"),
    rightFoot: bones.get("RightFoot"),
  };

  return Object.values(rig).some(Boolean) ? rig : null;
}

function poseBone(entry, x = 0, y = 0, z = 0) {
  if (!entry) return;
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
  entry.bone.quaternion.copy(entry.base).multiply(offset);
}

function updateCameras(delta) {
  tempVector.copy(shooter.root.position).add(new THREE.Vector3(0, 4.2, 8.4));
  shooterCamera.position.lerp(tempVector, 1 - Math.pow(0.001, delta));
  shooterCamera.lookAt(0, 1.0, GOAL_Z);

  tempVector.copy(keeper.root.position).add(new THREE.Vector3(0, 3.2, -5.4));
  keeperCamera.position.lerp(tempVector, 1 - Math.pow(0.001, delta));
  keeperCamera.lookAt(ball.position.x, 0.9, ball.position.z);
}

function renderSplitScreen() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const half = Math.floor(width / 2);

  renderer.setViewport(0, 0, half, height);
  renderer.setScissor(0, 0, half, height);
  shooterCamera.aspect = half / height;
  shooterCamera.updateProjectionMatrix();
  renderer.render(scene, shooterCamera);

  renderer.setViewport(half, 0, width - half, height);
  renderer.setScissor(half, 0, width - half, height);
  keeperCamera.aspect = (width - half) / height;
  keeperCamera.updateProjectionMatrix();
  renderer.render(scene, keeperCamera);
}

function updateHud() {
  loadStatus.textContent = "点球大赛进行中";
  scoreRound.textContent = `第 ${game.round}/${game.maxRounds} 轮`;
  scoreLeft.textContent = game.shooterScore;
  scoreRight.textContent = game.keeperScore;
  animationStatus.textContent = game.message;
}

function handleResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setLoadStatus(text) {
  loadStatus.textContent = text;
}

setInterval(() => {
  if (game.phase === "result") {
    advanceRound(0.15);
  }
}, 150);

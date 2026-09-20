import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import GUI from "lil-gui";

const params = {
  forma: "circular",
  radio: 0.43,
  largo: 0.5,
  colorAgua: "#3d6a78",
  sunColor: "#ffd49f",
  sunElevation: 0,
  sunAzimuth: 25,
  distortion: 3.4,
  waveSize: 10,
  waveSpeed: 0.6,
  alphaAgua: 0.9,
  frecuencia: 48,
  amplitud: 0.045,
  luz: 0.9430788416,
  radioReflejo: 0.64,
  vasoY: 1.68,
  vasoX: -0.43,
  vasoZ: 0,
  vasoAmp: 0,
  vasoFreq: 2.4,
  vasoOctaves: 3,
  vasoSpeed: 0,
  vasoSeed: 11,
  criaturas: 0.9973515250990317,
  noiseDeform: 0.35,
  proyector: "abajo",
  lamparaX: -0.35,
  lamparaZ: 0,
  lamparaY: 0.02,
  temperatura: 2710.3481687457243,
  estado: 0.922,
  audio: false,
  bioX: -0.55,
  bioY: 0.4,
  bioZ: 0.3,
  bioRotX: 90,
  bioRotY: 3,
  bioRotZ: 3,
  bioAncho: 3.7,
  bioAlto: 3.1,
  bioAmp: 0.85,
  bioFreq: 7.2,
  bioOctaves: 6,
  bioSpeed: 0,
  bioSeed: 21,
  bioColor: "#919191",
  bioOpacity: 0.38,
  bioProyX: 0.06,
  bioProyY: 4.03,
  bioProyZ: -1.04,
  bioProyRotX: -98,
  bioProyRotY: 3,
  bioProyRotZ: -40,
  bioProyRadio: 6,
  bioProyCaustica: false,
};

const START_CAMERA = {
  position: [-3.070255356185929, 1.8191879459827465, -10.791863732998188],
  target: [0, 1.45, 0],
};

// Edit umbral → inmersión here. Keys in both states are interpolated.
const STATE_INITIAL = {
  temperatura: 9000,
  luz: 0.55,
  criaturas: 0.05,
  volume: 0,
};

const STATE_FINAL = {
  temperatura: 2700,
  luz: 0.95,
  criaturas: 1,
  volume: 1,
};

// type: linear | easeIn | easeOut | easeInOut | smoothstep | smootherstep
const STATE_CURVES = {
  master: { type: "smoothstep", power: 1 },
  temperatura: { type: "easeInOut", power: 1.7 },
  luz: { type: "linear", power: 1 },
  criaturas: { type: "easeOut", power: 1.45 },
  volume: { type: "easeIn", power: 2.35, delay: 0.06 },
};

const SOUND = {
  src: "./sonido-simulacion-soterrado.wav",
  loop: true,
  maxVolume: 0.85,
  html5: true,
  fadeMs: 1200,
  volumeCurve: STATE_CURVES.volume,
};

let renderer, scene, camera, controls, clock, gui;
let waterDisk, vesselDisk, vesselBody, cableGroup;
let curtainMat, curtainMesh, floorMat, wallMat, causticMat, causticPatch;
let speakers = [];
let audio = null;
let hemi, keyLight, fillLight, rimLight;
let waterNormals = null;
let projectorGroup, projectorSpot, beamMesh, transducer;
let bioProjectorGroup, bioProjectorSpot, bioBeamMesh;
let bioCausticMat, bioCausticPatch, bioCurtainCausticMat, bioCurtainCaustic;
let bioCreatureMat, bioCreaturePatch, bioCurtainCreature;
let rimMat = null;
let vesselGeos = [];
let fieldHowl = null;
let fieldVol = 0;

const WATER_NORMALS_URL = "./textures/waternormals.jpg";

const PRESENTATION = ["1", "true", "yes", "on"].includes(
  (new URLSearchParams(location.search).get("presentacion") || "").toLowerCase()
);
{
  const qsEstado = new URLSearchParams(location.search).get("estado");
  if (qsEstado != null && qsEstado !== "") {
    const v = parseFloat(qsEstado);
    if (Number.isFinite(v)) params.estado = THREE.MathUtils.clamp(v, 0, 1);
  }
}

const rumble = { value: 0 };
const tmpColor = new THREE.Color();

function kelvinToRGB(k) {
  k = THREE.MathUtils.clamp(k, 1000, 12000) / 100;
  let r, g, b;
  if (k <= 66) {
    r = 255;
    g = 99.470571 * Math.log(k) - 161.119568;
  } else {
    r = 329.698727 * Math.pow(k - 60, -0.13320476);
    g = 288.122169 * Math.pow(k - 60, -0.07551485);
  }
  if (k >= 66) b = 255;
  else if (k <= 19) b = 0;
  else b = 138.517731 * Math.log(k - 10) - 305.044792;
  return tmpColor.setRGB(
    THREE.MathUtils.clamp(r, 0, 255) / 255,
    THREE.MathUtils.clamp(g, 0, 255) / 255,
    THREE.MathUtils.clamp(b, 0, 255) / 255
  );
}

function easeCurve(t, type = "linear", power = 1) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  if (type === "smoothstep") return t * t * (3 - 2 * t);
  if (type === "smootherstep") return t * t * t * (t * (t * 6 - 15) + 10);
  if (type === "easeIn") return Math.pow(t, power);
  if (type === "easeOut") return 1 - Math.pow(1 - t, power);
  if (type === "easeInOut") {
    return t < 0.5
      ? 0.5 * Math.pow(2 * t, power)
      : 1 - 0.5 * Math.pow(2 * (1 - t), power);
  }
  return t;
}

function channelT(t, curve = {}) {
  const delay = curve.delay || 0;
  const span = Math.max(1e-4, 1 - delay);
  const u = THREE.MathUtils.clamp((t - delay) / span, 0, 1);
  return easeCurve(u, curve.type || "linear", curve.power ?? 1);
}

function mixValue(a, b, u) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  return u < 1 ? a : b;
}

function applyEstadoMix() {
  const master = channelT(params.estado, STATE_CURVES.master);
  for (const key of Object.keys(STATE_INITIAL)) {
    if (key === "volume" || !(key in STATE_FINAL)) continue;
    const u = channelT(master, STATE_CURVES[key] || STATE_CURVES.master);
    params[key] = mixValue(STATE_INITIAL[key], STATE_FINAL[key], u);
  }
  params.sunColor = `#${kelvinToRGB(params.temperatura).getHexString()}`;
  const volU = channelT(master, STATE_CURVES.volume || SOUND.volumeCurve);
  const vol = mixValue(STATE_INITIAL.volume ?? 0, STATE_FINAL.volume ?? 1, volU);
  if (scene) {
    applyRoomTemp();
    applyCurtain();
    applyCreatureUniforms();
    placeProjector();
    placeBioProjector();
  }
  syncFieldSound(vol);
  gui?.controllersRecursive?.().forEach((c) => c.updateDisplay());
}

function ensureFieldSound() {
  const HowlCtor = window.Howl;
  if (fieldHowl || typeof HowlCtor !== "function") return;
  fieldHowl = new HowlCtor({
    src: [SOUND.src],
    loop: SOUND.loop,
    volume: 0,
    html5: SOUND.html5,
    preload: true,
  });
}

function syncFieldSound(vol) {
  ensureFieldSound();
  if (!fieldHowl) return;
  const v = Math.max(0, vol) * SOUND.maxVolume;
  if (v > 0.002 && !fieldHowl.playing()) fieldHowl.play();
  fieldHowl.volume(v);
  fieldVol = v;
}

function buildStateFader() {
  const el = document.getElementById("estado-range");
  if (!el) return;
  el.value = String(params.estado);
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    unlockAudio();
  });
  el.addEventListener("input", () => {
    params.estado = parseFloat(el.value);
    unlockAudio();
    applyEstadoMix();
  });
}

function applyRoomTemp() {
  const c = kelvinToRGB(params.temperatura);
  const cool = params.temperatura / 6500;
  const bg = c.clone().multiplyScalar(0.035 + cool * 0.02);
  scene.background.copy(bg);
  scene.fog.color.copy(bg);
  if (wallMat) {
    wallMat.color.setRGB(0.05 + c.r * 0.06, 0.055 + c.g * 0.06, 0.06 + c.b * 0.07);
  }
  if (hemi) {
    hemi.color.copy(c);
    hemi.groundColor.copy(bg);
  }
  if (keyLight) keyLight.color.copy(c);
  if (fillLight) fillLight.color.copy(c).multiplyScalar(0.55);
  if (rimLight) rimLight.color.copy(c);
  if (floorMat?.color) {
    floorMat.color.setRGB(0.025 + c.r * 0.02, 0.027 + c.g * 0.02, 0.03 + c.b * 0.025);
  }
  if (causticMat?.uniforms.uGlow) causticMat.uniforms.uGlow.value.copy(c);
  if (curtainMat?.uniforms.uGlow) curtainMat.uniforms.uGlow.value.copy(c);
  if (bioCreatureMat?.uniforms?.uGlow) bioCreatureMat.uniforms.uGlow.value.copy(c);
  applyWaterUniforms();
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.FogExp2(0x07080a, 0.04);

  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 80);
  camera.position.fromArray(START_CAMERA.position);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(START_CAMERA.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 1.4;
  controls.maxDistance = 18;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1a1e22);
  envScene.add(new THREE.HemisphereLight(0xdde6f0, 0x0a0c10, 3));
  envScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x3a4248, side: THREE.BackSide })
    )
  );
  scene.environment = pmrem.fromScene(envScene, 0.08).texture;
  pmrem.dispose();

  clock = new THREE.Clock();

  buildRoom();
  buildVessel();
  buildTransducer();
  buildCausticPatch();
  buildProjector();
  buildBioProjector();
  buildCurtain();
  buildSpeakers();
  buildLights();
  applyRoomTemp();
  applyRadius();
  placeProjector();
  placeBioProjector();
  buildGui();
  buildStateFader();
  applyEstadoMix();

  addEventListener("resize", onResize);
  addEventListener("pointerdown", unlockAudio, { once: true });
}

function buildRoom() {
  wallMat = new THREE.MeshStandardMaterial({
    color: 0x121518,
    roughness: 0.95,
    metalness: 0,
  });
  floorMat = new THREE.MeshStandardMaterial({
    color: 0x080a0c,
    roughness: 0.95,
    metalness: 0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wallMat);
  back.position.set(0, 2.1, -3.2);
  scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-4.2, 2.1, 0);
  scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(4.2, 2.1, 0);
  scene.add(right);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 4.05;
  scene.add(ceil);
}

function loadWaterNormals() {
  if (waterNormals) return waterNormals;
  waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });
  return waterNormals;
}

function applyBeamColor() {
  const c = tmpColor.set(params.sunColor);
  const tint = (beam, group, spot) => {
    if (beam?.material?.uniforms?.uColor) beam.material.uniforms.uColor.value.copy(c);
    if (spot) spot.color.copy(c);
    group?.traverse((o) => {
      if (o.material?.emissive) {
        o.material.emissive.copy(c);
        o.material.emissiveIntensity = 0.9;
      }
    });
  };
  tint(beamMesh, projectorGroup, projectorSpot);
  tint(bioBeamMesh, bioProjectorGroup, bioProjectorSpot);
}

function applyWaterUniforms() {
  if (!waterDisk?.material?.uniforms) return;
  const u = waterDisk.material.uniforms;
  u.waterColor.value.set(params.colorAgua);
  u.sunColor.value.set(params.sunColor);
  u.distortionScale.value = params.distortion;
  u.size.value = params.waveSize;
  u.alpha.value = params.alphaAgua;
  waterDisk.material.transparent = params.alphaAgua < 0.999;
  const phi = THREE.MathUtils.degToRad(90 - params.sunElevation);
  const theta = THREE.MathUtils.degToRad(params.sunAzimuth);
  u.sunDirection.value.setFromSphericalCoords(1, phi, theta);
  applyBeamColor();
  updateCausticUniforms();
  if (projectorGroup) placeProjector();
  if (bioProjectorGroup) placeBioProjector();
}

function cable(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(0.004, 0.004, len, 6);
  const m = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function isRect() {
  return params.forma === "rectangular";
}

function fract(v) {
  return v - Math.floor(v);
}

function hash3(x, y, z) {
  x = fract(x * 0.3183099 + 0.1);
  y = fract(y * 0.3183099 + 0.1);
  z = fract(z * 0.3183099 + 0.1);
  x *= 17;
  y *= 17;
  z *= 17;
  return fract(x * y * z * (x + y + z));
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const n = (i, j, k) => hash3(ix + i, iy + j, iz + k);
  return (
    mix(
      mix(mix(n(0, 0, 0), n(1, 0, 0), fx), mix(n(0, 1, 0), n(1, 1, 0), fx), fy),
      mix(mix(n(0, 0, 1), n(1, 0, 1), fx), mix(n(0, 1, 1), n(1, 1, 1), fx), fy),
      fz
    )
  );
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function fbm3(x, y, z, octaves) {
  let v = 0;
  let a = 0.5;
  const oct = Math.max(1, Math.min(6, octaves | 0));
  for (let i = 0; i < 6; i++) {
    if (i >= oct) break;
    v += a * noise3(x, y, z);
    x = x * 2.07 + 0.13;
    y = y * 2.07 + 0.13;
    z = z * 2.07 + 0.13;
    a *= 0.5;
  }
  return v;
}

function outlineScale(x, z, t) {
  if (params.vasoAmp <= 1e-4) return 1;
  const ang = Math.atan2(z, x);
  const tt = t * params.vasoSpeed + params.vasoSeed * 0.13;
  const n = fbm3(
    Math.cos(ang) * params.vasoFreq,
    Math.sin(ang) * params.vasoFreq,
    tt,
    params.vasoOctaves
  );
  return 1 + (n * 2 - 1) * params.vasoAmp;
}

function unitOutline(i, segs) {
  const theta = (i / segs) * Math.PI * 2;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (isRect()) {
    const k = 1 / Math.max(Math.abs(c), Math.abs(s));
    return [c * k, s * k];
  }
  return [c, s];
}

function makeWallGeo(segs, h) {
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const [x, z] = unitOutline(i, segs);
    pos.push(x, h / 2, z, x, -h / 2, z);
    uvs.push(i / segs, 1, i / segs, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function makeCapGeo(rScale, segs) {
  const pos = [0, 0, 0];
  const nrm = [0, 0, 1];
  const uv = [0.5, 0.5];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const [x, z] = unitOutline(i, segs);
    pos.push(x * rScale, -z * rScale, 0);
    nrm.push(0, 0, 1);
    uv.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  }
  for (let i = 0; i < segs; i++) idx.push(0, i + 1, i + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function registerVesselGeo(mesh, mode) {
  const geo = mesh.geometry;
  vesselGeos.push({
    geo,
    orig: Float32Array.from(geo.attributes.position.array),
    mode,
  });
}

function applyVesselDeform(t = clock?.elapsedTime ?? 0) {
  for (const item of vesselGeos) {
    const pos = item.geo.attributes.position;
    const orig = item.orig;
    for (let i = 0; i < pos.count; i++) {
      const ox = orig[i * 3];
      const oy = orig[i * 3 + 1];
      const oz = orig[i * 3 + 2];
      if (item.mode === "cap") {
        const s = ox === 0 && oy === 0 ? 1 : outlineScale(ox, -oy, t);
        pos.setXYZ(i, ox * s, oy * s, oz);
      } else {
        const s = outlineScale(ox, oz, t);
        pos.setXYZ(i, ox * s, oy, oz * s);
      }
    }
    pos.needsUpdate = true;
    if (item.mode === "wall") item.geo.computeVertexNormals();
  }
  if (causticMat?.uniforms) {
    const mats = [causticMat, bioCausticMat, bioCurtainCausticMat].filter(Boolean);
    for (const mat of mats) {
      const u = mat.uniforms;
      if (u.uVasoAmp) u.uVasoAmp.value = params.vasoAmp;
      if (u.uVasoFreq) u.uVasoFreq.value = params.vasoFreq;
      if (u.uVasoOctaves) u.uVasoOctaves.value = params.vasoOctaves;
      if (u.uVasoSpeed) u.uVasoSpeed.value = params.vasoSpeed;
      if (u.uVasoSeed) u.uVasoSeed.value = params.vasoSeed;
      if (u.uVasoTime) u.uVasoTime.value = t;
    }
  }
}

function waterOpts() {
  return {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: loadWaterNormals(),
    sunDirection: new THREE.Vector3(0.45, 0.85, 0.25).normalize(),
    sunColor: params.sunColor,
    waterColor: params.colorAgua,
    distortionScale: params.distortion,
    alpha: params.alphaAgua,
    fog: false,
    side: THREE.DoubleSide,
  };
}

function getRimMat() {
  if (rimMat) return rimMat;
  rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8c4c0,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
  });
  return rimMat;
}

function rebuildVessel() {
  const saved = transducer;
  if (saved?.parent) saved.parent.remove(saved);
  if (vesselDisk) {
    scene.remove(vesselDisk);
    vesselDisk.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  buildVessel();
  if (saved) {
    transducer = saved;
    attachTransducer();
  }
  applyRadius();
}

function buildVessel() {
  vesselGeos = [];
  vesselDisk = new THREE.Group();
  vesselBody = new THREE.Group();
  const rim = getRimMat();
  const h = 0.22;
  const segs = 96;

  const walls = new THREE.Mesh(makeWallGeo(segs, h), rim);
  const bottom = new THREE.Mesh(makeCapGeo(1, segs), rim);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -h / 2;
  waterDisk = new Water(makeCapGeo(0.94, segs), waterOpts());
  waterDisk.rotation.x = -Math.PI / 2;
  waterDisk.position.y = 0.02;
  waterDisk.renderOrder = 2;
  waterDisk.material.transparent = true;
  vesselBody.add(walls, bottom, waterDisk);
  registerVesselGeo(walls, "wall");
  registerVesselGeo(bottom, "cap");
  registerVesselGeo(waterDisk, "cap");
  applyVesselDeform(0);

  vesselDisk.add(vesselBody);
  vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);
  scene.add(vesselDisk);
  buildCables();
}

function buildCables() {
  if (cableGroup) {
    vesselDisk.remove(cableGroup);
    cableGroup.traverse((o) => o.geometry?.dispose());
  }
  cableGroup = new THREE.Group();
  const x = isRect() ? params.radio * 0.86 : params.radio * 0.62;
  const z = isRect() ? params.largo * 0.86 : params.radio * 0.62;
  const top = Math.max(0.25, 4.02 - params.vasoY);
  for (const [cx, cz] of [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ]) {
    cableGroup.add(
      cable(new THREE.Vector3(cx, 0.08, cz), new THREE.Vector3(cx * 0.12, top, cz * 0.12))
    );
  }
  vesselDisk.add(cableGroup);
}

function createTransducer() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({
    color: 0x0d0d0d,
    roughness: 0.48,
    metalness: 0.12,
  });
  const face = new THREE.MeshStandardMaterial({
    color: 0x161616,
    roughness: 0.32,
    metalness: 0.28,
  });
  const ink = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    roughness: 0.4,
    metalness: 0.05,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xb01d28,
    roughness: 0.45,
    metalness: 0.08,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.018, 40), black);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 40), face);
  cap.position.y = 0.011;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0016, 8, 40), ink);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.0132;
  g.add(body, cap, ring);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.55;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.008, 10, 22, Math.PI * 1.22),
      black
    );
    hook.rotation.x = Math.PI / 2;
    hook.rotation.z = a + Math.PI * 0.15;
    hook.position.set(Math.cos(a) * 0.028, 0, Math.sin(a) * 0.028);
    g.add(hook);
  }

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.014), black);
  terminal.position.set(0, -0.01, 0.052);
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.009), red);
  pin.position.set(0.005, -0.01, 0.061);
  const lead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0018, 0.0018, 0.05, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
  );
  lead.position.set(0.01, -0.018, 0.082);
  lead.rotation.x = 0.85;
  g.add(terminal, pin, lead);
  return g;
}

function attachTransducer() {
  if (!transducer || !vesselDisk) return;
  transducer.position.set(0, -0.128, 0);
  transducer.rotation.set(0, 0, 0);
  transducer.scale.setScalar(1.2);
  vesselDisk.add(transducer);
}

function buildTransducer() {
  transducer = createTransducer();
  attachTransducer();
}

function buildCausticPatch() {
  causticMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      normalSampler: { value: loadWaterNormals() },
      uTime: { value: 0 },
      uSize: { value: params.waveSize },
      uDistortion: { value: params.distortion },
      uLight: { value: params.luz },
      uNoise: { value: params.noiseDeform },
      uRect: { value: 0 },
      uAlpha: { value: params.alphaAgua },
      uThrow: { value: 2.2 },
      uWaterY: { value: 2.25 },
      uVesselHalf: { value: new THREE.Vector2(params.radio, params.radio) },
      uFootprintHalf: { value: new THREE.Vector2(params.radioReflejo, params.radioReflejo) },
      uPatchCenter: { value: new THREE.Vector2(0, 0) },
      uVesselCenter: { value: new THREE.Vector2(0, 0) },
      uLampPos: { value: new THREE.Vector3(0, 3.9, 0) },
      uWaterColor: { value: new THREE.Color(params.colorAgua) },
      uSunColor: { value: new THREE.Color(params.sunColor) },
      uGlow: { value: new THREE.Color(0xc8d4e0) },
      uVasoAmp: { value: params.vasoAmp },
      uVasoFreq: { value: params.vasoFreq },
      uVasoOctaves: { value: params.vasoOctaves },
      uVasoSpeed: { value: params.vasoSpeed },
      uVasoSeed: { value: params.vasoSeed },
      uVasoTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      uniform sampler2D normalSampler;
      uniform float uTime, uSize, uDistortion, uLight, uNoise, uRect, uAlpha, uThrow, uWaterY;
      uniform float uVasoAmp, uVasoFreq, uVasoOctaves, uVasoSpeed, uVasoSeed, uVasoTime;
      uniform vec2 uVesselHalf, uFootprintHalf, uPatchCenter, uVesselCenter;
      uniform vec3 uLampPos, uWaterColor, uSunColor, uGlow;

      vec4 getNoise(vec2 uv) {
        vec2 uv0 = (uv / 103.0) + vec2(uTime / 17.0, uTime / 29.0);
        vec2 uv1 = uv / 107.0 - vec2(uTime / -19.0, uTime / 31.0);
        vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(uTime / 101.0, uTime / 97.0);
        vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(uTime / 109.0, uTime / -113.0);
        vec4 noise = texture2D(normalSampler, uv0) +
          texture2D(normalSampler, uv1) +
          texture2D(normalSampler, uv2) +
          texture2D(normalSampler, uv3);
        return noise * 0.5 - 1.0;
      }

      vec3 waterNormal(vec2 worldXZ) {
        vec4 noise = getNoise(worldXZ * uSize);
        return normalize(noise.xzy * vec3(1.5, 1.0, 1.5));
      }

      float vasoHash(vec3 p){
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float vasoNoise(vec3 x){
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(vasoHash(i), vasoHash(i + vec3(1,0,0)), f.x),
                         mix(vasoHash(i + vec3(0,1,0)), vasoHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(vasoHash(i + vec3(0,0,1)), vasoHash(i + vec3(1,0,1)), f.x),
                         mix(vasoHash(i + vec3(0,1,1)), vasoHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float vasoFbm(vec3 p){
        float v = 0.0;
        float a = 0.5;
        int oct = int(clamp(uVasoOctaves, 1.0, 6.0));
        for (int i = 0; i < 6; i++) {
          if (i >= oct) break;
          v += a * vasoNoise(p);
          p = p * 2.07 + 0.13;
          a *= 0.5;
        }
        return v;
      }

      float vesselWarp(vec2 p) {
        float ang = atan(p.y, p.x);
        float tt = uVasoTime * uVasoSpeed + uVasoSeed * 0.13;
        float n = vasoFbm(vec3(cos(ang) * uVasoFreq, sin(ang) * uVasoFreq, tt));
        return max(0.15, 1.0 + (n * 2.0 - 1.0) * uVasoAmp);
      }

      float vesselMask(vec2 worldXZ) {
        vec2 p = (worldXZ - uVesselCenter) / max(uVesselHalf, vec2(0.0001));
        p /= vesselWarp(p);
        float maskCirc = 1.0 - smoothstep(0.82, 1.12, length(p));
        vec2 b = abs(p);
        float rBox = max(b.x, b.y);
        float maskBox = 1.0 - smoothstep(0.84, 1.14, rBox);
        return mix(maskCirc, maskBox, uRect);
      }

      float footprintMask(vec2 worldXZ) {
        vec2 p = (worldXZ - uPatchCenter) / max(uFootprintHalf, vec2(0.0001));
        float rCirc = length(p);
        float edgeCirc = 1.0 - smoothstep(0.58, 1.05, rCirc);
        edgeCirc *= edgeCirc;
        vec2 b = abs(p);
        float rBox = length(max(b - vec2(0.55), 0.0)) + min(max(b.x, b.y), 0.55);
        float edgeBox = 1.0 - smoothstep(0.62, 1.08, rBox);
        edgeBox *= edgeBox;
        return mix(edgeCirc, edgeBox, uRect);
      }

      void main() {
        vec3 lamp = uLampPos;
        vec3 hit = vWorldPos;
        float denom = hit.y - lamp.y;
        float tHit = abs(denom) < 0.001 ? 0.5 : (uWaterY - lamp.y) / denom;
        vec2 waterXZ = mix(lamp.xz, hit.xz, tHit);

        vec4 nWarp = getNoise(waterXZ * 8.0 + 40.0);
        waterXZ += nWarp.xz * uNoise * 0.07;

        float k = 0.028 * uDistortion;
        float dist = max(uThrow, 0.12);
        vec2 src = waterXZ;
        for (int i = 0; i < 3; i++) {
          vec3 N = waterNormal(src);
          src = waterXZ - N.xz * dist * k;
        }

        float mask = vesselMask(src) * footprintMask(hit.xz);
        if (mask < 0.004) discard;

        float eps = 0.016;
        vec3 N0 = waterNormal(src);
        vec3 Nx = waterNormal(src + vec2(eps, 0.0));
        vec3 Nz = waterNormal(src + vec2(0.0, eps));
        vec2 gx = (Nx.xz - N0.xz) / eps * dist * k;
        vec2 gz = (Nz.xz - N0.xz) / eps * dist * k;
        float jac = abs((1.0 + gx.x) * (1.0 + gz.y) - gx.y * gz.x);
        float focus = 1.0 / max(jac, 0.1);
        float sharp = mix(2.6, 1.25, clamp(dist / 3.6, 0.0, 1.0));
        float cau = pow(max(focus, 0.0), sharp);

        vec3 I = normalize(hit - lamp);
        vec3 T = refract(I, N0, 0.75);
        if (length(T) < 0.001) T = I;
        float align = pow(max(0.0, dot(normalize(T), normalize(hit - vec3(src.x, uWaterY, src.y)))), 6.0);

        float fall = uLight / (0.65 + dist * 0.4);
        cau *= (0.35 + align * 0.9) * fall * mask;

        vec3 col = mix(uSunColor, uWaterColor, 0.42);
        col = mix(col, uGlow, 0.12) * cau;
        float a = cau * (0.28 + uAlpha * 0.72);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  causticPatch = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), causticMat);
  causticPatch.rotation.x = -Math.PI / 2;
  causticPatch.position.y = 0.018;
  causticPatch.renderOrder = 1;
  scene.add(causticPatch);
}

function syncCausticShared(u) {
  if (!u) return;
  if (waterDisk?.material?.uniforms?.time) {
    u.uTime.value = waterDisk.material.uniforms.time.value;
  }
  u.uSize.value = params.waveSize;
  u.uDistortion.value = params.distortion;
  u.uLight.value = params.luz;
  u.uNoise.value = params.noiseDeform;
  u.uRect.value = isRect() ? 1 : 0;
  u.uAlpha.value = params.alphaAgua;
  u.uWaterColor.value.set(params.colorAgua);
  u.uSunColor.value.set(params.sunColor);
  u.uVesselHalf.value.set(params.radio, isRect() ? params.largo : params.radio);
  if (u.uVesselCenter) u.uVesselCenter.value.set(params.vasoX, params.vasoZ);
  u.uVasoAmp.value = params.vasoAmp;
  u.uVasoFreq.value = params.vasoFreq;
  u.uVasoOctaves.value = params.vasoOctaves;
  u.uVasoSpeed.value = params.vasoSpeed;
  u.uVasoSeed.value = params.vasoSeed;
  u.uVasoTime.value = clock?.elapsedTime ?? 0;
  u.uWaterY.value = params.vasoY;
  if (u.normalSampler) u.normalSampler.value = loadWaterNormals();
}

function updateCausticUniforms() {
  if (!causticMat?.uniforms) return;
  syncCausticShared(causticMat.uniforms);
  causticMat.uniforms.uFootprintHalf.value.set(
    params.radioReflejo,
    isRect() ? params.radioReflejo * (params.largo / Math.max(params.radio, 0.001)) : params.radioReflejo
  );
  syncCausticShared(bioCausticMat?.uniforms);
  syncCausticShared(bioCurtainCausticMat?.uniforms);
}

function makeCreatureMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uFreq: { value: params.frecuencia },
      uLight: { value: params.luz },
      uCreatures: { value: params.criaturas },
      uBioFreq: { value: params.bioFreq },
      uBioSeed: { value: params.bioSeed },
      uGlow: { value: new THREE.Color(0xc8d4e0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uFreq, uLight, uCreatures, uBioFreq, uBioSeed;
      uniform vec3 uGlow;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for(int i=0;i<5;i++){ v += a * noise(p); p *= 2.05; a *= 0.55; }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        vec2 p = uv * 2.0 - 1.0;
        float disc = 1.0 - smoothstep(0.52, 1.0, length(p));
        if (disc < 0.004 || uCreatures < 0.004) discard;
        float t = uTime * 0.07 + uBioSeed * 0.01;
        float field = fbm(uv * (2.4 + uBioFreq * 0.4) + vec2(t, uFreq * 0.002));
        float filaments = abs(sin(uv.x * 9.0 + field * 4.0 + t * 2.0));
        float spheres = smoothstep(0.18, 0.05, length(vec2(p.x + 0.25 * sin(t), p.y * 0.7 - 0.1) ) - 0.12 * field);
        float tent = smoothstep(0.22, 0.02, abs(p.x - 0.35 * sin(p.y * 6.0 + t + field)));
        float creature = max(spheres, max(1.0 - filaments, tent));
        creature = smoothstep(0.35, 0.75, creature * field * 1.4) * uCreatures * disc;
        vec3 col = uGlow * creature * (0.55 + uLight * 1.4);
        gl_FragColor = vec4(col, creature);
      }
    `,
  });
}

function applyCreatureUniforms() {
  if (!bioCreatureMat?.uniforms) return;
  const u = bioCreatureMat.uniforms;
  u.uCreatures.value = params.criaturas;
  u.uLight.value = params.luz;
  u.uFreq.value = params.frecuencia;
  u.uBioFreq.value = params.bioFreq;
  u.uBioSeed.value = params.bioSeed;
}

function makeBeamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(params.sunColor) },
      uGain: { value: 0.22 },
    },
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec2 vUv;
      void main() {
        vY = uv.y;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vY;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uGain;
      void main() {
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = uGain * pow(max(edge, 0.0), 1.15) * (0.18 + vY * 0.85);
        vec3 col = uColor * a * 2.4;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

function makeProjectorHousing() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.3 })
  );
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.04, 24),
    new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      emissive: 0xcfe4ff,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.5,
    })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.12;
  group.add(body, lens);
  return group;
}

function buildProjector() {
  projectorGroup = makeProjectorHousing();
  projectorSpot = new THREE.SpotLight(0xeaf2ff, 40, 8, Math.PI / 9, 0.45, 1.4);
  projectorSpot.castShadow = true;
  scene.add(projectorSpot);
  scene.add(projectorSpot.target);
  beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 1, 1, 32, 1, true), makeBeamMaterial());
  scene.add(projectorGroup);
  scene.add(beamMesh);
}

function buildBioProjector() {
  bioProjectorGroup = makeProjectorHousing();
  bioProjectorSpot = new THREE.SpotLight(0xeaf2ff, 28, 8, Math.PI / 8, 0.5, 1.3);
  scene.add(bioProjectorSpot);
  scene.add(bioProjectorSpot.target);
  bioBeamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 1, 1, 32, 1, true), makeBeamMaterial());
  scene.add(bioProjectorGroup);
  scene.add(bioBeamMesh);

  if (causticMat) {
    bioCausticMat = causticMat.clone();
    bioCurtainCausticMat = causticMat.clone();
    bioCausticPatch = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bioCausticMat);
    bioCausticPatch.rotation.x = -Math.PI / 2;
    bioCausticPatch.renderOrder = 1;
    scene.add(bioCausticPatch);
    bioCurtainCaustic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bioCurtainCausticMat);
    bioCurtainCaustic.renderOrder = 3;
    scene.add(bioCurtainCaustic);
  }

  bioCreatureMat = makeCreatureMaterial();
  bioCreaturePatch = new THREE.Mesh(new THREE.CircleGeometry(1, 64), bioCreatureMat);
  bioCreaturePatch.renderOrder = 4;
  scene.add(bioCreaturePatch);
  bioCurtainCreature = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bioCreatureMat);
  bioCurtainCreature.renderOrder = 5;
  scene.add(bioCurtainCreature);
}

function makeRectFrustum(w0, d0, w1, d1, h) {
  const geo = new THREE.BufferGeometry();
  const y0 = -h * 0.5;
  const y1 = h * 0.5;
  const ring = (w, d, y) => {
    const hw = w * 0.5;
    const hd = d * 0.5;
    return [
      [-hw, y, -hd],
      [hw, y, -hd],
      [hw, y, hd],
      [-hw, y, hd],
    ];
  };
  const a = ring(w0, d0, y0);
  const b = ring(w1, d1, y1);
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const base = pos.length / 3;
    pos.push(...a[i], ...a[j], ...b[j], ...b[i]);
    const u0 = i / 4;
    const u1 = (i + 1) / 4;
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function placeProjector() {
  if (!projectorGroup || !beamMesh || !projectorSpot) return;
  const fromTop = params.proyector === "arriba";
  const ceilY = 4.02;
  const floorY = 0.018;
  const waterY = params.vasoY;
  const y0 = (fromTop ? 3.9 : 0.16) + params.lamparaY;
  const y1 = fromTop ? floorY : ceilY;
  const throwDist = Math.abs(y1 - waterY);
  const refThrow = fromTop ? Math.abs(2.25 - floorY) : Math.abs(ceilY - 2.25);
  const throwScale = THREE.MathUtils.clamp(throwDist / Math.max(0.2, refThrow), 0.22, 3.4);
  const spread = Math.min(1.85, throwDist * params.distortion * 0.05);
  const footW = params.radioReflejo * throwScale;
  const footD = (isRect()
    ? params.radioReflejo * (params.largo / Math.max(params.radio, 0.001))
    : params.radioReflejo) * throwScale;
  const patchW = Math.max(params.radio * 1.08 * throwScale + spread, footW * 1.15);
  const patchD = Math.max((isRect() ? params.largo : params.radio) * 1.08 * throwScale + spread, footD * 1.15);
  const patchR = Math.max(patchW, patchD);
  const lx = params.lamparaX;
  const lz = params.lamparaZ;
  const denom = waterY - y0;
  const t = Math.abs(denom) < 0.05 ? 1 : (y1 - y0) / denom;
  const hitX = lx + t * (params.vasoX - lx);
  const hitZ = lz + t * (params.vasoZ - lz);

  const start = new THREE.Vector3(lx, y0, lz);
  const end = new THREE.Vector3(hitX, y1, hitZ);
  const dir = end.clone().sub(start);
  const h = Math.max(dir.length(), 0.2);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const rNear = 0.035;
  const along = dir.clone().normalize();

  beamMesh.geometry.dispose();
  beamMesh.geometry = isRect()
    ? makeRectFrustum(rNear * 2, rNear * 2, patchW * 2, patchD * 2, h)
    : new THREE.CylinderGeometry(patchR, rNear, h, 32, 1, true);
  beamMesh.position.copy(mid);
  beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  if (beamMesh.material.uniforms?.uGain) {
    beamMesh.material.uniforms.uGain.value = 0.12 + params.luz * 0.28;
  }
  applyBeamColor();

  projectorGroup.position.copy(start);
  if (along.lengthSq() > 1e-8) {
    projectorGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), along);
  }
  if (!fromTop) projectorGroup.rotateZ(Math.PI);
  projectorSpot.position.copy(start);
  projectorSpot.target.position.copy(end);
  projectorSpot.distance = h + 0.8;
  projectorSpot.angle = Math.atan(patchR / Math.max(0.5, h)) * 1.2;
  projectorSpot.intensity = 18 + params.luz * 55;

  if (causticPatch) {
    causticPatch.position.set(hitX, y1, hitZ);
    causticPatch.rotation.x = fromTop ? -Math.PI / 2 : Math.PI / 2;
    causticPatch.scale.set(patchW, 1, patchD);
  }
  if (causticMat?.uniforms) {
    causticMat.uniforms.uThrow.value = throwDist;
    causticMat.uniforms.uLampPos.value.copy(start);
    causticMat.uniforms.uRect.value = isRect() ? 1 : 0;
    causticMat.uniforms.uVesselHalf.value.set(
      params.radio,
      isRect() ? params.largo : params.radio
    );
    causticMat.uniforms.uFootprintHalf.value.set(footW, footD);
    causticMat.uniforms.uPatchCenter.value.set(hitX, hitZ);
    causticMat.uniforms.uWaterY.value = waterY;
    if (causticMat.uniforms.uVesselCenter) {
      causticMat.uniforms.uVesselCenter.value.set(params.vasoX, params.vasoZ);
    }
  }
  placeBioProjector();
}

function applyRadius() {
  if (!vesselBody) return;
  if (isRect()) vesselBody.scale.set(params.radio, 1, params.largo);
  else vesselBody.scale.set(params.radio, 1, params.radio);
  applyVesselDeform(clock?.elapsedTime ?? 0);
  buildCables();
  placeProjector();
  applyWaterUniforms();
}

function applyVesselPose() {
  if (vesselDisk) vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);
  buildCables();
  placeProjector();
}

function bioProjectorAlong() {
  const eul = new THREE.Euler(
    THREE.MathUtils.degToRad(params.bioProyRotX),
    THREE.MathUtils.degToRad(params.bioProyRotY),
    THREE.MathUtils.degToRad(params.bioProyRotZ),
    "XYZ"
  );
  return new THREE.Vector3(0, 0, -1).applyEuler(eul).normalize();
}

function roomBeamHit(origin, dir) {
  const planes = [
    { n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(0, 0.018, 0) },
    { n: new THREE.Vector3(0, -1, 0), p: new THREE.Vector3(0, 4.02, 0) },
    { n: new THREE.Vector3(1, 0, 0), p: new THREE.Vector3(-4.18, 0, 0) },
    { n: new THREE.Vector3(-1, 0, 0), p: new THREE.Vector3(4.18, 0, 0) },
    { n: new THREE.Vector3(0, 0, 1), p: new THREE.Vector3(0, 0, -3.18) },
    { n: new THREE.Vector3(0, 0, -1), p: new THREE.Vector3(0, 0, 3.9) },
  ];
  let bestT = 12;
  let bestN = new THREE.Vector3(0, 1, 0);
  for (const { n, p } of planes) {
    const denom = dir.dot(n);
    if (Math.abs(denom) < 1e-4) continue;
    const t = p.clone().sub(origin).dot(n) / denom;
    if (t < 0.08 || t >= bestT) continue;
    const hit = origin.clone().addScaledVector(dir, t);
    if (Math.abs(hit.x) > 4.35 || hit.y < -0.05 || hit.y > 4.15 || Math.abs(hit.z) > 4.1) continue;
    bestT = t;
    bestN = n.clone();
  }
  return {
    point: origin.clone().addScaledVector(dir, bestT),
    normal: bestN,
    dist: bestT,
  };
}

function placeBioProjector() {
  if (!bioProjectorGroup || !bioBeamMesh || !bioProjectorSpot) return;
  const start = new THREE.Vector3(params.bioProyX, params.bioProyY, params.bioProyZ);
  const along = bioProjectorAlong();
  if (along.lengthSq() < 1e-8) along.set(0, -1, 0);
  const hit = roomBeamHit(start, along);
  const end = hit.point;
  const h = Math.max(hit.dist, 0.2);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const waterY = params.vasoY;
  const throwDist = Math.max(Math.abs(end.y - waterY), 0.12);
  const spread = Math.min(1.85, throwDist * params.distortion * 0.05);
  const throwScale = THREE.MathUtils.clamp(throwDist / 2.23, 0.22, 3.4);
  const cone = params.bioProyRadio;
  const footW = params.radioReflejo * throwScale;
  const footD = (isRect()
    ? params.radioReflejo * (params.largo / Math.max(params.radio, 0.001))
    : params.radioReflejo) * throwScale;
  const patchW = Math.max(params.radio * 1.08 * throwScale + spread, footW * 1.15) * cone;
  const patchD = Math.max((isRect() ? params.largo : params.radio) * 1.08 * throwScale + spread, footD * 1.15) * cone;
  const patchR = Math.max(patchW, patchD);
  const rNear = 0.035;

  bioBeamMesh.geometry.dispose();
  bioBeamMesh.geometry = new THREE.CylinderGeometry(patchR, rNear, h, 32, 1, true);
  bioBeamMesh.position.copy(mid);
  bioBeamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  if (bioBeamMesh.material.uniforms?.uGain) {
    bioBeamMesh.material.uniforms.uGain.value = 0.1 + params.luz * 0.22;
  }

  bioProjectorGroup.position.copy(start);
  bioProjectorGroup.rotation.set(
    THREE.MathUtils.degToRad(params.bioProyRotX),
    THREE.MathUtils.degToRad(params.bioProyRotY),
    THREE.MathUtils.degToRad(params.bioProyRotZ)
  );
  bioProjectorSpot.position.copy(start);
  bioProjectorSpot.target.position.copy(end);
  bioProjectorSpot.distance = h + 0.8;
  bioProjectorSpot.angle = Math.atan(patchR / Math.max(0.5, h)) * 1.15;
  bioProjectorSpot.intensity = params.bioProyCaustica ? 10 + params.luz * 28 : 22 + params.luz * 40;
  applyBeamColor();

  const showCaustics = params.bioProyCaustica;
  if (bioCausticPatch) {
    bioCausticPatch.visible = showCaustics;
    bioCausticPatch.position.copy(end).addScaledVector(hit.normal, 0.012);
    bioCausticPatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    bioCausticPatch.scale.set(patchW, patchD, 1);
  }
  if (bioCurtainCaustic && curtainMesh) {
    bioCurtainCaustic.visible = showCaustics;
    bioCurtainCaustic.position.copy(curtainMesh.position);
    bioCurtainCaustic.rotation.copy(curtainMesh.rotation);
    bioCurtainCaustic.scale.set(params.bioAncho * 0.98, params.bioAlto * 0.98, 1);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(curtainMesh.quaternion);
    bioCurtainCaustic.position.addScaledVector(n, 0.03);
  }
  if (bioCausticMat?.uniforms) {
    const u = bioCausticMat.uniforms;
    u.uThrow.value = throwDist;
    u.uLampPos.value.copy(start);
    u.uRect.value = isRect() ? 1 : 0;
    u.uVesselHalf.value.set(params.radio, isRect() ? params.largo : params.radio);
    u.uVesselCenter.value.set(params.vasoX, params.vasoZ);
    u.uFootprintHalf.value.set(footW * params.bioProyRadio, footD * params.bioProyRadio);
    u.uPatchCenter.value.set(end.x, end.z);
    u.uWaterY.value = waterY;
  }
  if (bioCurtainCausticMat?.uniforms) {
    const u = bioCurtainCausticMat.uniforms;
    u.uThrow.value = throwDist;
    u.uLampPos.value.copy(start);
    u.uRect.value = isRect() ? 1 : 0;
    u.uVesselHalf.value.set(params.radio, isRect() ? params.largo : params.radio);
    u.uVesselCenter.value.set(params.vasoX, params.vasoZ);
    u.uFootprintHalf.value.set(8, 8);
    u.uPatchCenter.value.set(params.bioX, params.bioZ);
    u.uWaterY.value = waterY;
    u.uLight.value = params.luz * 1.15;
  }
  if (bioCreaturePatch) {
    bioCreaturePatch.visible = params.criaturas > 0.004;
    bioCreaturePatch.position.copy(end).addScaledVector(hit.normal, 0.02);
    bioCreaturePatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    bioCreaturePatch.scale.setScalar(patchR);
  }
  if (bioCurtainCreature && curtainMesh) {
    bioCurtainCreature.visible = params.criaturas > 0.004;
    bioCurtainCreature.position.copy(curtainMesh.position);
    bioCurtainCreature.rotation.copy(curtainMesh.rotation);
    bioCurtainCreature.scale.set(params.bioAncho * 0.98, params.bioAlto * 0.98, 1);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(curtainMesh.quaternion);
    bioCurtainCreature.position.addScaledVector(n, 0.035);
  }
  applyCreatureUniforms();
}

function buildCurtain() {
  if (curtainMesh) {
    scene.remove(curtainMesh);
    curtainMesh.geometry.dispose();
  }
  curtainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFreq: { value: params.frecuencia },
      uLight: { value: params.luz },
      uCreatures: { value: params.criaturas },
      uBass: { value: 0 },
      uBioAmp: { value: params.bioAmp },
      uBioFreq: { value: params.bioFreq },
      uBioOctaves: { value: params.bioOctaves },
      uBioSpeed: { value: params.bioSpeed },
      uBioSeed: { value: params.bioSeed },
      uFabric: { value: new THREE.Color(params.bioColor) },
      uGlow: { value: new THREE.Color(0xc8d4e0) },
      uOpacity: { value: params.bioOpacity },
    },
    transparent: true,
    depthWrite: params.bioOpacity > 0.82,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uBioAmp, uBioFreq, uBioSpeed, uBioSeed, uBioOctaves;

      float hash(vec3 p){
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x){
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                         mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                         mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p){
        float v = 0.0;
        float a = 0.5;
        int oct = int(clamp(uBioOctaves, 1.0, 6.0));
        for (int i = 0; i < 6; i++) {
          if (i >= oct) break;
          v += a * noise(p);
          p = p * 2.07 + 0.13;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vUv = uv;
        vec3 p = position;
        float t = uTime * uBioSpeed + uBioSeed * 0.13;
        float n = fbm(vec3(uv * uBioFreq, t));
        float n2 = fbm(vec3(uv.yx * uBioFreq * 1.17, t + 4.2));
        p.z += (n * 2.0 - 1.0) * uBioAmp;
        p.x += (n2 - 0.5) * uBioAmp * 0.22;
        p.y += (n - 0.5) * uBioAmp * 0.12;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uFreq, uLight, uCreatures, uBass, uBioFreq, uBioSpeed, uBioSeed, uOpacity;
      uniform vec3 uFabric, uGlow;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for(int i=0;i<5;i++){ v += a * noise(p); p *= 2.05; a *= 0.55; }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        float grain = fbm(uv * (1.8 + uBioFreq * 0.2) + vec2(uTime * 0.02, uBioSeed * 0.01));
        vec3 col = mix(uFabric, uFabric * 0.55, grain * 0.35);
        col = mix(col, uGlow, uLight * 0.04);
        gl_FragColor = vec4(col, clamp(uOpacity, 0.0, 1.0));
      }
    `,
  });
  curtainMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 72, 64), curtainMat);
  scene.add(curtainMesh);
  applyCurtain();
}

function applyCurtain() {
  if (!curtainMesh) return;
  curtainMesh.scale.set(params.bioAncho, params.bioAlto, 1);
  curtainMesh.position.set(params.bioX, params.bioY, params.bioZ);
  curtainMesh.rotation.set(
    THREE.MathUtils.degToRad(params.bioRotX),
    THREE.MathUtils.degToRad(params.bioRotY),
    THREE.MathUtils.degToRad(params.bioRotZ)
  );
  if (curtainMat?.uniforms) {
    const u = curtainMat.uniforms;
    u.uBioAmp.value = params.bioAmp;
    u.uBioFreq.value = params.bioFreq;
    u.uBioOctaves.value = params.bioOctaves;
    u.uBioSpeed.value = params.bioSpeed;
    u.uBioSeed.value = params.bioSeed;
    u.uFabric.value.set(params.bioColor);
    u.uOpacity.value = params.bioOpacity;
    curtainMat.depthWrite = params.bioOpacity > 0.82;
  }
  applyCreatureUniforms();
  placeBioProjector();
}

function buildSpeakers() {
  const body = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.8 });
  const cone = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.45, metalness: 0.2 });
  const led = new THREE.MeshStandardMaterial({
    color: 0xc8d4e0,
    emissive: 0xc8d4e0,
    emissiveIntensity: 0.2,
  });
  const spots = [
    [-2.6, 0.45, 2.2],
    [2.6, 0.45, 2.2],
    [-2.6, 0.45, -2.2],
    [2.6, 0.45, -2.2],
  ];
  for (const [x, y, z] of spots) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.22), body);
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), cone);
    c.position.z = 0.115;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), led.clone());
    l.position.set(0, 0.28, 0.12);
    g.add(box, c, l);
    g.position.set(x, y, z);
    g.lookAt(0, 2.1, 0);
    scene.add(g);
    speakers.push({ group: g, led: l.material });
    l.material.emissiveIntensity = 0.12;
  }
}

function buildLights() {
  hemi = new THREE.HemisphereLight(0xdde6f0, 0x07080a, 0.7);
  scene.add(hemi);
  keyLight = new THREE.SpotLight(0xe8eef4, params.luz * 55, 14, Math.PI / 6, 0.45, 1.0);
  keyLight.position.set(-1.8, 3.2, 2.2);
  keyLight.target.position.set(0, 2.2, 0);
  keyLight.castShadow = true;
  // scene.add(keyLight, keyLight.target);

  fillLight = new THREE.PointLight(0x8a9aaa, 6, 12, 2);
  fillLight.position.set(1.4, 1.2, 1.8);
  scene.add(fillLight);

  rimLight = new THREE.PointLight(0xdde6f0, 10, 10, 2);
  rimLight.position.set(0.3, 2.6, -0.2);
  scene.add(rimLight);
}

function snapshotState() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    params: { ...params },
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
    },
  };
}

function rumorFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `rumor-${stamp}.json`;
}

function saveState() {
  const blob = new Blob([JSON.stringify(snapshotState(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = rumorFilename();
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyState(data) {
  const next = data?.params && typeof data.params === "object" ? data.params : data;
  if (!next || typeof next !== "object") return;
  Object.keys(params).forEach((key) => {
    if (next[key] !== undefined) params[key] = next[key];
  });
  rebuildVessel();
  applyRoomTemp();
  applyCurtain();
  applyVesselPose();
  placeProjector();
  applyWaterUniforms();
  if (params.audio) startAudio();
  else stopAudio();
  if (data?.camera?.position) camera.position.fromArray(data.camera.position);
  if (data?.camera?.target) controls.target.fromArray(data.camera.target);
  if (gui?.controllersRecursive) {
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  } else {
    gui?.controllers.forEach((c) => c.updateDisplay());
  }
}

function loadStateDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      applyState(JSON.parse(await file.text()));
    } catch (err) {
      console.error(err);
    }
  };
  input.click();
}

function buildGui() {
  if (PRESENTATION) return;
  gui = new GUI({ title: "sala" });
  const estado = gui.addFolder("estado");
  estado.add({ guardar: saveState }, "guardar").name("guardar JSON");
  estado.add({ cargar: loadStateDialog }, "cargar").name("cargar JSON");
  const rec = gui.addFolder("recipiente");
  rec.add(params, "forma", { Circular: "circular", Rectangular: "rectangular" })
    .name("forma")
    .onChange(rebuildVessel);
  rec.add(params, "radio", 0.25, 1.2, 0.01).name("radio / ancho").onChange(applyRadius);
  rec.add(params, "largo", 0.2, 1.2, 0.01).name("largo (rect)").onChange(applyRadius);
  rec.add(params, "vasoX", -2.2, 2.2, 0.01).name("x").onChange(applyVesselPose);
  rec.add(params, "vasoY", 0.4, 3.7, 0.01).name("altura").onChange(applyVesselPose);
  rec.add(params, "vasoZ", -2.4, 2.4, 0.01).name("z").onChange(applyVesselPose);
  rec.add(params, "vasoAmp", 0, 0.55, 0.01).name("perlin amp").onChange(() => applyVesselDeform());
  rec.add(params, "vasoFreq", 0.2, 8, 0.05).name("perlin freq").onChange(() => applyVesselDeform());
  rec.add(params, "vasoOctaves", 1, 6, 1).name("octavas").onChange(() => applyVesselDeform());
  rec.add(params, "vasoSpeed", 0, 1.5, 0.01).name("perlin vel");
  rec.add(params, "vasoSeed", 0, 99, 1).name("semilla").onChange(() => applyVesselDeform());
  const agua = gui.addFolder("agua");
  agua.addColor(params, "colorAgua").name("color").onChange(applyWaterUniforms);
  agua.addColor(params, "sunColor").name("color sol").onChange(applyWaterUniforms);
  // agua.add(params, "sunElevation", 0, 90, 0.1).name("elevación sol").onChange(applyWaterUniforms);
  // agua.add(params, "sunAzimuth", -180, 180, 0.1).name("azimut sol").onChange(applyWaterUniforms);
  agua.add(params, "distortion", 0, 8, 0.1).name("distorsión").onChange(applyWaterUniforms);
  agua.add(params, "waveSize", 0.1, 10, 0.05).name("tamaño ola").onChange(applyWaterUniforms);
  agua.add(params, "waveSpeed", 0, 2, 0.05).name("velocidad");
  agua.add(params, "alphaAgua", 0.15, 1, 0.01).name("opacidad").onChange(applyWaterUniforms);
  gui.add(params, "temperatura", 2700, 9000, 50).name("temperatura K").onChange(applyRoomTemp);
  gui.add(params, "luz", 0.05, 1.4, 0.01).name("luz / cáustica").onChange(placeProjector);
  gui.add(params, "radioReflejo", 0.12, 2.4, 0.01).name("radio reflejo").onChange(placeProjector);
  const bio = gui.addFolder("biomaterial");
  bio.add(params, "criaturas", 0, 1, 0.01).name("criaturas").onChange(() => {
    applyCreatureUniforms();
    placeBioProjector();
  });
  bio.addColor(params, "bioColor").name("color").onChange(applyCurtain);
  bio.add(params, "bioOpacity", 0, 1, 0.01).name("opacidad").onChange(applyCurtain);
  bio.add(params, "bioX", -8, 8, 0.01).name("x").onChange(applyCurtain);
  bio.add(params, "bioY", -4, 6, 0.01).name("y").onChange(applyCurtain);
  bio.add(params, "bioZ", -8, 8, 0.01).name("z").onChange(applyCurtain);
  bio.add(params, "bioRotX", -360, 360, 1).name("rot x").onChange(applyCurtain);
  bio.add(params, "bioRotY", -360, 360, 1).name("rot y").onChange(applyCurtain);
  bio.add(params, "bioRotZ", -360, 360, 1).name("rot z").onChange(applyCurtain);
  bio.add(params, "bioAncho", 0.4, 16, 0.05).name("ancho").onChange(applyCurtain);
  bio.add(params, "bioAlto", 0.4, 16, 0.05).name("alto").onChange(applyCurtain);
  bio.add(params, "bioAmp", 0, 1.2, 0.01).name("perlin amp").onChange(applyCurtain);
  bio.add(params, "bioFreq", 0.2, 8, 0.05).name("perlin freq").onChange(applyCurtain);
  bio.add(params, "bioOctaves", 1, 6, 1).name("octavas").onChange(applyCurtain);
  // bio.add(params, "bioSpeed", 0, 1.5, 0.01).name("perlin vel").onChange(applyCurtain);
  bio.add(params, "bioSeed", 0, 99, 1).name("semilla").onChange(applyCurtain);
  const bioProy = gui.addFolder("bio material proyector");
  bioProy.add(params, "bioProyX", -8, 8, 0.01).name("x").onChange(placeBioProjector);
  bioProy.add(params, "bioProyY", -4, 8, 0.01).name("y").onChange(placeBioProjector);
  bioProy.add(params, "bioProyZ", -8, 8, 0.01).name("z").onChange(placeBioProjector);
  bioProy.add(params, "bioProyRotX", -360, 360, 1).name("rot x").onChange(placeBioProjector);
  bioProy.add(params, "bioProyRotY", -360, 360, 1).name("rot y").onChange(placeBioProjector);
  bioProy.add(params, "bioProyRotZ", -360, 360, 1).name("rot z").onChange(placeBioProjector);
  bioProy.add(params, "bioProyRadio", 0.1, 16, 0.01).name("radio cono").onChange(placeBioProjector);
  bioProy.add(params, "bioProyCaustica").name("cáusticas agua").onChange(placeBioProjector);
  const lamp = gui.addFolder("lámpara");
  lamp.add(params, "proyector", { Arriba: "arriba", Abajo: "abajo" })
    .name("lado")
    .onChange(placeProjector);
  lamp.add(params, "lamparaX", -4, 4, 0.01).name("x").onChange(placeProjector);
  lamp.add(params, "lamparaZ", -4, 4, 0.01).name("z").onChange(placeProjector);
  lamp.add(params, "lamparaY", -3, 3, 0.01).name("altura").onChange(placeProjector);
  gui.add(params, "audio").name("audio cuadrafónico").onChange((on) => {
    if (on) startAudio();
    else stopAudio();
  });
}

function unlockAudio() {
  if (audio?.ctx?.state === "suspended") audio.ctx.resume();
  ensureFieldSound();
  if (fieldHowl && !fieldHowl.playing() && fieldVol > 0.002) fieldHowl.play();
}

function startAudio() {
  if (audio) {
    audio.ctx.resume();
    audio.gains.forEach((g) => {
      g.gain.cancelScheduledValues(audio.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, audio.ctx.currentTime + 0.3);
    });
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const listener = ctx.listener;
  const gains = [];
  const oscs = [];
  const positions = [
    [-2.6, 0.45, 2.2],
    [2.6, 0.45, 2.2],
    [-2.6, 0.45, -2.2],
    [2.6, 0.45, -2.2],
  ];
  positions.forEach(([x, y, z]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = params.frecuencia;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = params.frecuencia * 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1;
    p.setPosition(x, y, z);
    osc.connect(g);
    osc2.connect(g);
    g.connect(p);
    p.connect(ctx.destination);
    osc.start();
    osc2.start();
    oscs.push(osc, osc2);
    gains.push(g);
  });
  audio = { ctx, oscs, gains, listener };
}

function stopAudio() {
  if (!audio) return;
  audio.gains.forEach((g) => {
    g.gain.cancelScheduledValues(audio.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.25);
  });
}

function syncAudio() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.oscs.forEach((osc, i) => {
    const f = i % 2 === 0 ? params.frecuencia : params.frecuencia * 0.5;
    osc.frequency.setTargetAtTime(f, t, 0.05);
  });
  if (audio.listener.positionX) {
    audio.listener.positionX.setValueAtTime(camera.position.x, t);
    audio.listener.positionY.setValueAtTime(camera.position.y, t);
    audio.listener.positionZ.setValueAtTime(camera.position.z, t);
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime;
  const beat = Math.abs(Math.sin(t * params.frecuencia * 0.15));
  rumble.value = THREE.MathUtils.lerp(rumble.value, beat, 0.15);

  const mats = [curtainMat].filter((m) => m && m.uniforms);
  for (const m of mats) {
    m.uniforms.uTime.value = t;
    m.uniforms.uFreq.value = params.frecuencia;
    if (m.uniforms.uLight) m.uniforms.uLight.value = params.luz;
    if (m.uniforms.uCreatures) m.uniforms.uCreatures.value = params.criaturas;
    if (m.uniforms.uBass) m.uniforms.uBass.value = rumble.value;
    if (m.uniforms.uBioAmp) {
      m.uniforms.uBioAmp.value = params.bioAmp;
      m.uniforms.uBioFreq.value = params.bioFreq;
      m.uniforms.uBioOctaves.value = params.bioOctaves;
      m.uniforms.uBioSpeed.value = params.bioSpeed;
      m.uniforms.uBioSeed.value = params.bioSeed;
    }
    if (m.uniforms.uOpacity) m.uniforms.uOpacity.value = params.bioOpacity;
  }
  if (bioCreatureMat?.uniforms) {
    bioCreatureMat.uniforms.uTime.value = t;
    applyCreatureUniforms();
  }

  if (waterDisk?.material?.uniforms?.time) {
    waterDisk.material.uniforms.time.value += delta * params.waveSpeed;
  }
  updateCausticUniforms();

  if (keyLight) keyLight.intensity = 8 + params.luz * 32;
  if (rimLight) rimLight.intensity = 1.2 + params.luz * 2.2;

  applyVesselDeform(t);
  if (vesselDisk) vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);

  if (transducer) {
    transducer.scale.setScalar(1.2 * (1 + rumble.value * 0.04));
  }

  if (params.audio) syncAudio();
  controls.update();
  renderer.render(scene, camera);
}

init();
animate();

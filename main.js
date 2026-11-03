import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import GUI from "lil-gui";

const ROOM = { x: 5, zBack: -5, zFront: 5, ceil: 4.05, floor: 0.018 };
const MODEL_URL = {
  recipiente: "./models/recipiente.obj",
  "export-circle": "./models/export-circle.obj",
  "alcantarilla-extruida": "./models/alcantarilla-extruida.obj",
};

const params = {
  recipiente: "recipiente",
  forma: "circular",
  radio: 0.4,
  largo: 0.63,
  colorAgua: "#3d6a78",
  sunColor: "#fffefc",
  sunElevation: 0,
  sunAzimuth: 25,
  distortion: 6.6,
  waveSize: 10.95,
  waveSpeed: 2,
  alphaAgua: 0.9,
  frecuencia: 48,
  luz: 1.15,
  radioReflejo: 1.15,
  vasoY: 1.26,
  vasoX: -0.43,
  vasoZ: 0,
  vasoAmp: 0,
  vasoFreq: 2.4,
  vasoOctaves: 3,
  vasoSpeed: 0,
  vasoSeed: 11,
  lamparaX: -0.43,
  lamparaZ: 0,
  lamparaY: 0,
  luzArriba: true,
  colorLuzArriba: "#f4f1ea",
  temperatura: 6400,
  frio: 0,
  vibracion: 0,
  patronFreq: 140,
  patronFuerza: 2,
  estado: 0,
  audio: false,
  mascaraCircular: true,
  radioMascara: 0.92,
  videoPos: 0,
  salaAncho: 6.7,
  salaLargo: 6.4,
  salaAlto: 4.3,
  videoPlay: true,
  videoPorInmersion: false,
  resonadorLugar: "pared",
  resonadorAngulo: 0,
  resonadorRadio: 0,
  tapaX: -0.44,
  tapaY: 2.44,
  tapaZ: -0.05,
  tapaAngulada: true,
  tapaAngulo: 30,
  tapaRotY: 0,
  tapaSombra: 1.8,
  criaturas: 1,
  criaturasRadio: 1.2,
  audioVisible: true,
  subX: -0.48,
  subZ: 2.51,
  subRot: 0,
  spk1X: -2.92,
  spk1Z: -1.63,
  spk1Rot: 16,
  spk2X: 1.76,
  spk2Z: -1.63,
  spk2Rot: -14,
};

const START_CAMERA = {
  position: [8.09100208257247, 3.3820619726274894, 7.0550983834495415],
  target: [0, 1.45, 0],
};

const STATE_INITIAL = {
  temperatura: 6400,
  luz: 0.28,
  frio: 0,
  vibracion: 0,
  distortion: 0.35,
  waveSpeed: 0,
  waveSize: 2.4,
  colorAgua: "#3d6a78",
  criaturas: 0.22,
  volume: 0,
};

const STATE_FINAL = {
  temperatura: 9450,
  luz: 1.15,
  frio: 1,
  vibracion: 1,
  distortion: 6.6,
  waveSpeed: 2,
  waveSize: 10.95,
  colorAgua: "#1839f7",
  criaturas: 1,
  volume: 1,
};

const STATE_CURVES = {
  master: { type: "smoothstep", power: 1 },
  temperatura: { type: "easeIn", power: 1.4 },
  luz: { type: "smoothstep", power: 1 },
  frio: { type: "easeIn", power: 1.25 },
  vibracion: { type: "smoothstep", power: 1 },
  distortion: { type: "smoothstep", power: 1 },
  waveSpeed: { type: "smoothstep", power: 1 },
  waveSize: { type: "smoothstep", power: 1 },
  colorAgua: { type: "easeIn", power: 1.2 },
  criaturas: { type: "easeOut", power: 1.35 },
  volume: { type: "easeIn", power: 2.1, delay: 0.05 },
};

const SOUND = {
  src: "./sonido-simulacion-soterrado.wav",
  loop: true,
  maxVolume: 0.85,
  html5: true,
};

const WATER_NORMALS_URL = "./textures/waternormals.jpg";

const ORGANIC_GLSL = /* glsl */ `
  float ohash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float onoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = ohash(i);
    float b = ohash(i + vec2(1.0, 0.0));
    float c = ohash(i + vec2(0.0, 1.0));
    float d = ohash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float organicField(vec2 p, float time) {
    float v = 0.0;
    float a = 0.55;
    vec2 q = p * 2.2 + vec2(time * 0.07, -time * 0.05);
    for (int i = 0; i < 4; i++) {
      v += a * onoise(q);
      q = q * 2.17 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    float w = onoise(p * 5.8 + vec2(-time * 0.13, time * 0.04));
    return v * 0.72 + w * 0.28;
  }
  float organicHeight(vec2 p, float time) {
    return (organicField(p * 1.6, time) - 0.42) * 0.035;
  }
`;

function bindOrganicWater(mesh) {
  const mat = mesh?.material;
  if (!mat || mat.userData.organic) return;
  mat.userData.organic = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVib = { value: params.vibracion * params.patronFuerza };
    mesh.userData.organicUniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace("uniform float time;", `uniform float time;\nuniform float uVib;\n${ORGANIC_GLSL}`)
      .replace(
        "mirrorCoord = modelMatrix * vec4( position, 1.0 );",
        `vec3 displaced = position;
        displaced.y += organicHeight(position.xz, time) * uVib;
        mirrorCoord = modelMatrix * vec4( displaced, 1.0 );`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform float time;", `uniform float time;\nuniform float uVib;\n${ORGANIC_GLSL}`)
      .replace(
        "vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );",
        `vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );
        float org = organicField(worldPosition.xz, time);
        vec2 og = vec2(
          organicField(worldPosition.xz + vec2(0.03, 0.0), time) - org,
          organicField(worldPosition.xz + vec2(0.0, 0.03), time) - org
        );
        surfaceNormal = normalize(surfaceNormal + vec3(og.x, 0.0, og.y) * uVib * 3.2);`
      )
      .replace(
        "vec3 outgoingLight = albedo;",
        `float grain = organicField(worldPosition.xz * 1.8, time * 0.85);
        albedo = mix(albedo, albedo * (0.55 + grain * 0.85) + waterColor * (0.15 + grain * 0.55), uVib * 0.82);
        vec3 outgoingLight = albedo;`
      );
  };
  mat.needsUpdate = true;
}
const VIDEO_URL = "./video/proyector.mp4";

let renderer, scene, camera, controls, clock, gui, hemi, fillLight;
let waterDisk, waterVolume, vesselDisk, vesselBody, cableGroup;
let floorMat, wallMat;
let waterNormals = null;
let projectorGroup, projectorSpot, beamMesh, transducer;
let topGroup, topSpot, topBeam, topLens;
let rimMat = null;
let vesselGeos = [];
let vesselMetrics = { radius: 0.25, bottomY: -0.11, topY: 0.11, waterY: 0.02, waterRadius: 0.22 };
let fieldHowl = null;
let fieldVol = 0;
let video = null;
let videoTexture = null;
let videoScrub = false;
let videoCtrl = null;
let lidGroup, lidPlate, lidMat, lidTexture;
let projMat, projMeshes = [];
let roomParts = null;
let criaturaMesh, criaturaMat;
let audioGear = [];
let customObjUrl = null;
let objCache = null;
let vesselToken = 0;
const objLoader = new OBJLoader();

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

const tmpColor = new THREE.Color();
const tmpColorB = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function kelvinToRGB(k) {
  k = THREE.MathUtils.clamp(k, 1000, 14000) / 100;
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

function mixColor(a, b, u) {
  tmpColor.set(a);
  tmpColorB.set(b);
  return `#${tmpColor.lerp(tmpColorB, u).getHexString()}`;
}

function mixValue(a, b, u) {
  if (typeof a === "string" && typeof b === "string" && a.startsWith("#")) return mixColor(a, b, u);
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
  const warm = kelvinToRGB(params.temperatura);
  const cold = tmpColorB.set("#6d8cff");
  params.sunColor = `#${warm.lerp(cold, params.frio * 0.72).getHexString()}`;
  const volU = channelT(master, STATE_CURVES.volume);
  const vol = mixValue(STATE_INITIAL.volume, STATE_FINAL.volume, volU);
  if (scene) {
    applyRoomTemp();
    applyWaterUniforms();
    placeProjector();
    applyTopLight();
    syncCymatic();
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
  const kelvin = kelvinToRGB(params.temperatura);
  const cold = tmpColorB.set("#1630c4");
  const grade = kelvin.clone().lerp(cold, params.frio * 0.86);
  const bg = tmpColor.set("#101318").lerp(tmpColorB.set("#070c22"), params.frio);
  bg.multiplyScalar(0.55 + params.frio * 0.35);
  scene.background.copy(bg);
  scene.fog.color.copy(bg);
  if (wallMat) {
    const wall = tmpColor.set("#3c4452").lerp(tmpColorB.set("#31457a"), params.frio);
    wallMat.color.copy(wall);
  }
  if (floorMat) {
    floorMat.color.setRGB(0.11, 0.115, 0.13 + params.frio * 0.03);
  }
  if (hemi) {
    hemi.color.copy(grade);
    hemi.groundColor.set("#1a1e28").lerp(tmpColorB.set("#182048"), params.frio);
    hemi.intensity = 0.9 - params.frio * 0.2;
  }
  if (fillLight) {
    fillLight.color.copy(grade);
    fillLight.intensity = 1.25 - params.frio * 0.35;
  }
  applyBeamColor();
  if (projMat?.uniforms) {
    projMat.uniforms.uFrio.value = params.frio;
    projMat.uniforms.uLight.value = params.luz;
    projMat.uniforms.uDistortion.value = params.distortion;
    projMat.uniforms.uVibracion.value = params.vibracion;
    projMat.uniforms.uSize.value = params.waveSize;
  }
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.FogExp2(0x07080a, 0.026);

  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 80);
  camera.position.fromArray(START_CAMERA.position);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(START_CAMERA.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.995;
  controls.minPolarAngle = 0.02;
  controls.minDistance = 1.4;
  controls.maxDistance = 18;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x121820);
  envScene.add(new THREE.HemisphereLight(0xc5d4ee, 0x05070c, 2.4));
  scene.environment = pmrem.fromScene(envScene, 0.12).texture;
  pmrem.dispose();
  hemi = new THREE.HemisphereLight(0xc5d0dc, 0x12141a, 0.85);
  scene.add(hemi);
  fillLight = new THREE.DirectionalLight(0xd5deea, 1.15);
  fillLight.name = "luz_relleno";
  fillLight.position.set(3.2, 6.4, 5.5);
  scene.add(fillLight);

  clock = new THREE.Clock();
  buildRoom();
  buildProjection();
  buildProjector();
  buildTopLight();
  buildVessel();
  buildTransducer();
  buildCriaturas();
  buildLid();
  buildAudioGear();
  setupVideo();
  loadLidTexture();
  applyRoomTemp();
  finishVessel();
  placeLid();
  placeAudioGear();
  applyTopLight();
  buildGui();
  buildStateFader();
  applyEstadoMix();

  addEventListener("resize", onResize);
  addEventListener("pointerdown", () => {
    unlockAudio();
    if (params.videoPlay) video?.play?.().catch(() => {});
  }, { once: true });
}

function syncRoom() {
  ROOM.x = params.salaAncho / 2;
  ROOM.zBack = -params.salaLargo / 2;
  ROOM.zFront = params.salaLargo / 2;
  ROOM.ceil = params.salaAlto;
}

function setPlane(mesh, w, h) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(Math.max(0.4, w), Math.max(0.4, h));
}

function applyRoomSize() {
  syncRoom();
  if (!roomParts) return;
  const width = params.salaAncho;
  const depth = params.salaLargo;
  const height = params.salaAlto;
  const yMid = height / 2;
  setPlane(roomParts.floor, width, depth);
  setPlane(roomParts.back, width, height);
  roomParts.back.position.set(0, yMid, ROOM.zBack);
  setPlane(roomParts.left, depth, height);
  roomParts.left.position.set(-ROOM.x, yMid, 0);
  setPlane(roomParts.ceil, width, depth);
  roomParts.ceil.position.y = height;
  const specs = [
    [0, width - 0.08, depth - 0.08, 0, height - 0.02, 0],
    [1, width - 0.08, height - 0.06, 0, yMid, ROOM.zBack + 0.03],
    [2, depth - 0.08, height - 0.06, -ROOM.x + 0.03, yMid, 0],
  ];
  specs.forEach(([i, w, h, x, y, z]) => {
    const mesh = projMeshes[i];
    if (!mesh) return;
    setPlane(mesh, w, h);
    mesh.position.set(x, y, z);
  });
  buildCables();
  placeLid();
  placeProjector();
  applyTopLight();
}

function buildRoom() {
  syncRoom();
  wallMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
  floorMat = new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: 0.96, metalness: 0 });
  const width = ROOM.x * 2;
  const depth = ROOM.zFront - ROOM.zBack;
  const height = ROOM.ceil;
  const yMid = height / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.name = "suelo";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
  back.name = "pared_atras";
  back.position.set(0, yMid, ROOM.zBack);
  back.receiveShadow = true;
  scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
  left.name = "pared_izquierda";
  left.rotation.y = Math.PI / 2;
  left.position.set(-ROOM.x, yMid, 0);
  left.receiveShadow = true;
  scene.add(left);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x9aa6b4,
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilMat);
  ceil.name = "techo";
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.ceil;
  ceil.renderOrder = 1;
  scene.add(ceil);
  roomParts = { floor, back, left, ceil };
}

function loadWaterNormals() {
  if (waterNormals) return waterNormals;
  waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });
  return waterNormals;
}

function lampPos() {
  return new THREE.Vector3(params.lamparaX, 0.1 + params.lamparaY, params.lamparaZ);
}

function applyBeamColor() {
  const c = tmpColor.set(params.sunColor);
  const tint = (beam, group, spot) => {
    if (beam?.material?.uniforms?.uColor) beam.material.uniforms.uColor.value.copy(c);
    if (spot && spot !== topSpot) spot.color.copy(c);
    group?.traverse((o) => {
      if (o.material?.emissive && o !== topLens) {
        o.material.emissive.copy(c);
        o.material.emissiveIntensity = 0.85;
      }
    });
  };
  tint(beamMesh, projectorGroup, projectorSpot);
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
  if (waterVolume?.material?.color) waterVolume.material.color.set(params.colorAgua);
  const phi = THREE.MathUtils.degToRad(90 - params.sunElevation);
  const theta = THREE.MathUtils.degToRad(params.sunAzimuth);
  u.sunDirection.value.setFromSphericalCoords(1, phi, theta);
  applyBeamColor();
  if (projectorGroup) placeProjector();
}

function cable(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(dir.length(), 0.001);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, len, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.65 })
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function isRect() {
  return params.recipiente === "rectangular";
}

function isProcedural() {
  return params.recipiente === "cilindro" || params.recipiente === "rectangular";
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
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(n(0, 0, 0), n(1, 0, 0), fx), lerp(n(0, 1, 0), n(1, 1, 0), fx), fy),
    lerp(lerp(n(0, 0, 1), n(1, 0, 1), fx), lerp(n(0, 1, 1), n(1, 1, 1), fx), fy),
    fz
  );
}

function fbm3(x, y, z, octaves) {
  let v = 0;
  let a = 0.5;
  const oct = Math.max(1, Math.min(6, octaves | 0));
  for (let i = 0; i < oct; i++) {
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
  const n = fbm3(Math.cos(ang) * params.vasoFreq, Math.sin(ang) * params.vasoFreq, tt, params.vasoOctaves);
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
  vesselGeos.push({ geo, orig: Float32Array.from(geo.attributes.position.array), mode });
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
}

function waterOpts() {
  return {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: loadWaterNormals(),
    sunDirection: new THREE.Vector3(0.2, 0.9, 0.15).normalize(),
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
    color: 0xd5e2de,
    roughness: 0.08,
    metalness: 0.02,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return rimMat;
}

function makeFillMaterial() {
  return new THREE.MeshStandardMaterial({
    color: params.colorAgua,
    roughness: 0.35,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function bowlContours(root, segments) {
  root.updateMatrixWorld(true);
  const points = [];
  const v = new THREE.Vector3();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const pos = child.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      points.push(v.x, v.y, v.z);
    }
  });
  if (!points.length) return null;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < points.length; i += 3) {
    minY = Math.min(minY, points[i]);
    maxY = Math.max(maxY, points[i]);
  }
  const height = Math.max(maxY - minY, 1e-4);
  const band = (low, high) => {
    const radii = new Array(segments).fill(0);
    for (let i = 0; i < points.length; i += 3) {
      const t = (points[i + 1] - minY) / height;
      if (t < low || t > high) continue;
      const x = points[i];
      const z = points[i + 2];
      const idx = Math.round(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * segments) % segments;
      radii[idx] = Math.max(radii[idx], Math.hypot(x, z));
    }
    for (let i = 0; i < segments; i++) {
      if (radii[i] > 0.01) continue;
      let prev = 0;
      let next = 0;
      for (let k = 1; k < segments && (!prev || !next); k++) {
        if (!prev) prev = radii[(i - k + segments) % segments];
        if (!next) next = radii[(i + k) % segments];
      }
      radii[i] = prev && next ? (prev + next) * 0.5 : prev || next || 0.2;
    }
    return radii.map((r, i) => {
      const prev = radii[(i + segments - 1) % segments];
      const next = radii[(i + 1) % segments];
      return Math.max(0.03, (prev + r + next) / 3 - 0.012);
    });
  };
  return { bottom: band(0, 0.22), top: band(0.72, 1.02), minY, maxY };
}

function buildFilledWater(rings) {
  const seg = rings[0].radii.length;
  const positions = [];
  const uvs = [];
  const push = (x, y, z, u, v) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  const rows = rings.map((ring) => {
    const maxR = Math.max(...ring.radii, 0.001);
    return ring.radii.map((r, i) => {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      return push(x, ring.y, z, x / (maxR * 2) + 0.5, z / (maxR * 2) + 0.5);
    });
  });
  const indices = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const a = rows[r][i];
      const b = rows[r][i2];
      const c = rows[r + 1][i];
      const d = rows[r + 1][i2];
      indices.push(a, b, c, b, d, c);
    }
  }
  const bottom = push(0, rings[0].y, 0, 0.5, 0.5);
  for (let i = 0; i < seg; i++) indices.push(bottom, rows[0][(i + 1) % seg], rows[0][i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildWaterCap(ring) {
  const seg = ring.radii.length;
  const maxR = Math.max(...ring.radii, 0.001);
  const positions = [0, ring.y, 0];
  const normals = [0, 1, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = ring.radii[i];
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    positions.push(x, ring.y, z);
    normals.push(0, 1, 0);
    uvs.push(x / (maxR * 2) + 0.5, z / (maxR * 2) + 0.5);
  }
  for (let i = 0; i < seg; i++) indices.push(0, i + 1, (i + 1) % seg + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function placeWater(parent, sourceMesh, bottomY, topY, fallbackRadius) {
  const segments = 72;
  const steps = 4;
  const contour = sourceMesh ? bowlContours(sourceMesh, segments) : null;
  const rings = [];
  for (let s = 0; s <= steps; s++) {
    const y = THREE.MathUtils.lerp(bottomY, topY, s / steps);
    let radii = new Array(segments).fill(fallbackRadius);
    if (contour) {
      const t = THREE.MathUtils.clamp((y - contour.minY) / (contour.maxY - contour.minY), 0, 1);
      radii = contour.bottom.map((b, i) => THREE.MathUtils.lerp(b, contour.top[i], t));
    }
    rings.push({ y, radii });
  }
  const volume = new THREE.Mesh(buildFilledWater(rings), makeFillMaterial());
  volume.name = "agua_volumen";
  volume.renderOrder = 1;
  volume.frustumCulled = false;
  parent.add(volume);
  waterVolume = volume;
  const capRing = { y: topY + 0.004, radii: rings[rings.length - 1].radii };
  waterDisk = new Water(buildWaterCap(capRing), waterOpts());
  waterDisk.name = "agua";
  waterDisk.renderOrder = 2;
  waterDisk.frustumCulled = false;
  waterDisk.material.transparent = true;
  bindOrganicWater(waterDisk);
  parent.add(waterDisk);
  const radii = capRing.radii;
  return radii.reduce((sum, r) => sum + r, 0) / radii.length;
}

function disposeVessel() {
  if (transducer?.parent) transducer.parent.remove(transducer);
  if (waterDisk?.material) waterDisk.material.dispose();
  if (waterVolume?.material) waterVolume.material.dispose();
  waterVolume = null;
  if (!vesselDisk) return;
  scene.remove(vesselDisk);
  vesselDisk.traverse((o) => {
    if (o.geometry && o !== transducer) o.geometry.dispose();
  });
  vesselDisk = null;
  vesselBody = null;
  waterDisk = null;
  cableGroup = null;
  vesselGeos = [];
}

function finishVessel() {
  if (!vesselDisk) return;
  vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);
  buildCables();
  placeTransducer();
  placeCymatic();
  if (projectorGroup) placeProjector();
  applyWaterUniforms();
}

function buildVessel() {
  const token = ++vesselToken;
  disposeVessel();
  params.forma = isRect() ? "rectangular" : "circular";
  const url = params.recipiente === "archivo" ? customObjUrl : MODEL_URL[params.recipiente];
  if (!url) {
    buildProceduralVessel();
    return;
  }
  const use = (root) => {
    if (token !== vesselToken) return;
    buildObjVessel(root);
    finishVessel();
  };
  if (objCache?.userData?.url === url) {
    use(objCache);
    return;
  }
  objLoader.load(
    url,
    (root) => {
      root.userData.url = url;
      objCache = root;
      use(root);
    },
    undefined,
    (err) => console.error(err)
  );
}

function buildProceduralVessel() {
  vesselGeos = [];
  vesselDisk = new THREE.Group();
  vesselDisk.name = "recipiente";
  vesselBody = new THREE.Group();
  vesselBody.name = "cuerpo";
  const rim = getRimMat();
  const h = 0.22;
  const segs = 96;
  const walls = new THREE.Mesh(makeWallGeo(segs, h), rim);
  walls.name = "pared";
  walls.renderOrder = 3;
  const bottom = new THREE.Mesh(makeCapGeo(1, segs), rim);
  bottom.name = "fondo";
  bottom.renderOrder = 3;
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -h / 2;
  vesselBody.add(walls, bottom);
  vesselBody.updateMatrixWorld(true);
  const waterR = placeWater(vesselBody, walls, -h / 2 + 0.004, 0.02, 0.9);
  registerVesselGeo(walls, "wall");
  registerVesselGeo(bottom, "cap");
  if (isRect()) vesselBody.scale.set(params.radio, 1, params.largo);
  else vesselBody.scale.set(params.radio, 1, params.radio);
  vesselDisk.add(vesselBody);
  scene.add(vesselDisk);
  const r = isRect() ? Math.max(params.radio, params.largo) : params.radio;
  vesselMetrics = {
    radius: r,
    bottomY: -h / 2,
    topY: h / 2,
    waterY: 0.02,
    waterRadius: waterR * (isRect() ? Math.min(params.radio, params.largo) : params.radio),
  };
}

function buildObjVessel(root) {
  vesselDisk = new THREE.Group();
  vesselDisk.name = "recipiente";
  vesselBody = new THREE.Group();
  vesselBody.name = "cuerpo";
  const obj = root.clone(true);
  obj.name = "malla";
  const plateMat = getRimMat();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = plateMat;
    o.renderOrder = 3;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    o.geometry?.computeVertexNormals();
  });
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(obj);
  const size0 = box0.getSize(new THREE.Vector3());
  const center = box0.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  const spanXZ = Math.max(size0.x, size0.z, 1e-4);
  const plateFragment = spanXZ < 0.15;
  const fitXZ = (2 * params.radio) / spanXZ;
  const fitY = plateFragment ? 0.012 / Math.max(size0.y, 1e-4) : fitXZ;
  obj.scale.set(fitXZ, fitY, fitXZ);
  obj.updateMatrixWorld(true);
  const box1 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box1.min.y;
  obj.updateMatrixWorld(true);
  vesselBody.add(obj);
  let h = new THREE.Box3().setFromObject(obj).max.y;
  if (plateFragment) {
    const wallH = 0.16;
    const walls = new THREE.Mesh(
      new THREE.CylinderGeometry(params.radio, params.radio * 0.96, wallH, 72, 1, true),
      getRimMat()
    );
    walls.name = "pared";
    walls.renderOrder = 3;
    walls.position.y = wallH / 2;
    walls.frustumCulled = false;
    vesselBody.add(walls);
    h = wallH;
  }
  const waterY = plateFragment ? h * 0.62 : Math.max(0.02, h * 0.72);
  vesselBody.updateMatrixWorld(true);
  const waterR = placeWater(vesselDisk, vesselBody, 0.012, waterY, params.radio * 0.72);
  vesselDisk.add(vesselBody);
  scene.add(vesselDisk);
  vesselMetrics = {
    radius: params.radio,
    bottomY: 0,
    topY: h,
    waterY,
    waterRadius: waterR,
  };
}

function buildCables() {
  if (!vesselDisk) return;
  if (cableGroup) {
    vesselDisk.remove(cableGroup);
    cableGroup.traverse((o) => o.geometry?.dispose());
  }
  cableGroup = new THREE.Group();
  cableGroup.name = "cadenas";
  const rad = Math.max(0.08, vesselMetrics.radius * 0.72);
  const y0 = vesselMetrics.topY * 0.92;
  const top = Math.max(0.25, ROOM.ceil - 0.03 - params.vasoY);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    cableGroup.add(cable(new THREE.Vector3(x, y0, z), new THREE.Vector3(x * 0.15, top, z * 0.15)));
  }
  vesselDisk.add(cableGroup);
}

function createTransducer() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.48, metalness: 0.12 });
  const face = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.32, metalness: 0.28 });
  const ink = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.05 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb01d28, roughness: 0.45, metalness: 0.08 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.018, 40), black);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 40), face);
  cap.position.y = 0.011;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0016, 8, 40), ink);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.0132;
  g.add(body, cap, ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.55;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 22, Math.PI * 1.22), black);
    hook.rotation.x = Math.PI / 2;
    hook.rotation.z = a + Math.PI * 0.15;
    hook.position.set(Math.cos(a) * 0.028, 0, Math.sin(a) * 0.028);
    g.add(hook);
  }
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.014), black);
  terminal.position.set(0, -0.01, 0.052);
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.009), red);
  pin.position.set(0.005, -0.01, 0.061);
  g.add(terminal, pin);
  g.name = "resonador";
  return g;
}

function placeTransducer() {
  if (!transducer || !vesselDisk) return;
  if (transducer.parent !== vesselDisk) vesselDisk.add(transducer);
  const ang = THREE.MathUtils.degToRad(params.resonadorAngulo);
  const R = vesselMetrics.radius;
  if (params.resonadorLugar === "pared") {
    const y = (vesselMetrics.bottomY + vesselMetrics.waterY) * 0.55;
    const rr = R + 0.012;
    transducer.position.set(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
    const inward = new THREE.Vector3(-Math.cos(ang), 0, -Math.sin(ang));
    transducer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward.normalize());
  } else {
    const orbit = THREE.MathUtils.clamp(params.resonadorRadio, 0, 1) * R * 0.78;
    transducer.position.set(Math.cos(ang) * orbit, vesselMetrics.bottomY - 0.02, Math.sin(ang) * orbit);
    transducer.rotation.set(0, ang, 0);
  }
  transducer.scale.setScalar(1.15);
}

function buildTransducer() {
  transducer = createTransducer();
  placeTransducer();
}

function syncCymatic() {
  const u = waterDisk?.userData?.organicUniforms;
  if (u?.uVib) u.uVib.value = params.vibracion * params.patronFuerza;
}

function placeCymatic() {
  if (waterDisk) bindOrganicWater(waterDisk);
  syncCymatic();
}

function makeBeamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(params.sunColor) },
      uGain: { value: 0.16 },
    },
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
        float a = uGain * pow(max(edge, 0.0), 1.2) * (0.15 + vY * 0.85);
        gl_FragColor = vec4(uColor * a * 2.2, a);
      }
    `,
  });
}

function makeProjectorHousing() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.07, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.42, metalness: 0.35 })
  );
  body.name = "cuerpo";
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.03, 28),
    new THREE.MeshStandardMaterial({
      color: 0x9eb0c4,
      emissive: 0xcfe0ff,
      emissiveIntensity: 0.8,
      roughness: 0.18,
      metalness: 0.45,
    })
  );
  lens.name = "lente";
  lens.rotation.x = Math.PI / 2;
  lens.position.y = 0.05;
  group.add(body, lens);
  return group;
}

function buildProjector() {
  projectorGroup = makeProjectorHousing();
  projectorGroup.name = "proyector";
  projectorSpot = new THREE.SpotLight(0xd5e4ff, 30, 9, Math.PI / 7, 0.42, 1.2);
  projectorSpot.name = "luz_proyector";
  projectorSpot.castShadow = true;
  projectorSpot.shadow.mapSize.set(1024, 1024);
  scene.add(projectorSpot);
  scene.add(projectorSpot.target);
  beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 1.1, 1, 32, 1, true), makeBeamMaterial());
  beamMesh.name = "haz_proyector";
  scene.add(projectorGroup);
  scene.add(beamMesh);
}

function buildTopLight() {
  topGroup = makeProjectorHousing();
  topGroup.name = "luz_arriba";
  topLens = topGroup.children[1];
  topSpot = new THREE.SpotLight(params.colorLuzArriba, 0, 8, Math.PI / 8, 0.45, 1);
  topSpot.name = "luz_de_arriba";
  topSpot.castShadow = false;
  scene.add(topSpot);
  scene.add(topSpot.target);
  topBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.7, 1, 24, 1, true), makeBeamMaterial());
  topBeam.name = "haz_luz_arriba";
  scene.add(topGroup);
  scene.add(topBeam);
}

function applyTopLight() {
  if (!topSpot) return;
  const on = params.luzArriba;
  topSpot.color.set(params.colorLuzArriba);
  topSpot.intensity = on ? 36 : 0;
  topGroup.visible = on;
  topBeam.visible = on;
  if (topLens?.material?.emissive) {
    topLens.material.emissive.set(params.colorLuzArriba);
    topLens.material.emissiveIntensity = on ? 1.1 : 0;
  }
  if (!on) return;
  const start = new THREE.Vector3(params.vasoX, ROOM.ceil - 0.16, params.vasoZ);
  const end = new THREE.Vector3(params.vasoX, params.vasoY, params.vasoZ);
  const dir = end.clone().sub(start);
  const h = Math.max(dir.length(), 0.2);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const along = dir.clone().normalize();
  topBeam.geometry.dispose();
  topBeam.geometry = new THREE.CylinderGeometry(0.55, 0.05, h, 24, 1, true);
  topBeam.position.copy(mid);
  topBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  if (topBeam.material.uniforms) {
    topBeam.material.uniforms.uColor.value.set(params.colorLuzArriba);
    topBeam.material.uniforms.uGain.value = 0.1;
  }
  topGroup.position.copy(start);
  topGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  topSpot.position.copy(start);
  topSpot.target.position.copy(end);
  topSpot.distance = h + 1;
}

function buildProjection() {
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  projMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      normalSampler: { value: loadWaterNormals() },
      uVideo: { value: blank },
      uLid: { value: blank },
      uTime: { value: 0 },
      uHasVideo: { value: 0 },
      uHasLid: { value: 0 },
      uVideoFade: { value: 1 },
      uFadeWithEstado: { value: 0 },
      uCircle: { value: 0 },
      uMaskR: { value: 0.92 },
      uDistortion: { value: params.distortion },
      uVibracion: { value: 0 },
      uFrio: { value: 0 },
      uLight: { value: params.luz },
      uSize: { value: params.waveSize },
      uVideoRadius: { value: 1.65 },
      uVesselCenter: { value: new THREE.Vector2(params.vasoX, params.vasoZ) },
      uVesselR: { value: params.radio },
      uWaterY: { value: params.vasoY },
      uLampY: { value: 0.1 },
      uGobo: { value: 0 },
      uShadowCenter: { value: new THREE.Vector3() },
      uShadowN: { value: new THREE.Vector3(0, 0, 1) },
      uShadowR: { value: new THREE.Vector3(1, 0, 0) },
      uShadowU: { value: new THREE.Vector3(0, 1, 0) },
      uShadowRadius: { value: 0.6 },
      uStretch: { value: 1 },
      uPatronFreq: { value: params.patronFreq },
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
      uniform sampler2D normalSampler, uVideo, uLid;
      uniform float uTime, uHasVideo, uHasLid, uCircle, uMaskR, uVideoFade, uFadeWithEstado;
      uniform float uDistortion, uVibracion, uFrio, uLight, uSize, uVideoRadius;
      uniform float uVesselR, uWaterY, uLampY, uGobo, uShadowRadius, uStretch, uPatronFreq;
      uniform vec2 uVesselCenter;
      uniform vec3 uShadowCenter, uShadowN, uShadowR, uShadowU;

      vec4 getNoise(vec2 uv) {
        float t = uTime * (0.15 + uVibracion * 1.4);
        vec2 uv0 = (uv / 103.0) + vec2(t / 17.0, t / 29.0);
        vec2 uv1 = uv / 107.0 - vec2(t / -19.0, t / 31.0);
        vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(t / 101.0, t / 97.0);
        vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(t / 109.0, t / -113.0);
        vec4 noise = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1)
          + texture2D(normalSampler, uv2) + texture2D(normalSampler, uv3);
        return noise * 0.5 - 1.0;
      }

      vec3 waterNormal(vec2 worldXZ) {
        vec4 noise = getNoise(worldXZ * max(uSize * 0.45, 0.8));
        return normalize(noise.xzy * vec3(1.35, 1.0, 1.35));
      }

      float lidMetal(vec2 g) {
        vec2 uv = g * 0.5 + 0.5;
        if (uHasLid > 0.5) return texture2D(uLid, uv).r;
        float r = length(g);
        float a = atan(g.y, g.x);
        float rings = smoothstep(0.12, 0.0, abs(fract(r * 6.5) - 0.45));
        float holes = 0.5 + 0.5 * sin(a * 12.0 + r * 18.0);
        return 1.0 - rings * smoothstep(0.35, 0.7, holes);
      }

      vec3 faux(vec2 vid) {
        float b = sin(vid.x * 14.0 + uTime * 0.6) * sin(vid.y * 9.0 - uTime * 0.45);
        vec3 col = vec3(0.05, 0.08, 0.16);
        col += vec3(0.12, 0.28, 0.75) * (0.5 + 0.5 * b);
        col += vec3(0.35, 0.5, 1.0) * smoothstep(0.45, 0.0, length(vid - vec2(0.38, 0.58)));
        col += vec3(0.15, 0.35, 0.9) * smoothstep(0.5, 0.05, length(vid - vec2(0.68, 0.32)));
        return col;
      }

      void main() {
        vec2 fromVessel = vWorldPos.xz - uVesselCenter;
        float onCeil = smoothstep(3.45, 3.85, vWorldPos.y);
        vec2 cuv = fromVessel / max(uVideoRadius, 0.2);
        vec3 nrm = waterNormal(uVesselCenter + fromVessel * 0.42);
        float vib = clamp(uVibracion, 0.0, 1.0);
        float warp = mix(0.02, 0.2, vib);
        vec2 bend = nrm.xz * warp;
        float vesselSpan = uVesselR * (4.02 - uLampY) / max(0.35, uWaterY - uLampY);
        float rim = smoothstep(0.18, 0.0, abs(length(fromVessel) - vesselSpan));
        bend += normalize(cuv + vec2(1e-4)) * rim * (0.03 + vib * 0.12);
        vec2 vid = cuv * 0.5 + 0.5 + bend;
        float box = smoothstep(1.05, 0.72, max(abs(cuv.x), abs(cuv.y)));
        float circ = smoothstep(uMaskR + 0.07, uMaskR - 0.02, length(vid - 0.5) * 2.0);
        float edge = mix(box, circ, step(0.5, uCircle));
        vec2 vidClamped = clamp(vid, 0.0, 1.0);
        vec3 src = mix(faux(vidClamped), texture2D(uVideo, vidClamped).rgb, uHasVideo);
        float streak = sin(cuv.y * 22.0 + nrm.x * 8.0 + uTime * vib * 2.2);
        src += vec3(0.08, 0.16, 0.32) * (0.5 + 0.5 * streak) * vib * 0.55;
        src += vec3(0.12, 0.2, 0.4) * rim * vib;
        src *= vec3(0.62, 0.78, 1.22);
        src = mix(src, src * vec3(0.32, 0.52, 1.55) + vec3(0.02, 0.04, 0.16), uFrio);
        float vidFade = mix(1.0, clamp(uVideoFade, 0.0, 1.0), step(0.5, uFadeWithEstado));
        vec3 col = src * edge * onCeil * vidFade * (0.45 + uLight * 0.9);

        if (uGobo > 0.5) {
          float planeD = abs(dot(vWorldPos - uShadowCenter, uShadowN));
          if (planeD < 0.14) {
            vec2 g = vec2(
              dot(vWorldPos - uShadowCenter, uShadowR),
              dot(vWorldPos - uShadowCenter, uShadowU)
            ) / max(uShadowRadius, 0.05);
            float stretch = max(uStretch, 1.0);
            g.y /= max(0.28, 1.0 + (stretch - 1.0) * g.y * 1.15);
            g.x /= mix(1.0, 0.92, stretch - 1.0);
            g += bend * 0.04;
            float gd = length(g);
            if (gd < 1.12) {
              float metal = lidMetal(g);
              float hole = 1.0 - smoothstep(0.16, 0.72, metal);
              float disc = pow(1.0 - smoothstep(0.5, 1.06, gd), 1.2);
              float ghost = 0.16 + uFrio * 0.2;
              vec3 body = vec3(0.03, 0.07, 0.16) * disc * ghost;
              vec3 holes = vec3(0.16, 0.42, 0.78) * hole * disc * ghost;
              holes *= 0.4 + uLight * 0.3;
              col += body + holes;
            }
          }
        }

        if (max(col.r, max(col.g, col.b)) < 0.012) discard;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const addPlane = (geo, x, y, z, rotY = 0, rotX = 0) => {
    const mesh = new THREE.Mesh(geo, projMat);
    mesh.name = "proyeccion";
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, 0);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    scene.add(mesh);
    projMeshes.push(mesh);
  };
  const roomW = ROOM.x * 2 - 0.08;
  const roomD = ROOM.zFront - ROOM.zBack - 0.08;
  const roomH = ROOM.ceil - 0.06;
  const yMid = ROOM.ceil / 2;
  addPlane(new THREE.PlaneGeometry(roomW, roomD), 0, ROOM.ceil - 0.02, 0, 0, Math.PI / 2);
  addPlane(new THREE.PlaneGeometry(roomW, roomH), 0, yMid, ROOM.zBack + 0.03);
  addPlane(new THREE.PlaneGeometry(roomD, roomH), -ROOM.x + 0.03, yMid, 0, Math.PI / 2);
}

function roomBeamHit(origin, dir) {
  const planes = [
    { n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(0, ROOM.floor, 0) },
    { n: new THREE.Vector3(0, -1, 0), p: new THREE.Vector3(0, ROOM.ceil - 0.03, 0) },
    { n: new THREE.Vector3(1, 0, 0), p: new THREE.Vector3(-ROOM.x + 0.03, 0, 0) },
    { n: new THREE.Vector3(0, 0, 1), p: new THREE.Vector3(0, 0, ROOM.zBack + 0.03) },
  ];
  let bestT = 16;
  let bestP = null;
  let bestN = null;
  for (const { n, p } of planes) {
    const denom = dir.dot(n);
    if (Math.abs(denom) < 1e-4) continue;
    const t = p.clone().sub(origin).dot(n) / denom;
    if (t < 0.05 || t >= bestT) continue;
    const hit = origin.clone().addScaledVector(dir, t);
    if (Math.abs(hit.x) > ROOM.x + 0.05 || hit.y < -0.05 || hit.y > ROOM.ceil + 0.02 || hit.z < ROOM.zBack - 0.05 || hit.z > ROOM.zFront + 0.05) continue;
    bestT = t;
    bestP = hit;
    bestN = n.clone();
  }
  if (!bestP) return null;
  return { point: bestP, normal: bestN };
}

function updateShadow() {
  if (!projMat || !lidGroup) return;
  lidGroup.updateWorldMatrix(true, false);
  const center = new THREE.Vector3().setFromMatrixPosition(lidGroup.matrixWorld);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(lidGroup.quaternion).normalize();
  const lamp = lampPos();
  const incident = center.clone().sub(lamp);
  if (incident.lengthSq() < 1e-6) incident.set(0, 1, 0);
  incident.normalize();
  let dir;
  if (!params.tapaAngulada) {
    dir = incident;
  } else {
    const n = normal.clone();
    if (n.dot(incident) > 0) n.negate();
    dir = incident.clone().reflect(n);
    if (dir.y < -0.02) {
      const horiz = _v1.set(n.x, 0, n.z);
      if (horiz.lengthSq() < 1e-6) horiz.set(0, 0, -1);
      horiz.normalize();
      const lift = 0.05 + THREE.MathUtils.clamp(params.tapaAngulo, 0, 150) / 500;
      dir.set(horiz.x, lift, horiz.z).normalize();
    }
  }
  const hit = roomBeamHit(center.clone().addScaledVector(dir, 0.06), dir);
  const u = projMat.uniforms;
  if (!hit) {
    u.uGobo.value = 0;
    return;
  }
  const n = hit.normal.clone().normalize();
  const ref = Math.abs(n.y) > 0.85 ? _v1.set(1, 0, 0) : _v1.set(0, 1, 0);
  const right = _v2.crossVectors(ref, n).normalize();
  const up = _v3.crossVectors(n, right).normalize();
  const ang = params.tapaAngulada ? THREE.MathUtils.degToRad(params.tapaAngulo) : 0;
  u.uShadowCenter.value.copy(hit.point).addScaledVector(n, 0.01);
  u.uShadowN.value.copy(n);
  u.uShadowR.value.copy(right);
  u.uShadowU.value.copy(up);
  u.uShadowRadius.value = Math.max(0.08, params.tapaSombra * 0.5);
  u.uStretch.value = 1 + Math.sin(Math.abs(ang)) * 1.65;
  u.uGobo.value = 1;
  u.uVesselCenter.value.set(params.vasoX, params.vasoZ);
  u.uVesselR.value = vesselMetrics.radius;
  u.uWaterY.value = params.vasoY + vesselMetrics.waterY;
  u.uLampY.value = lamp.y;
  u.uCircle.value = params.mascaraCircular ? 1 : 0;
  u.uMaskR.value = params.radioMascara;
  u.uPatronFreq.value = params.patronFreq;
}

function placeProjector() {
  if (!projectorGroup || !beamMesh || !projectorSpot) return;
  const start = lampPos();
  const end = new THREE.Vector3(params.vasoX, ROOM.ceil - 0.04, params.vasoZ);
  const dir = end.clone().sub(start);
  const h = Math.max(dir.length(), 0.2);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const along = dir.clone().normalize();
  const foot = Math.max(params.radioReflejo, 0.4);
  beamMesh.geometry.dispose();
  beamMesh.geometry = new THREE.CylinderGeometry(foot, 0.05, h, 32, 1, true);
  beamMesh.position.copy(mid);
  beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  if (beamMesh.material.uniforms?.uGain) {
    beamMesh.material.uniforms.uGain.value = 0.05 + params.luz * 0.12;
  }
  projectorGroup.position.copy(start);
  projectorGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  projectorSpot.position.copy(start);
  projectorSpot.target.position.copy(end);
  projectorSpot.distance = h + 0.6;
  projectorSpot.angle = Math.atan(foot / Math.max(0.5, h)) * 1.15;
  projectorSpot.intensity = 10 + params.luz * 48;
  applyBeamColor();
  if (projMat) {
    projMat.uniforms.uVideoRadius.value = Math.max(0.8, params.radioReflejo + 0.45);
    updateShadow();
  }
}

function drawFallbackLid(ctx) {
  const s = ctx.canvas.width;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  for (let ring = 1; ring <= 5; ring++) {
    const rad = (ring / 6) * s * 0.42;
    const count = 6 + ring * 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(s / 2 + Math.cos(a) * rad, s / 2 + Math.sin(a) * rad, s * 0.018 + ring, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

async function loadLidTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  drawFallbackLid(ctx);
  try {
    const res = await fetch("./alcantarilla-jean-jaures.svg");
    let txt = await res.text();
    txt = txt.replaceAll("<use ", '<use fill-rule="evenodd" ');
    const url = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, 1024, 1024);
        ctx.drawImage(img, 0, 0, 1024, 1024);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn(err);
    drawFallbackLid(ctx);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  lidTexture = tex;
  if (lidMat) {
    lidMat.alphaMap = tex;
    lidMat.map = tex;
    lidMat.needsUpdate = true;
  }
  if (projMat) {
    projMat.uniforms.uLid.value = tex;
    projMat.uniforms.uHasLid.value = 1;
  }
}

function buildLid() {
  lidGroup = new THREE.Group();
  lidGroup.name = "tapa";
  lidMat = new THREE.MeshPhysicalMaterial({
    color: 0xb87333,
    metalness: 1,
    roughness: 0.28,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
  });
  lidPlate = new THREE.Mesh(new THREE.CircleGeometry(1, 96), lidMat);
  lidPlate.name = "placa";
  lidPlate.rotation.x = -Math.PI / 2;
  lidPlate.scale.setScalar(params.radio);
  lidGroup.add(lidPlate);
  scene.add(lidGroup);
}

function placeLid() {
  if (!lidGroup) return;
  if (lidPlate) lidPlate.scale.setScalar(params.radio);
  lidGroup.position.set(params.tapaX, params.tapaY, params.tapaZ);
  lidGroup.rotation.order = "YXZ";
  lidGroup.rotation.x = params.tapaAngulada ? THREE.MathUtils.degToRad(params.tapaAngulo) : 0;
  lidGroup.rotation.y = THREE.MathUtils.degToRad(params.tapaRotY);
  lidGroup.rotation.z = 0;
  lidGroup.updateMatrixWorld(true);
  const old = lidGroup.getObjectByName("cadenas");
  if (old) {
    lidGroup.remove(old);
    old.traverse((o) => o.geometry?.dispose());
  }
  const chains = new THREE.Group();
  chains.name = "cadenas";
  const chainR = Math.max(0.04, params.radio * 0.86);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rim = new THREE.Vector3(Math.cos(a) * chainR, 0, Math.sin(a) * chainR);
    const anchor = new THREE.Vector3(
      params.tapaX + Math.cos(a) * 0.03,
      ROOM.ceil - 0.02,
      params.tapaZ + Math.sin(a) * 0.03
    );
    lidGroup.worldToLocal(anchor);
    chains.add(cable(rim, anchor));
  }
  lidGroup.add(chains);
  updateShadow();
}

function createSubwoofer() {
  const g = new THREE.Group();
  const W = 0.201;
  const H = 0.383;
  const D = 0.402;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55, metalness: 0.22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.92, D), bodyMat);
  body.name = "cuerpo";
  body.position.y = 0.012 + (H * 0.92) / 2;
  body.castShadow = true;
  const baffle = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.92, H * 0.78, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.5, metalness: 0.2 })
  );
  baffle.name = "bafle";
  baffle.position.set(0, H * 0.5, D / 2);
  const surround = new THREE.Mesh(
    new THREE.TorusGeometry(0.072, 0.006, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45, metalness: 0.15 })
  );
  surround.name = "aro";
  surround.position.set(0, H * 0.5, D / 2 + 0.01);
  const cone = new THREE.Mesh(
    new THREE.CircleGeometry(0.064, 36),
    new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.4, metalness: 0.1 })
  );
  cone.name = "cono";
  cone.position.set(0, H * 0.5, D / 2 + 0.014);
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.4 })
  );
  cap.name = "boton";
  cap.position.set(0, H * 0.5, D / 2 + 0.02);
  const logo = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.008, 0.004),
    new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.3, metalness: 0.8 })
  );
  logo.name = "logo";
  logo.position.set(0, H * 0.16, D / 2 + 0.008);
  const footMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
  g.add(body, baffle, surround, cone, cap, logo);
  for (const [x, z] of [[-0.07, -0.12], [0.07, -0.12], [-0.07, 0.12], [0.07, 0.12]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.012, 10), footMat);
    foot.name = "pata";
    foot.position.set(x, 0.006, z);
    g.add(foot);
  }
  return { group: g, cone };
}

function createSpeaker() {
  const g = new THREE.Group();
  const W = 0.14;
  const H = 0.24;
  const D = 0.16;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.62, metalness: 0.18 })
  );
  body.name = "cuerpo";
  body.position.y = 0.01 + H / 2;
  const baffle = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.86, H * 0.78, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5, metalness: 0.12 })
  );
  baffle.name = "bafle";
  baffle.position.set(0, H * 0.52, D / 2);
  const woofer = new THREE.Mesh(
    new THREE.CircleGeometry(0.042, 28),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45, metalness: 0.08 })
  );
  woofer.name = "cono";
  woofer.position.set(0, H * 0.42, D / 2 + 0.01);
  const tweeter = new THREE.Mesh(
    new THREE.CircleGeometry(0.014, 20),
    new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.3, metalness: 0.55 })
  );
  tweeter.name = "tweeter";
  tweeter.position.set(0, H * 0.72, D / 2 + 0.012);
  g.add(body, baffle, woofer, tweeter);
  return { group: g, cone: woofer };
}

function buildAudioGear() {
  const sub = createSubwoofer();
  sub.group.name = "subwoofer";
  const left = createSpeaker();
  left.group.name = "altavoz_1";
  const right = createSpeaker();
  right.group.name = "altavoz_2";
  audioGear = [sub, left, right];
  audioGear.forEach((item) => scene.add(item.group));
  placeAudioGear();
}

function placeAudioGear() {
  const spots = [
    [params.subX, params.subZ, params.subRot],
    [params.spk1X, params.spk1Z, params.spk1Rot],
    [params.spk2X, params.spk2Z, params.spk2Rot],
  ];
  audioGear.forEach((item, i) => {
    const [x, z, rot] = spots[i];
    item.group.visible = params.audioVisible;
    item.group.position.set(x, 0, z);
    item.group.rotation.y = THREE.MathUtils.degToRad(rot);
  });
  if (audio?.panners && audio.ctx) {
    const t = audio.ctx.currentTime;
    audioGear.forEach((item, i) => {
      const p = audio.panners[i];
      if (!p?.positionX) return;
      p.positionX.setValueAtTime(item.group.position.x, t);
      p.positionY.setValueAtTime(0.2, t);
      p.positionZ.setValueAtTime(item.group.position.z, t);
    });
  }
}

function buildCriaturas() {
  criaturaMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      normalSampler: { value: loadWaterNormals() },
      uTime: { value: 0 },
      uAmount: { value: 0.3 },
      uSize: { value: params.waveSize },
      uVib: { value: 0 },
      uColor: { value: new THREE.Color("#8eb6ff") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform sampler2D normalSampler;
      uniform float uTime, uAmount, uSize, uVib;
      uniform vec3 uColor;
      ${ORGANIC_GLSL}
      vec4 waterNoise(vec2 uv) {
        vec2 uv0 = (uv / 103.0) + vec2(uTime / 17.0, uTime / 29.0);
        vec2 uv1 = uv / 107.0 - vec2(uTime / -19.0, uTime / 31.0);
        vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(uTime / 101.0, uTime / 97.0);
        vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(uTime / 109.0, uTime / -113.0);
        vec4 noise = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1)
          + texture2D(normalSampler, uv2) + texture2D(normalSampler, uv3);
        return noise * 0.5 - 1.0;
      }
      vec3 waterN(vec2 p) {
        vec4 n = waterNoise(p * max(uSize, 0.2));
        float org = organicField(p * 1.6, uTime * 0.35);
        vec2 og = vec2(
          organicField((p + vec2(0.03, 0.0)) * 1.6, uTime * 0.35) - org,
          organicField((p + vec2(0.0, 0.03)) * 1.6, uTime * 0.35) - org
        );
        return normalize(n.xzy * vec3(1.5, 1.0, 1.5) + vec3(og.x, 0.0, og.y) * (0.4 + uVib * 2.6));
      }
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float disc = pow(1.0 - smoothstep(0.2, 1.0, length(q)), 1.15);
        if (disc < 0.01 || uAmount < 0.01) discard;
        vec2 p = vWorld.xz;
        float eps = 0.035;
        vec3 n0 = waterN(p);
        vec3 nx = waterN(p + vec2(eps, 0.0));
        vec3 nz = waterN(p + vec2(0.0, eps));
        float jac = abs((nx.x - n0.x) * (nz.z - n0.z) - (nx.z - n0.z) * (nz.x - n0.x));
        float cau = pow(clamp(0.22 / max(jac, 0.045), 0.0, 4.0), 1.25);
        float crest = pow(max(n0.y, 0.0), 3.0);
        float v = (cau * 0.72 + crest * 0.55) * disc * uAmount;
        gl_FragColor = vec4(uColor * v, v);
      }
    `,
  });
  criaturaMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 72), criaturaMat);
  criaturaMesh.name = "criaturas";
  criaturaMesh.rotation.x = -Math.PI / 2;
  criaturaMesh.position.y = 0.03;
  criaturaMesh.renderOrder = 1;
  scene.add(criaturaMesh);
}

function setupVideo() {
  video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.style.display = "none";
  document.body.appendChild(video);
  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  const markReady = () => {
    if (!projMat || video.readyState < 2) return;
    projMat.uniforms.uVideo.value = videoTexture;
    projMat.uniforms.uHasVideo.value = 1;
  };
  video.addEventListener("loadeddata", markReady);
  video.addEventListener("playing", markReady);
  video.addEventListener("error", () => {
    const folder = gui?.folders?.find((f) => f._title?.startsWith("video"));
    if (folder) folder.title("video · no cargó");
  });
  video.src = VIDEO_URL;
  if (params.videoPlay) video.play().catch(() => {});
}

function seekVideo(u) {
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  video.currentTime = THREE.MathUtils.clamp(u, 0, 0.999) * video.duration;
}

function applyRadius() {
  if (lidPlate) lidPlate.scale.setScalar(params.radio);
  placeLid();
  if (!isProcedural()) {
    buildVessel();
    return;
  }
  if (!vesselBody) return;
  if (isRect()) vesselBody.scale.set(params.radio, 1, params.largo);
  else vesselBody.scale.set(params.radio, 1, params.radio);
  const r = isRect() ? Math.max(params.radio, params.largo) : params.radio;
  vesselMetrics.radius = r;
  vesselMetrics.waterRadius = (isRect() ? Math.min(params.radio, params.largo) : params.radio) * 0.9;
  applyVesselDeform(clock?.elapsedTime ?? 0);
  buildCables();
  placeTransducer();
  placeCymatic();
  placeProjector();
  applyWaterUniforms();
}

function applyVesselPose() {
  if (vesselDisk) vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);
  buildCables();
  placeProjector();
  applyTopLight();
}

function snapshotState() {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    params: { ...params },
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
    },
  };
}

function exportName(obj) {
  const parts = [];
  let node = obj;
  while (node && node !== scene) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join("_").replace(/\s+/g, "_") || "objeto";
}

function exportStandIn(mesh) {
  const name = exportName(mesh);
  let color = "#c5ced6";
  let opacity = 1;
  let metalness = 0.08;
  let roughness = 0.55;
  let emissive = "#000000";
  let emissiveIntensity = 0;
  if (name.includes("agua")) {
    color = params.colorAgua;
    opacity = params.alphaAgua;
    roughness = 0.06;
    metalness = 0.04;
  } else if (name.includes("criaturas")) {
    color = params.sunColor;
    emissive = params.sunColor;
    emissiveIntensity = 0.8;
    opacity = 0.55;
  } else if (name.includes("haz_luz_arriba")) {
    color = params.colorLuzArriba;
    emissive = params.colorLuzArriba;
    emissiveIntensity = 0.7;
    opacity = 0.22;
  } else if (name.includes("haz")) {
    color = params.sunColor;
    emissive = params.sunColor;
    emissiveIntensity = 0.7;
    opacity = 0.22;
  }
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    transparent: opacity < 0.999,
    opacity,
    metalness,
    roughness,
  });
}

function aimLightAlongTarget(light) {
  if (!light?.target) return null;
  const prev = light.quaternion.clone();
  const from = light.getWorldPosition(new THREE.Vector3());
  const to = light.target.getWorldPosition(new THREE.Vector3());
  const dir = to.sub(from);
  if (dir.lengthSq() < 1e-8) return null;
  light.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.normalize());
  light.updateMatrixWorld(true);
  return prev;
}

function exportSceneBlender() {
  scene.updateMatrixWorld(true);
  const hidden = [];
  const swaps = [];
  const aims = [];
  projMeshes.forEach((mesh) => {
    hidden.push([mesh, mesh.visible]);
    mesh.visible = false;
  });
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material?.isShaderMaterial) return;
    swaps.push([obj, obj.material]);
    obj.material = exportStandIn(obj);
  });
  [projectorSpot, topSpot, fillLight].forEach((light) => {
    if (!light) return;
    const prev = aimLightAlongTarget(light);
    if (prev) aims.push([light, prev]);
  });
  const exporter = new GLTFExporter();
  const restore = () => {
    swaps.forEach(([obj, material]) => {
      obj.material.dispose?.();
      obj.material = material;
    });
    hidden.forEach(([mesh, visible]) => {
      mesh.visible = visible;
    });
    aims.forEach(([light, prev]) => {
      light.quaternion.copy(prev);
    });
  };
  exporter.parse(
    scene,
    (glb) => {
      restore();
      const blob = new Blob([glb], { type: "model/gltf-binary" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "rumor-sala.glb";
      a.click();
      URL.revokeObjectURL(a.href);
    },
    (err) => {
      restore();
      console.error(err);
    },
    { binary: true, onlyVisible: true, embedImages: true }
  );
}

function rumorFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `rumor-${stamp}.json`;
}

function saveState() {
  const blob = new Blob([JSON.stringify(snapshotState(), null, 2)], { type: "application/json" });
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
    if (key === "estado") return;
    if (next[key] !== undefined) params[key] = next[key];
  });
  if (next.recipiente === undefined && next.forma) {
    params.recipiente = next.forma === "rectangular" ? "rectangular" : "cilindro";
  }
  params.estado = 0;
  applyEstadoMix();
  buildVessel();
  finishVessel();
  placeLid();
  placeAudioGear();
  applyTopLight();
  applyRoomSize();
  applyWaterUniforms();
  if (params.audio) startAudio();
  else stopAudio();
  if (data?.camera?.position) camera.position.fromArray(data.camera.position);
  if (data?.camera?.target) controls.target.fromArray(data.camera.target);
  const fader = document.getElementById("estado-range");
  if (fader) fader.value = String(params.estado);
  gui?.controllersRecursive?.().forEach((c) => c.updateDisplay());
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

function loadObjDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".obj,model/obj";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (customObjUrl) URL.revokeObjectURL(customObjUrl);
    customObjUrl = URL.createObjectURL(file);
    objCache = null;
    params.recipiente = "archivo";
    buildVessel();
    finishVessel();
    gui?.controllersRecursive?.().forEach((c) => c.updateDisplay());
  };
  input.click();
}

function loadVideoDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*,.mov,.mp4";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file || !video) return;
    video.src = URL.createObjectURL(file);
    video.loop = true;
    video.muted = true;
    if (params.videoPlay) video.play().catch(() => {});
  };
  input.click();
}

function buildGui() {
  if (PRESENTATION) return;
  gui = new GUI({ title: "sala" });
  const estado = gui.addFolder("estado");
  estado.add({ guardar: saveState }, "guardar").name("guardar JSON");
  estado.add({ exportar: exportSceneBlender }, "exportar").name("exportar Blender");
  estado.add({ cargar: loadStateDialog }, "cargar").name("cargar JSON");

  const espacio = gui.addFolder("espacio");
  espacio.add(params, "salaAncho", 4, 24, 0.1).name("ancho m").onChange(applyRoomSize);
  espacio.add(params, "salaLargo", 4, 24, 0.1).name("largo m").onChange(applyRoomSize);
  espacio.add(params, "salaAlto", 2.4, 8, 0.05).name("alto m").onChange(applyRoomSize);

  const rec = gui.addFolder("recipiente");
  rec.add(params, "recipiente", {
    Cilindro: "cilindro",
    Rectangular: "rectangular",
    Recipiente: "recipiente",
    "Círculo": "export-circle",
    "Alcantarilla extruida": "alcantarilla-extruida",
    Archivo: "archivo",
  }).name("modelo").onChange(() => {
    buildVessel();
    finishVessel();
  });
  rec.add({ cargar: loadObjDialog }, "cargar").name("cargar OBJ");
  rec.add(params, "radio", 0.08, 0.8, 0.01).name("radio (tapa igual)").onChange(applyRadius);
  rec.add(params, "largo", 0.2, 1.2, 0.01).name("largo (rect)").onChange(applyRadius);
  rec.add(params, "vasoX", -2.2, 2.2, 0.01).name("x").onChange(applyVesselPose);
  rec.add(params, "vasoY", 0.4, 3.7, 0.01).name("altura").onChange(applyVesselPose);
  rec.add(params, "vasoZ", -2.4, 2.4, 0.01).name("z").onChange(applyVesselPose);
  const borde = rec.addFolder("borde");
  borde.add(params, "vasoAmp", 0, 0.55, 0.01).name("perlin amp").onChange(() => applyVesselDeform());
  borde.add(params, "vasoFreq", 0.2, 8, 0.05).name("perlin freq").onChange(() => applyVesselDeform());
  borde.add(params, "vasoOctaves", 1, 6, 1).name("octavas").onChange(() => applyVesselDeform());
  borde.add(params, "vasoSpeed", 0, 1.5, 0.01).name("perlin vel");
  borde.add(params, "vasoSeed", 0, 99, 1).name("semilla").onChange(() => applyVesselDeform());

  const res = gui.addFolder("resonador");
  res.add(params, "resonadorLugar", { Fondo: "fondo", Pared: "pared" }).name("lugar").onChange(placeTransducer);
  res.add(params, "resonadorAngulo", 0, 360, 1).name("ángulo Y").onChange(placeTransducer);
  res.add(params, "resonadorRadio", 0, 1, 0.01).name("órbita en el fondo").onChange(placeTransducer);

  const agua = gui.addFolder("agua");
  agua.addColor(params, "colorAgua").name("color").onChange(applyWaterUniforms);
  agua.add(params, "distortion", 0, 8, 0.05).name("distorsión").onChange(applyWaterUniforms);
  agua.add(params, "waveSize", 0.1, 12, 0.05).name("tamaño ola").onChange(applyWaterUniforms);
  agua.add(params, "waveSpeed", 0, 2, 0.01).name("velocidad");
  agua.add(params, "alphaAgua", 0.15, 1, 0.01).name("opacidad").onChange(applyWaterUniforms);
  agua.add(params, "patronFreq", 20, 140, 1).name("frecuencia patrón").onChange(syncCymatic);
  agua.add(params, "patronFuerza", 0, 2, 0.01).name("fuerza patrón").onChange(syncCymatic);
  agua.add(params, "criaturasRadio", 0.15, 1.2, 0.01).name("radio criaturas");

  const vid = gui.addFolder("video");
  vid.add(params, "videoPorInmersion").name("opacidad con inmersión");
  vid.add(params, "mascaraCircular").name("máscara circular").onChange(updateShadow);
  vid.add(params, "radioMascara", 0.3, 1.2, 0.01).name("radio máscara").onChange(updateShadow);
  videoCtrl = vid.add(params, "videoPos", 0, 1, 0.001).name("tiempo").onChange((v) => {
    seekVideo(v);
  });
  videoCtrl.domElement.addEventListener("pointerdown", () => {
    videoScrub = true;
  });
  addEventListener("pointerup", () => {
    if (!videoScrub) return;
    videoScrub = false;
    seekVideo(params.videoPos);
  });
  vid.add(params, "videoPlay").name("reproducir").onChange((on) => {
    if (!video) return;
    if (on) video.play().catch(() => {});
    else video.pause();
  });
  vid.add({ cargar: loadVideoDialog }, "cargar").name("cargar video");

  const lamp = gui.addFolder("proyector");
  lamp.add(params, "lamparaX", -4, 4, 0.01).name("x").onChange(placeProjector);
  lamp.add(params, "lamparaZ", -4, 4, 0.01).name("z").onChange(placeProjector);
  lamp.add(params, "lamparaY", -0.05, 1.2, 0.01).name("altura").onChange(placeProjector);
  lamp.add(params, "radioReflejo", 0.3, 2.6, 0.01).name("abertura").onChange(placeProjector);
  lamp.add(params, "luz", 0.05, 1.6, 0.01).name("intensidad").onChange(() => {
    placeProjector();
    applyRoomTemp();
  });

  const top = gui.addFolder("luz de arriba");
  top.add(params, "luzArriba").name("encendida").onChange(applyTopLight);
  top.addColor(params, "colorLuzArriba").name("color").onChange(applyTopLight);

  const tapa = gui.addFolder("soterradín");
  tapa.add(params, "tapaAngulada").name("angulada").onChange(placeLid);
  tapa.add(params, "tapaAngulo", 15, 150, 1).name("inclinación").onChange(placeLid);
  tapa.add(params, "tapaRotY", -180, 180, 1).name("girar").onChange(placeLid);
  tapa.add(params, "tapaY", 0.4, 3.7, 0.01).name("altura").onChange(placeLid);
  tapa.add(params, "tapaX", -3, 3, 0.01).name("x").onChange(placeLid);
  tapa.add(params, "tapaZ", -3, 3, 0.01).name("z").onChange(placeLid);
  tapa.add(params, "tapaSombra", 0.25, 2.4, 0.01).name("tamaño sombra").onChange(updateShadow);

  const sub = gui.addFolder("altavoces");
  sub.add(params, "audioVisible").name("visibles").onChange(placeAudioGear);
  sub.add(params, "subX", -4, 4, 0.01).name("sub x").onChange(placeAudioGear);
  sub.add(params, "subZ", -3, 3.5, 0.01).name("sub z").onChange(placeAudioGear);
  sub.add(params, "subRot", -180, 180, 1).name("sub rotación").onChange(placeAudioGear);
  sub.add(params, "spk1X", -4, 4, 0.01).name("altavoz 1 x").onChange(placeAudioGear);
  sub.add(params, "spk1Z", -3, 3.5, 0.01).name("altavoz 1 z").onChange(placeAudioGear);
  sub.add(params, "spk1Rot", -180, 180, 1).name("altavoz 1 rotación").onChange(placeAudioGear);
  sub.add(params, "spk2X", -4, 4, 0.01).name("altavoz 2 x").onChange(placeAudioGear);
  sub.add(params, "spk2Z", -3, 3.5, 0.01).name("altavoz 2 z").onChange(placeAudioGear);
  sub.add(params, "spk2Rot", -180, 180, 1).name("altavoz 2 rotación").onChange(placeAudioGear);

  gui.foldersRecursive().forEach((folder) => folder.close());
}

let audio = null;

function unlockAudio() {
  if (audio?.ctx?.state === "suspended") audio.ctx.resume();
  ensureFieldSound();
  if (fieldHowl && !fieldHowl.playing() && fieldVol > 0.002) fieldHowl.play();
}

function startAudio() {
  if (audio) {
    audio.ctx.resume();
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const gains = [];
  const oscs = [];
  const panners = [];
  const spots = [
    [params.subX, 0.2, params.subZ],
    [params.spk1X, 0.2, params.spk1Z],
    [params.spk2X, 0.2, params.spk2Z],
  ];
  spots.forEach(([x, y, z], i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = params.frecuencia * (i === 0 ? 1 : 0.5);
    const g = ctx.createGain();
    g.gain.value = 0.04;
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1.2;
    p.positionX?.setValueAtTime(x, ctx.currentTime);
    p.positionY?.setValueAtTime(y, ctx.currentTime);
    p.positionZ?.setValueAtTime(z, ctx.currentTime);
    osc.connect(g);
    g.connect(p);
    p.connect(ctx.destination);
    osc.start();
    oscs.push(osc);
    gains.push(g);
    panners.push(p);
  });
  audio = { ctx, oscs, gains, panners };
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
    const f = (i === 0 ? params.frecuencia : params.frecuencia * 0.5) * (1 + params.vibracion * 0.04);
    osc.frequency.setTargetAtTime(f, t, 0.08);
  });
  if (audio.ctx.listener.positionX) {
    audio.ctx.listener.positionX.setValueAtTime(camera.position.x, t);
    audio.ctx.listener.positionY.setValueAtTime(camera.position.y, t);
    audio.ctx.listener.positionZ.setValueAtTime(camera.position.z, t);
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
  if (waterDisk?.material?.uniforms?.time) {
    waterDisk.material.uniforms.time.value += delta * params.waveSpeed;
  }
  syncCymatic();
  if (criaturaMesh) {
    criaturaMesh.position.set(params.vasoX, 0.03, params.vasoZ);
    criaturaMesh.scale.setScalar(params.criaturasRadio);
    const waterTime = waterDisk?.material?.uniforms?.time?.value ?? t;
    criaturaMat.uniforms.uTime.value = waterTime;
    criaturaMat.uniforms.uAmount.value = params.criaturas * (0.4 + params.luz * 0.4);
    criaturaMat.uniforms.uSize.value = Math.max(0.2, params.waveSize);
    criaturaMat.uniforms.uVib.value = params.vibracion * params.patronFuerza;
    criaturaMat.uniforms.uColor.value.set(params.colorAgua).lerp(tmpColor.set(params.sunColor), 0.45);
  }
  if (projMat) {
    projMat.uniforms.uTime.value = t;
    projMat.uniforms.uVibracion.value = params.vibracion;
    projMat.uniforms.uFrio.value = params.frio;
    projMat.uniforms.uDistortion.value = params.distortion;
    projMat.uniforms.uLight.value = params.luz;
    projMat.uniforms.uSize.value = params.waveSize;
    projMat.uniforms.uVideoFade.value = params.estado;
    projMat.uniforms.uFadeWithEstado.value = params.videoPorInmersion ? 1 : 0;
    if (videoTexture) videoTexture.needsUpdate = true;
  }
  if (video && videoCtrl && !videoScrub && video.duration && !video.paused) {
    params.videoPos = video.currentTime / video.duration;
    videoCtrl.updateDisplay();
  }
  applyVesselDeform(t);
  if (vesselDisk) vesselDisk.position.set(params.vasoX, params.vasoY, params.vasoZ);
  if (transducer) {
    const pulse = 1 + params.vibracion * Math.sin(t * 28) * 0.03;
    transducer.scale.setScalar(1.15 * pulse);
  }
  audioGear.forEach((sub) => {
    if (!sub.cone) return;
    const z = sub.cone.userData.baseZ ?? sub.cone.position.z;
    sub.cone.userData.baseZ = z;
    sub.cone.position.z = z + Math.sin(t * 22) * params.vibracion * fieldVol * 0.004;
  });
  if (params.audio) syncAudio();
  controls.update();
  renderer.render(scene, camera);
}

init();
animate();

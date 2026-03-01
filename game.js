// BioLab: Containment Breach - 3D Horror Game (Visual Upgrade)
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============ GAME STATE ============
const state = {
    playing: false, health: 100,
    keycards: { red: false, blue: false, green: false },
    flashlightOn: true, startTime: 0, isMobile: false,
    gameOver: false, won: false,
    currentWeapon: 0, kills: 0,
    attackHeld: false, attackCooldown: 0
};

// ============ WEAPON DEFINITIONS ============
const weaponDefs = [
    { name: 'PISTOL', damage: 15, fireRate: 0.25, ammo: 999, maxAmmo: 999, spread: 0.02, auto: false, range: 50, pellets: 1 },
    { name: 'SHOTGUN', damage: 12, fireRate: 0.8, ammo: 50, maxAmmo: 50, spread: 0.1, auto: false, range: 15, pellets: 8 },
    { name: 'ASSAULT RIFLE', damage: 10, fireRate: 0.08, ammo: 300, maxAmmo: 300, spread: 0.04, auto: true, range: 50, pellets: 1 },
    { name: 'FLAMETHROWER', damage: 4, fireRate: 0.05, ammo: 500, maxAmmo: 500, spread: 0.2, auto: true, range: 8, pellets: 1, isFlamethrower: true },
    { name: 'GRENADE LAUNCHER', damage: 100, fireRate: 1.2, ammo: 20, maxAmmo: 20, spread: 0, auto: false, range: 40, pellets: 1, isGrenade: true }
];

// ============ THREE.JS SETUP ============
let scene, camera, renderer, controls, composer;
let flashlight, flashlightTarget;
let clock = new THREE.Clock();
let audioContext, masterGain, noiseBuffer;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };
const WALK_SPEED = 5, SPRINT_SPEED = 9, PLAYER_HEIGHT = 1.7;

let walls = [], doors = [], keycardObjects = [], enemies = [], interactables = [];
let exitDoor = null;
let particles = [], grenades = [], effects = [];
let weaponModels = [];
let envLights = []; // for flickering env lights
let monitors = []; // wall monitors for flicker
let sparkPanels = []; // sparking panels

const raycaster = new THREE.Raycaster();
const interactRaycaster = new THREE.Raycaster();

// Mobile controls
let joystickActive = false, joystickDelta = { x: 0, y: 0 };
let joystickTouchId = null, joystickStartPos = { x: 0, y: 0 };
let lookTouchId = null, lookLastPos = { x: 0, y: 0 }, lookStartY = 0;
let mobilePitch = 0, mobileYaw = 0;

// Weapon animation
let weaponSwitching = false, weaponSwitchTime = 0;
let weaponSwitchFrom = 0, weaponSwitchTo = 0;
const WEAPON_SWITCH_DURATION = 0.4;
let weaponRecoil = 0;

// Audio refs
let flameLoopNode = null, flameLoopGain = null;
let lastWhisperTime = 0, lastFootstepTime = 0, lastHeartbeatTime = 0;

const MAX_PARTICLES = 150;

// ============ PROCEDURAL TEXTURES ============
function createCanvasTexture(width, height, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function makeWallTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
        // Base metal
        ctx.fillStyle = '#2a3038';
        ctx.fillRect(0, 0, w, h);
        // Panel lines
        ctx.strokeStyle = '#1a2028';
        ctx.lineWidth = 2;
        for (let y = 0; y < h; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let x = 0; x < w; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        // Rivets
        ctx.fillStyle = '#3a4550';
        for (let y = 8; y < h; y += 64) {
            for (let x = 8; x < w; x += 64) {
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 48, y, 3, 0, Math.PI * 2); ctx.fill();
            }
        }
        // Subtle noise
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const v = Math.random() * 15;
            ctx.fillStyle = `rgba(${v},${v},${v + 5},0.3)`;
            ctx.fillRect(x, y, 1, 1);
        }
    });
}

function makeWallNormalMap() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#8080ff';
        ctx.fillRect(0, 0, w, h);
        // Panel grooves as normal perturbation
        ctx.strokeStyle = '#6060ff';
        ctx.lineWidth = 3;
        for (let y = 0; y < h; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let x = 0; x < w; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        // Rivet bumps
        ctx.fillStyle = '#a0a0ff';
        for (let y = 8; y < h; y += 64) {
            for (let x = 8; x < w; x += 64) {
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 48, y, 4, 0, Math.PI * 2); ctx.fill();
            }
        }
    });
}

function makeFloorTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#1a1a1e';
        ctx.fillRect(0, 0, w, h);
        // Grating pattern
        ctx.strokeStyle = '#252530';
        ctx.lineWidth = 2;
        for (let y = 0; y < h; y += 16) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let x = 0; x < w; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        // Diamond grate holes
        ctx.fillStyle = '#101015';
        for (let y = 8; y < h; y += 32) {
            for (let x = 8; x < w; x += 32) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-4, -4, 8, 8);
                ctx.restore();
            }
        }
        // Noise
        for (let i = 0; i < 1500; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            ctx.fillStyle = `rgba(${Math.random()*10},${Math.random()*10},${Math.random()*12},0.3)`;
            ctx.fillRect(x, y, 1, 1);
        }
    });
}

function makeCeilingTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#181820';
        ctx.fillRect(0, 0, w, h);
        // Infrastructure panels
        ctx.strokeStyle = '#222230';
        ctx.lineWidth = 2;
        for (let y = 0; y < h; y += 128) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let x = 0; x < w; x += 128) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        // Exposed conduit marks
        ctx.strokeStyle = '#303040';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(30, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 30, 0); ctx.lineTo(w - 30, h); ctx.stroke();
    });
}

function makeDoorTexture(color) {
    return createCanvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(0, 0, w, h);
        // Door panels
        ctx.strokeStyle = '#2a2a35';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, w - 20, h / 2 - 15);
        ctx.strokeRect(10, h / 2 + 5, w - 20, h / 2 - 15);
        // Glowing edge strips
        const hex = '#' + color.toString(16).padStart(6, '0');
        ctx.strokeStyle = hex;
        ctx.lineWidth = 3;
        ctx.shadowColor = hex;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(3, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 3, 0); ctx.lineTo(w - 3, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        ctx.shadowBlur = 0;
    });
}

// ============ MAP DEFINITION ============
const MAP_SIZE = 20, CELL_SIZE = 4;
const mapLayout = [
    "11111111111111111111",
    "1S     1    1      1",
    "1  1   1 E  1  111 1",
    "1  1   2    2    1 1",
    "1  111111111111  1 1",
    "1        1       1 1",
    "1  1111  1  1111 1 1",
    "1  1 K1  3  1  1   1",
    "1  1  1111111  11211",
    "1  1           1   1",
    "1  111114111   1 E 1",
    "1      1   1   1   1",
    "111211 1 K 1   11111",
    "1      1   1       1",
    "1  11111   111111  1",
    "1  1   E       1   1",
    "1  1   11111   1   1",
    "1  1   1 K 5   1   1",
    "1      1   11116   1",
    "11111111111111111111"
];

// ============ AUDIO SYSTEM ============
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioContext.destination);
    const sr = audioContext.sampleRate;
    const len = sr * 2;
    noiseBuffer = audioContext.createBuffer(1, len, sr);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

function playNoise(filterType, filterFreq, filterQ, vol, duration, attack) {
    if (!audioContext || !noiseBuffer) return;
    const now = audioContext.currentTime;
    const src = audioContext.createBufferSource();
    src.buffer = noiseBuffer;
    const flt = audioContext.createBiquadFilter();
    flt.type = filterType; flt.frequency.value = filterFreq; flt.Q.value = filterQ || 1;
    const g = audioContext.createGain();
    if (attack) { g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + attack); }
    else g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(flt); flt.connect(g); g.connect(masterGain);
    src.start(now); src.stop(now + duration);
}

function playOsc(freq, type, vol, duration, freqEnv) {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    osc.type = type; osc.frequency.value = freq;
    if (freqEnv) freqEnv(osc.frequency, now);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g); g.connect(masterGain);
    osc.start(now); osc.stop(now + duration);
}

function playFootstep() { playNoise('lowpass', 300 + Math.random() * 200, 1, 0.1, 0.08); }
function playPickup() { playOsc(880, 'sine', 0.2, 0.1); setTimeout(() => playOsc(1100, 'sine', 0.2, 0.1), 100); }

function playDoorCreak() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.1);
    osc.frequency.linearRampToValueAtTime(150, now + 0.2);
    osc.frequency.linearRampToValueAtTime(350, now + 0.35);
    osc.frequency.linearRampToValueAtTime(100, now + 0.5);
    const flt = audioContext.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 300; flt.Q.value = 10;
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(flt); flt.connect(g); g.connect(masterGain);
    osc.start(now); osc.stop(now + 0.5);
}

function playDoorLocked() { playOsc(100, 'square', 0.3, 0.1); setTimeout(() => playOsc(80, 'square', 0.3, 0.1), 150); }

function playMonsterGrowl(type) {
    if (!audioContext) return;
    if (type === 'tank') { playOsc(35, 'sawtooth', 0.3, 0.8); playNoise('lowpass', 200, 1, 0.15, 0.6); }
    else if (type === 'fast') { playOsc(200, 'sawtooth', 0.25, 0.3, (f, t) => { f.exponentialRampToValueAtTime(400, t + 0.1); f.exponentialRampToValueAtTime(150, t + 0.3); }); }
    else { playNoise('bandpass', 3000, 5, 0.15, 0.3); }
}

function playJumpScare() {
    if (!audioContext) return;
    playNoise('lowpass', 5000, 1, 0.7, 0.5);
    [200, 267, 350].forEach(f => playOsc(f, 'sawtooth', 0.3, 0.4));
}

function playHeartbeat() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const o1 = audioContext.createOscillator(); o1.frequency.value = 40; o1.type = 'sine';
    const g1 = audioContext.createGain();
    g1.gain.setValueAtTime(0, now); g1.gain.linearRampToValueAtTime(0.3, now + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o1.connect(g1); g1.connect(masterGain); o1.start(now); o1.stop(now + 0.12);
    const o2 = audioContext.createOscillator(); o2.frequency.value = 50; o2.type = 'sine';
    const g2 = audioContext.createGain();
    g2.gain.setValueAtTime(0, now + 0.15); g2.gain.linearRampToValueAtTime(0.2, now + 0.17);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    o2.connect(g2); g2.connect(masterGain); o2.start(now); o2.stop(now + 0.27);
}

function playWhisper() { playNoise('bandpass', 600 + Math.random() * 600, 15, 0.06, 0.4 + Math.random() * 0.3, 0.1); }
function playMonsterAttack() { playNoise('lowpass', 2000, 1, 0.5, 0.15); playOsc(60, 'sine', 0.4, 0.2); }

function playAmbientDrone() {
    if (!audioContext) return;
    const o1 = audioContext.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 30;
    const f1 = audioContext.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 80;
    const g1 = audioContext.createGain(); g1.gain.value = 0.08;
    o1.connect(f1); f1.connect(g1); g1.connect(masterGain); o1.start();
    const o2 = audioContext.createOscillator(); o2.type = 'sine'; o2.frequency.value = 32;
    const g2 = audioContext.createGain(); g2.gain.value = 0.05;
    o2.connect(g2); g2.connect(masterGain); o2.start();
    const lfo = audioContext.createOscillator(); lfo.frequency.value = 0.1;
    const lg = audioContext.createGain(); lg.gain.value = 5;
    lfo.connect(lg); lg.connect(o1.frequency); lfo.start();
}

function playPistolSound() { playNoise('highpass', 1000, 1, 0.4, 0.1); playOsc(800, 'square', 0.2, 0.05); }
function playShotgunSound() { playNoise('lowpass', 800, 1, 0.6, 0.3); playOsc(60, 'sine', 0.3, 0.2); }
function playRifleSound() { playNoise('bandpass', 2000, 2, 0.3, 0.06); }
function playGrenadeLaunchSound() { playOsc(100, 'sine', 0.4, 0.15); playNoise('lowpass', 500, 1, 0.2, 0.1); }
function playExplosionSound() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const src = audioContext.createBufferSource(); src.buffer = noiseBuffer;
    const flt = audioContext.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, now); flt.frequency.exponentialRampToValueAtTime(100, now + 0.5);
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.8, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(flt); flt.connect(g); g.connect(masterGain);
    src.start(now); src.stop(now + 0.5);
    playOsc(40, 'sine', 0.5, 0.4);
}
function playHitSound() { playNoise('lowpass', 1500, 1, 0.25, 0.1); playOsc(90, 'square', 0.15, 0.08); }

function startFlameSound() {
    if (!audioContext || flameLoopNode) return;
    const src = audioContext.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
    const flt = audioContext.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 400; flt.Q.value = 1;
    const lfo = audioContext.createOscillator(); lfo.frequency.value = 8;
    const lg = audioContext.createGain(); lg.gain.value = 100;
    lfo.connect(lg); lg.connect(flt.frequency); lfo.start();
    const g = audioContext.createGain(); g.gain.value = 0.2;
    src.connect(flt); flt.connect(g); g.connect(masterGain); src.start();
    flameLoopNode = src; flameLoopGain = g; flameLoopNode._lfo = lfo;
}
function stopFlameSound() {
    if (flameLoopNode) {
        try { flameLoopNode.stop(); } catch(e) {}
        try { if (flameLoopNode._lfo) flameLoopNode._lfo.stop(); } catch(e) {}
        flameLoopNode = null; flameLoopGain = null;
    }
}

// ============ INITIALIZATION ============
function init() {
    state.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || ('ontouchstart' in window && window.innerWidth < 1024);
    if (state.isMobile) {
        document.body.classList.add('mobile-visible');
        document.getElementById('start-prompt').textContent = 'TAP TO START';
        document.getElementById('interact-prompt').textContent = 'Tap USE to interact';
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x061018, 0.04);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(CELL_SIZE * 1.5, PLAYER_HEIGHT, CELL_SIZE * 1.5);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.6,   // strength
        0.4,   // radius
        0.85   // threshold
    );
    composer.addPass(bloomPass);

    controls = new PointerLockControls(camera, document.body);

    // Atmospheric ambient: blue-green tint
    const ambient = new THREE.AmbientLight(0x0a1520, 0.6);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x0a2040, 0x100808, 0.3);
    scene.add(hemi);

    // Flashlight - better cone
    flashlight = new THREE.SpotLight(0xeeeeff, 4, 35, Math.PI / 5, 0.5, 1.2);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 512;
    flashlight.shadow.mapSize.height = 512;
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0, 0, -1);
    camera.add(flashlightTarget);
    flashlight.target = flashlightTarget;
    scene.add(camera);

    buildMap();
    spawnEnemies();
    createWeapons();
    setupEventListeners();

    document.getElementById('loading').style.display = 'none';
    initAudio();
}

// ============ MAP BUILDING ============
function buildMap() {
    const wallTex = makeWallTexture();
    wallTex.repeat.set(1, 1);
    const wallNorm = makeWallNormalMap();
    wallNorm.repeat.set(1, 1);
    const floorTex = makeFloorTexture();
    floorTex.repeat.set(MAP_SIZE, MAP_SIZE);
    const ceilingTex = makeCeilingTexture();
    ceilingTex.repeat.set(MAP_SIZE, MAP_SIZE);

    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * CELL_SIZE, MAP_SIZE * CELL_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex, roughness: 0.85, metalness: 0.2, color: 0x888888
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_SIZE * CELL_SIZE / 2, 0, MAP_SIZE * CELL_SIZE / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceilingMat = new THREE.MeshStandardMaterial({
        map: ceilingTex, roughness: 0.9, metalness: 0.1, color: 0x666666
    });
    const ceiling = new THREE.Mesh(floorGeo.clone(), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(MAP_SIZE * CELL_SIZE / 2, 3, MAP_SIZE * CELL_SIZE / 2);
    scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({
        map: wallTex, normalMap: wallNorm, roughness: 0.7, metalness: 0.3, color: 0x888888
    });

    let keycardIndex = 0;
    const keycardColors = ['red', 'blue', 'green'];

    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const cell = mapLayout[z][x];
            const posX = x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = z * CELL_SIZE + CELL_SIZE / 2;

            if (cell === '1') {
                const wall = createWall(posX, posZ, wallMat);
                walls.push(wall); scene.add(wall);
            } else if (cell === '2') {
                const door = createDoor(posX, posZ, 0x8B4513, null);
                doors.push(door); scene.add(door);
            } else if (cell === '3') {
                const door = createDoor(posX, posZ, 0xff0000, 'red');
                doors.push(door); scene.add(door);
            } else if (cell === '4') {
                const door = createDoor(posX, posZ, 0x0000ff, 'blue');
                doors.push(door); scene.add(door);
            } else if (cell === '5') {
                const door = createDoor(posX, posZ, 0x00ff00, 'green');
                doors.push(door); scene.add(door);
            } else if (cell === '6') {
                exitDoor = createDoor(posX, posZ, 0xffd700, 'exit');
                doors.push(exitDoor); scene.add(exitDoor);
            } else if (cell === 'K') {
                if (keycardIndex < 3) {
                    const kc = createKeycard(posX, posZ, keycardColors[keycardIndex]);
                    keycardObjects.push(kc); scene.add(kc); keycardIndex++;
                }
            } else if (cell === 'S') {
                camera.position.set(posX, PLAYER_HEIGHT, posZ);
            }

            // Corridor decorations
            if (cell === ' ' || cell === 'E' || cell === 'K' || cell === 'S') {
                // Neon corridor lights (colored)
                if (Math.random() < 0.15) {
                    const colors = [0x00ccff, 0xff6600, 0xff2200, 0x00ff88, 0x8800ff];
                    const col = colors[Math.floor(Math.random() * colors.length)];
                    const cl = new THREE.PointLight(col, 1.2, 12);
                    cl.position.set(posX, 2.8, posZ);
                    scene.add(cl);
                    envLights.push({ light: cl, base: 1.2, color: col });
                }

                // Flickering lights
                if (Math.random() < 0.12) {
                    scene.add(createFlickeringLight(posX, posZ));
                }

                // Blood splatters
                if (Math.random() < 0.08) scene.add(createBloodSplatter(posX, posZ));

                // Wall pipes
                if (Math.random() < 0.1) {
                    addWallPipes(posX, posZ);
                }

                // Debris (boxes, barrels)
                if (Math.random() < 0.06) {
                    addDebris(posX, posZ);
                }

                // Puddles (reflective)
                if (Math.random() < 0.05) {
                    addPuddle(posX, posZ);
                }

                // Wall monitors
                if (Math.random() < 0.04) {
                    addWallMonitor(posX, posZ);
                }

                // Sparking panel
                if (Math.random() < 0.03) {
                    addSparkPanel(posX, posZ);
                }
            }

            // Warning stripes near doors
            if ('23456'.includes(cell)) {
                addWarningStripes(posX, posZ);
            }
        }
    }
}

function addWallPipes(x, z) {
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a4a, metalness: 0.6, roughness: 0.4 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), pipeMat);
    pipe.position.set(x + 1.8, 1.5, z);
    scene.add(pipe);
    // Horizontal pipe
    if (Math.random() < 0.5) {
        const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), pipeMat);
        hp.rotation.z = Math.PI / 2;
        hp.position.set(x, 2.6, z + 1.8);
        scene.add(hp);
    }
}

function addDebris(x, z) {
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2a25, roughness: 0.9, metalness: 0.1 });
    if (Math.random() < 0.5) {
        // Box
        const s = 0.2 + Math.random() * 0.3;
        const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), debrisMat);
        box.position.set(x + (Math.random() - 0.5) * 2, s / 2, z + (Math.random() - 0.5) * 2);
        box.rotation.y = Math.random() * Math.PI;
        scene.add(box);
    } else {
        // Barrel
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 0.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8, metalness: 0.2 })
        );
        barrel.position.set(x + (Math.random() - 0.5) * 1.5, 0.3, z + (Math.random() - 0.5) * 1.5);
        if (Math.random() < 0.3) barrel.rotation.x = Math.PI / 2; // tipped over
        scene.add(barrel);
    }
}

function addPuddle(x, z) {
    const geo = new THREE.PlaneGeometry(0.8 + Math.random() * 0.8, 0.6 + Math.random() * 0.5);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x0a1520, roughness: 0.05, metalness: 0.9,
        transparent: true, opacity: 0.6
    });
    const puddle = new THREE.Mesh(geo, mat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x + (Math.random() - 0.5), 0.02, z + (Math.random() - 0.5));
    scene.add(puddle);
}

function addWallMonitor(x, z) {
    const monitorMat = new THREE.MeshStandardMaterial({
        color: 0x001a0a, emissive: 0x00ff44, emissiveIntensity: 0.3,
        roughness: 0.3, metalness: 0.5
    });
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), monitorMat);
    monitor.position.set(x + 1.9, 1.6, z);
    scene.add(monitor);
    monitors.push({ mesh: monitor, mat: monitorMat, time: Math.random() * 100 });
    // Dim green light from monitor
    const ml = new THREE.PointLight(0x00ff44, 0.3, 4);
    ml.position.set(x + 1.7, 1.6, z);
    scene.add(ml);
}

function addSparkPanel(x, z) {
    // A damaged panel that occasionally sparks
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.8 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), panelMat);
    panel.position.set(x - 1.9, 1.2, z);
    scene.add(panel);
    const sparkLight = new THREE.PointLight(0xffaa44, 0, 5);
    sparkLight.position.set(x - 1.8, 1.2, z);
    scene.add(sparkLight);
    sparkPanels.push({ light: sparkLight, pos: new THREE.Vector3(x - 1.8, 1.2, z), timer: Math.random() * 3 });
}

function addWarningStripes(x, z) {
    const stripeTex = createCanvasTexture(128, 32, (ctx, w, h) => {
        ctx.fillStyle = '#1a1a00';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#aa8800';
        for (let i = -2; i < 10; i++) {
            ctx.save();
            ctx.translate(i * 20, 0);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.lineTo(26, h); ctx.lineTo(16, h);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    });
    const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.9, 0.15),
        new THREE.MeshStandardMaterial({ map: stripeTex, transparent: true, opacity: 0.8, roughness: 0.6 })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.015, z + CELL_SIZE * 0.45);
    scene.add(stripe);
}

function createWall(x, z, material) {
    const geo = new THREE.BoxGeometry(CELL_SIZE, 3, CELL_SIZE);
    const wall = new THREE.Mesh(geo, material);
    wall.position.set(x, 1.5, z);
    wall.castShadow = true; wall.receiveShadow = true;
    wall.userData.isWall = true;
    wall.userData.box = new THREE.Box3().setFromObject(wall);
    return wall;
}

function createDoor(x, z, color, keyRequired) {
    const doorTex = makeDoorTexture(color);
    const geo = new THREE.BoxGeometry(CELL_SIZE * 0.8, 2.5, 0.2);
    const mat = new THREE.MeshStandardMaterial({
        map: doorTex, color: 0xaaaaaa,
        emissive: color, emissiveIntensity: 0.3,
        roughness: 0.4, metalness: 0.6
    });
    const door = new THREE.Mesh(geo, mat);
    door.position.set(x, 1.25, z); door.castShadow = true;
    door.userData.isDoor = true; door.userData.keyRequired = keyRequired;
    door.userData.isOpen = false; door.userData.box = new THREE.Box3().setFromObject(door);
    interactables.push(door);

    // Door glow light
    const glowLight = new THREE.PointLight(color, 0.5, 6);
    glowLight.position.set(x, 1.5, z);
    scene.add(glowLight);

    return door;
}

function createKeycard(x, z, color) {
    const geo = new THREE.BoxGeometry(0.3, 0.02, 0.2);
    const colorHex = color === 'red' ? 0xff0000 : color === 'blue' ? 0x0000ff : 0x00ff00;
    const mat = new THREE.MeshStandardMaterial({
        color: colorHex, emissive: colorHex, emissiveIntensity: 0.8,
        roughness: 0.2, metalness: 0.5
    });
    const kc = new THREE.Mesh(geo, mat);
    kc.position.set(x, 0.5, z);
    const glowGeo = new THREE.SphereGeometry(0.4);
    const glowMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.15 });
    kc.add(new THREE.Mesh(glowGeo, glowMat));

    // Keycard light
    const kcLight = new THREE.PointLight(colorHex, 0.8, 6);
    kcLight.position.set(x, 0.8, z);
    scene.add(kcLight);
    kc.userData.light = kcLight;

    kc.userData.isKeycard = true; kc.userData.color = color;
    interactables.push(kc);
    return kc;
}

function createFlickeringLight(x, z) {
    const colors = [0xffaa00, 0xff6600, 0x00ccff];
    const col = colors[Math.floor(Math.random() * colors.length)];
    const light = new THREE.PointLight(col, 0.8, 12);
    light.position.set(x, 2.5, z);
    light.userData.flicker = true; light.userData.baseIntensity = 0.8;
    return light;
}

function createBloodSplatter(x, z) {
    const geo = new THREE.PlaneGeometry(1 + Math.random(), 0.5 + Math.random() * 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x440000, transparent: true, opacity: 0.7 });
    const blood = new THREE.Mesh(geo, mat);
    blood.rotation.x = -Math.PI / 2;
    blood.position.set(x + (Math.random() - 0.5) * 2, 0.01, z + (Math.random() - 0.5) * 2);
    return blood;
}

// ============ WEAPONS ============
function createWeapons() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.6 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.7 });

    // 0: Pistol
    const pistol = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.2), metal);
    pSlide.position.set(0, 0.03, 0); pistol.add(pSlide);
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), metal);
    pBarrel.rotation.x = Math.PI / 2; pBarrel.position.set(0, 0.035, -0.13); pistol.add(pBarrel);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.09, 0.05), grip);
    pGrip.position.set(0, -0.04, 0.03); pGrip.rotation.x = 0.2; pistol.add(pGrip);
    pistol.position.set(0.32, -0.28, -0.45);
    pistol.userData.basePos = new THREE.Vector3(0.32, -0.28, -0.45);

    // 1: Shotgun
    const shotgun = new THREE.Group();
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), darkMetal);
    sBarrel.rotation.x = Math.PI / 2; sBarrel.position.set(0, 0.04, -0.05); shotgun.add(sBarrel);
    const sPump = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), wood);
    sPump.rotation.x = Math.PI / 2; sPump.position.set(0, 0, 0.02); shotgun.add(sPump);
    const sStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.2), wood);
    sStock.position.set(0, 0, 0.3); sStock.rotation.x = -0.1; shotgun.add(sStock);
    const sGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.04), grip);
    sGrip.position.set(0, -0.04, 0.15); sGrip.rotation.x = 0.3; shotgun.add(sGrip);
    shotgun.position.set(0.3, -0.32, -0.5);
    shotgun.userData.basePos = new THREE.Vector3(0.3, -0.32, -0.5);

    // 2: Assault Rifle
    const rifle = new THREE.Group();
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), darkMetal);
    rBarrel.rotation.x = Math.PI / 2; rBarrel.position.set(0, 0.04, -0.1); rifle.add(rBarrel);
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.25), olive);
    rBody.position.set(0, 0.02, 0.1); rifle.add(rBody);
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), darkMetal);
    rMag.position.set(0, -0.05, 0.08); rMag.rotation.x = 0.15; rifle.add(rMag);
    const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.18), olive);
    rStock.position.set(0, 0.01, 0.32); rifle.add(rStock);
    const rScope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), metal);
    rScope.rotation.x = Math.PI / 2; rScope.position.set(0, 0.065, 0.05); rifle.add(rScope);
    rifle.position.set(0.28, -0.3, -0.5);
    rifle.userData.basePos = new THREE.Vector3(0.28, -0.3, -0.5);

    // 3: Flamethrower
    const flame = new THREE.Group();
    const fNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.3, 8), darkMetal);
    fNozzle.rotation.x = Math.PI / 2; fNozzle.position.set(0, 0.02, -0.15); flame.add(fNozzle);
    const fTip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.05, 8), red);
    fTip.rotation.x = Math.PI / 2; fTip.position.set(0, 0.02, -0.32); flame.add(fTip);
    const fBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), olive);
    fBody.position.set(0, 0, 0.05); flame.add(fBody);
    const fTank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 8), red);
    fTank.position.set(0, -0.05, 0.12); flame.add(fTank);
    const fGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.04), grip);
    fGrip.position.set(0, -0.04, -0.02); fGrip.rotation.x = 0.2; flame.add(fGrip);
    flame.position.set(0.3, -0.3, -0.5);
    flame.userData.basePos = new THREE.Vector3(0.3, -0.3, -0.5);

    // 4: Grenade Launcher
    const gl = new THREE.Group();
    const glBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), darkMetal);
    glBarrel.rotation.x = Math.PI / 2; glBarrel.position.set(0, 0.03, -0.05); gl.add(glBarrel);
    const glDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), metal);
    glDrum.position.set(0, -0.01, 0.05); gl.add(glDrum);
    const glStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.15), wood);
    glStock.position.set(0, 0.01, 0.22); gl.add(glStock);
    const glGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.04), grip);
    glGrip.position.set(0, -0.04, 0.12); glGrip.rotation.x = 0.25; gl.add(glGrip);
    gl.position.set(0.3, -0.3, -0.5);
    gl.userData.basePos = new THREE.Vector3(0.3, -0.3, -0.5);

    weaponModels = [pistol, shotgun, rifle, flame, gl];
    weaponModels.forEach((m, i) => { m.visible = (i === 0); camera.add(m); });
}

function switchWeapon(index) {
    if (index === state.currentWeapon || weaponSwitching) return;
    if (index < 0 || index >= weaponDefs.length) return;
    stopFlameSound(); state.attackHeld = false;
    weaponSwitching = true; weaponSwitchTime = 0;
    weaponSwitchFrom = state.currentWeapon; weaponSwitchTo = index;
}

function updateWeaponSwitch(delta) {
    if (!weaponSwitching) return;
    weaponSwitchTime += delta;
    const half = WEAPON_SWITCH_DURATION / 2;
    const fromModel = weaponModels[weaponSwitchFrom];
    const toModel = weaponModels[weaponSwitchTo];
    const fromBase = fromModel.userData.basePos;
    const toBase = toModel.userData.basePos;
    if (weaponSwitchTime < half) {
        const t = weaponSwitchTime / half;
        fromModel.position.y = fromBase.y - t * 0.5;
    } else {
        fromModel.visible = false; toModel.visible = true;
        state.currentWeapon = weaponSwitchTo;
        const t = (weaponSwitchTime - half) / half;
        toModel.position.set(toBase.x, toBase.y - 0.5 + t * 0.5, toBase.z);
        if (weaponSwitchTime >= WEAPON_SWITCH_DURATION) {
            weaponSwitching = false;
            toModel.position.copy(toBase);
            updateHUD();
        }
    }
}

function updateWeapon(delta) {
    updateWeaponSwitch(delta);
    if (weaponSwitching) return;
    const model = weaponModels[state.currentWeapon];
    if (!model) return;
    const base = model.userData.basePos;
    if (weaponRecoil > 0) { weaponRecoil *= 0.85; if (weaponRecoil < 0.001) weaponRecoil = 0; }
    const isMoving = direction.length() > 0.1 || (state.isMobile && joystickActive);
    const bobSpeed = isMoving ? 0.008 : 0.001;
    const bobAmt = isMoving ? 0.012 : 0.004;
    const bobX = Math.sin(Date.now() * bobSpeed) * bobAmt;
    const bobY = Math.sin(Date.now() * bobSpeed * 2) * bobAmt;
    model.position.set(base.x + bobX, base.y + bobY, base.z + weaponRecoil);
}

// ============ WEAPON FIRING ============
function fireCurrentWeapon() {
    const def = weaponDefs[state.currentWeapon];
    if (def.ammo <= 0) return;
    if (weaponSwitching) return;
    def.ammo--;
    weaponRecoil = def.isGrenade ? 0.1 : def.name === 'SHOTGUN' ? 0.08 : 0.03;
    showMuzzleFlash();
    updateHUD();
    if (def.isFlamethrower) { startFlameSound(); flamethrowerFire(); }
    else if (def.isGrenade) { playGrenadeLaunchSound(); fireGrenade(); }
    else {
        if (def.name === 'PISTOL') playPistolSound();
        else if (def.name === 'SHOTGUN') playShotgunSound();
        else playRifleSound();
        fireHitscan(def.spread, def.range, def.damage, def.pellets);
        spawnShellCasing();
    }
}

function showMuzzleFlash() {
    const def = weaponDefs[state.currentWeapon];
    if (def.isFlamethrower) return;

    // Enhanced muzzle flash with multiple lights
    const light = new THREE.PointLight(0xffaa44, 5, 10);
    light.position.set(0, 0, -0.7);
    camera.add(light);

    // Flash sprite
    const flashGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffdd66, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, 0, -0.7);
    camera.add(flash);

    setTimeout(() => {
        camera.remove(light);
        camera.remove(flash);
        flashGeo.dispose();
        flashMat.dispose();
    }, 60);
}

function spawnShellCasing() {
    const geo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.9, roughness: 0.2 });
    const shell = new THREE.Mesh(geo, mat);
    const pos = camera.position.clone();
    const right = new THREE.Vector3();
    camera.getWorldDirection(right);
    const r = new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize();
    pos.add(r.multiplyScalar(0.3));
    pos.y -= 0.2;
    shell.position.copy(pos);
    shell.userData.velocity = new THREE.Vector3(
        r.x * 2 + (Math.random() - 0.5),
        2 + Math.random() * 2,
        r.z * 2 + (Math.random() - 0.5)
    );
    shell.userData.lifetime = 1.5;
    shell.userData.maxLifetime = 1.5;
    shell.userData.isParticle = true;
    addParticle(shell);
}

function fireHitscan(spread, range, damage, pellets) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    for (let p = 0; p < pellets; p++) {
        const d = dir.clone();
        d.x += (Math.random() - 0.5) * spread;
        d.y += (Math.random() - 0.5) * spread;
        d.z += (Math.random() - 0.5) * spread;
        d.normalize();
        raycaster.set(camera.position, d); raycaster.far = range;
        let closestHit = null, closestDist = Infinity;
        for (const enemy of enemies) {
            if (enemy.userData.health <= 0) continue;
            const hits = raycaster.intersectObject(enemy, true);
            if (hits.length > 0 && hits[0].distance < closestDist) {
                closestDist = hits[0].distance;
                closestHit = { enemy, point: hits[0].point };
            }
        }
        if (closestHit) {
            damageEnemy(closestHit.enemy, damage, d.clone());
            spawnBloodParticles(closestHit.point, 3);
        }
    }
}

function flamethrowerFire() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const flatDir = dir.clone(); flatDir.y = 0; flatDir.normalize();
    for (const enemy of enemies) {
        if (enemy.userData.health <= 0 || enemy.userData.dying) continue;
        const toEnemy = enemy.position.clone().sub(camera.position);
        toEnemy.y = 0;
        const dist = toEnemy.length();
        if (dist > 8) continue;
        toEnemy.normalize();
        if (flatDir.dot(toEnemy) > 0.75) damageEnemy(enemy, weaponDefs[3].damage, flatDir.clone());
    }
    spawnFlameParticles();
}

function spawnFlameParticles() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    for (let i = 0; i < 3; i++) {
        const pos = camera.position.clone().add(dir.clone().multiplyScalar(0.6));
        pos.y -= 0.15;
        const vel = dir.clone().multiplyScalar(8 + Math.random() * 4);
        vel.x += (Math.random() - 0.5) * 3;
        vel.y += (Math.random() - 0.5) * 2 + 1;
        vel.z += (Math.random() - 0.5) * 3;
        const size = 0.05 + Math.random() * 0.06;
        const geo = new THREE.SphereGeometry(size, 4, 4);
        const colors = [0xff6600, 0xff3300, 0xffaa00, 0xff0000];
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true, opacity: 0.8
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        p.userData.velocity = vel;
        p.userData.lifetime = 0.25 + Math.random() * 0.25;
        p.userData.maxLifetime = p.userData.lifetime;
        p.userData.isParticle = true;
        p.userData.noGravity = true;
        addParticle(p);
    }
}

function fireGrenade() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const geo = new THREE.SphereGeometry(0.1, 6, 6);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x444444, emissive: 0xff4400, emissiveIntensity: 0.3
    });
    const g = new THREE.Mesh(geo, mat);
    g.position.copy(camera.position).add(dir.clone().multiplyScalar(0.5));
    g.userData.velocity = dir.clone().multiplyScalar(18);
    g.userData.velocity.y += 3;
    g.userData.lifetime = 4;
    scene.add(g);
    grenades.push(g);
}

function updateGrenades(delta) {
    for (let i = grenades.length - 1; i >= 0; i--) {
        const g = grenades[i];
        g.userData.velocity.y -= 12 * delta;
        g.position.add(g.userData.velocity.clone().multiplyScalar(delta));
        g.userData.lifetime -= delta;
        g.rotation.x += delta * 5; g.rotation.z += delta * 3;
        if (g.position.y <= 0.15 || checkWallCollision(g.position) || g.userData.lifetime <= 0) {
            createExplosion(g.position.clone());
            for (const enemy of enemies) {
                if (enemy.userData.health <= 0) continue;
                const dist = enemy.position.distanceTo(g.position);
                if (dist < 6) {
                    const dmg = weaponDefs[4].damage * (1 - dist / 6);
                    const kb = enemy.position.clone().sub(g.position).normalize();
                    damageEnemy(enemy, dmg, kb);
                }
            }
            const pDist = camera.position.distanceTo(g.position);
            if (pDist < 6) takeDamage(Math.floor(30 * (1 - pDist / 6)));
            scene.remove(g); g.geometry.dispose(); g.material.dispose();
            grenades.splice(i, 1);
        }
    }
}

function createExplosion(position) {
    const light = new THREE.PointLight(0xff6600, 10, 18);
    light.position.copy(position); scene.add(light);
    const sphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(position); scene.add(sphere);

    // Inner bright core
    const coreGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(position); scene.add(core);

    effects.push({ type: 'explosion', light, sphere, sphereGeo, sphereMat, core, coreGeo, coreMat, elapsed: 0 });

    for (let i = 0; i < 25; i++) {
        const size = 0.05 + Math.random() * 0.08;
        const geo = new THREE.BoxGeometry(size, size, size);
        const colors = [0xff6600, 0xff3300, 0xffaa00, 0x333333, 0xffff44];
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)], transparent: true
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 12, Math.random() * 10 + 2, (Math.random() - 0.5) * 12
        );
        p.userData.lifetime = 0.5 + Math.random() * 0.8;
        p.userData.maxLifetime = p.userData.lifetime;
        p.userData.isParticle = true;
        addParticle(p);
    }
    playExplosionSound();
    const dist = camera.position.distanceTo(position);
    if (dist < 15) {
        const i = (1 - dist / 15) * 0.15;
        camera.position.x += (Math.random() - 0.5) * i;
        camera.position.z += (Math.random() - 0.5) * i;
    }
}

function updateEffects(delta) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.elapsed += delta;
        if (e.type === 'explosion') {
            const s = 1 + e.elapsed * 15;
            e.sphere.scale.set(s, s, s);
            e.sphere.material.opacity = Math.max(0, 0.7 - e.elapsed * 2);
            e.light.intensity = Math.max(0, 10 - e.elapsed * 25);
            if (e.core) {
                const cs = 0.5 + e.elapsed * 8;
                e.core.scale.set(cs, cs, cs);
                e.core.material.opacity = Math.max(0, 0.9 - e.elapsed * 4);
            }
            if (e.elapsed > 0.5) {
                scene.remove(e.sphere); scene.remove(e.light);
                e.sphereGeo.dispose(); e.sphereMat.dispose();
                if (e.core) { scene.remove(e.core); e.coreGeo.dispose(); e.coreMat.dispose(); }
                effects.splice(i, 1);
            }
        }
    }
}

// ============ PARTICLES ============
function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) {
        const old = particles.shift();
        scene.remove(old); old.geometry.dispose(); old.material.dispose();
    }
    particles.push(p); scene.add(p);
}

function spawnBloodParticles(position, count) {
    for (let i = 0; i < count; i++) {
        const size = 0.03 + Math.random() * 0.04;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000, transparent: true });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3
        );
        p.userData.lifetime = 0.8 + Math.random() * 0.5;
        p.userData.maxLifetime = p.userData.lifetime;
        p.userData.isParticle = true;
        addParticle(p);
    }
}

function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.lifetime -= delta;
        if (p.userData.lifetime <= 0) {
            scene.remove(p); p.geometry.dispose(); p.material.dispose();
            particles.splice(i, 1); continue;
        }
        p.position.add(p.userData.velocity.clone().multiplyScalar(delta));
        if (!p.userData.noGravity) p.userData.velocity.y -= 9.8 * delta;
        const lr = p.userData.lifetime / p.userData.maxLifetime;
        p.material.opacity = lr;
        const sc = 0.5 + lr * 0.5;
        p.scale.set(sc, sc, sc);
        if (p.position.y < 0.02) {
            p.position.y = 0.02; p.userData.velocity.y = 0;
            p.userData.velocity.x *= 0.8; p.userData.velocity.z *= 0.8;
        }
    }
}

// ============ ENEMIES ============
function spawnEnemies() {
    const types = ['fast', 'tank', 'crawler'];
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (mapLayout[z][x] === 'E') {
                const posX = x * CELL_SIZE + CELL_SIZE / 2;
                const posZ = z * CELL_SIZE + CELL_SIZE / 2;
                const t1 = types[Math.floor(Math.random() * types.length)];
                enemies.push(createEnemy(posX, posZ, t1));
                scene.add(enemies[enemies.length - 1]);
                const t2 = types[Math.floor(Math.random() * types.length)];
                const e2 = createEnemy(posX + 1.5, posZ + 1.5, t2);
                enemies.push(e2); scene.add(e2);
            }
            if (mapLayout[z][x] === ' ' && Math.random() < 0.025) {
                const posX = x * CELL_SIZE + CELL_SIZE / 2;
                const posZ = z * CELL_SIZE + CELL_SIZE / 2;
                if (posX > CELL_SIZE * 4 || posZ > CELL_SIZE * 4) {
                    const t = types[Math.floor(Math.random() * types.length)];
                    const e = createEnemy(posX, posZ, t);
                    enemies.push(e); scene.add(e);
                }
            }
        }
    }
}

function createEnemy(x, z, type) {
    const group = new THREE.Group();
    let hp, speed, damage, barHeight;
    let eyeColor;

    if (type === 'fast') {
        hp = 60; speed = 5.5; damage = 12; barHeight = 2.2;
        eyeColor = 0x00ff44;
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.8 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.3), bodyMat);
        body.position.y = 0.65; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22), bodyMat);
        head.position.y = 1.5; group.add(head);
        const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const eyeGeo = new THREE.SphereGeometry(0.05);
        const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.1, 1.55, 0.18);
        const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(0.1, 1.55, 0.18);
        group.add(e1, e2);
        const armGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.6);
        const arm1 = new THREE.Mesh(armGeo, bodyMat); arm1.position.set(-0.35, 0.8, 0); arm1.rotation.z = 0.3;
        const arm2 = new THREE.Mesh(armGeo, bodyMat); arm2.position.set(0.35, 0.8, 0); arm2.rotation.z = -0.3;
        group.add(arm1, arm2);
    } else if (type === 'tank') {
        hp = 300; speed = 1.5; damage = 35; barHeight = 2.8;
        eyeColor = 0xff2200;
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2222, roughness: 0.9 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.8), bodyMat);
        body.position.y = 0.8; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.35), bodyMat);
        head.position.y = 1.9; group.add(head);
        const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const eyeGeo = new THREE.SphereGeometry(0.07);
        const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.15, 1.95, 0.3);
        const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(0.15, 1.95, 0.3);
        group.add(e1, e2);
        const armGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.9);
        const arm1 = new THREE.Mesh(armGeo, bodyMat); arm1.position.set(-0.6, 0.9, 0); arm1.rotation.z = 0.2;
        const arm2 = new THREE.Mesh(armGeo, bodyMat); arm2.position.set(0.6, 0.9, 0); arm2.rotation.z = -0.2;
        group.add(arm1, arm2);
    } else {
        hp = 40; speed = 4; damage = 10; barHeight = 1.0;
        eyeColor = 0xff0000;
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x332222, roughness: 0.9 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.2), bodyMat);
        body.position.y = 0.3; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.25), bodyMat);
        head.position.set(0, 0.4, 0.5); group.add(head);
        const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const eyeGeo = new THREE.SphereGeometry(0.05);
        const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.1, 0.45, 0.7);
        const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(0.1, 0.45, 0.7);
        group.add(e1, e2);
    }

    // Eye glow light
    const eyeLight = new THREE.PointLight(eyeColor, 0.6, 4);
    eyeLight.position.set(0, barHeight - 0.5, 0.3);
    group.add(eyeLight);

    // Health bar
    const hbGroup = new THREE.Group();
    const bgGeo = new THREE.PlaneGeometry(0.8, 0.08);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide, depthTest: false });
    const bg = new THREE.Mesh(bgGeo, bgMat); bg.renderOrder = 999;
    hbGroup.add(bg);
    const fgGeo = new THREE.PlaneGeometry(0.76, 0.05);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, depthTest: false });
    const fg = new THREE.Mesh(fgGeo, fgMat); fg.position.z = 0.001; fg.renderOrder = 1000;
    hbGroup.add(fg);
    hbGroup.position.y = barHeight;
    hbGroup.userData.fg = fg; hbGroup.userData.fgMat = fgMat;
    group.add(hbGroup);

    group.position.set(x, 0, z);
    group.userData = {
        isEnemy: true, type, state: 'patrol', health: hp, maxHealth: hp,
        speed, damage, attackCooldown: 0, lastGrowl: 0,
        healthBar: hbGroup, hitFlash: 0, dying: false, deathTime: 0,
        lastPosition: new THREE.Vector3(x, 0, z), stuckTime: 0,
        eyeColor, eyeLight
    };

    group.traverse(child => {
        if (child.isMesh && child.material.emissive) {
            child.userData.origEmissive = child.material.emissive.clone();
            child.userData.origEmissiveI = child.material.emissiveIntensity || 0;
        }
    });

    return group;
}

function damageEnemy(enemy, damage, knockbackDir) {
    if (enemy.userData.dying) return;
    enemy.userData.health -= damage;
    enemy.userData.hitFlash = 0.15;
    playHitSound();
    if (knockbackDir) {
        const kb = knockbackDir.clone(); kb.y = 0; kb.normalize().multiplyScalar(0.4);
        const next = enemy.position.clone().add(kb);
        if (!checkWallCollision(next)) enemy.position.add(kb);
    }
    if (enemy.userData.health <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
    enemy.userData.health = 0;
    enemy.userData.dying = true;
    enemy.userData.deathTime = 0;
    state.kills++;
    updateHUD();
    showMessage('Enemy killed!');
    spawnBloodParticles(enemy.position.clone().add(new THREE.Vector3(0, 1, 0)), 15);

    // Remove eye light
    if (enemy.userData.eyeLight) {
        enemy.userData.eyeLight.intensity = 0;
    }

    enemy.traverse(child => {
        if (child.isMesh) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.emissive = new THREE.Color(0xff0000);
            child.material.emissiveIntensity = 0.5;
        }
    });
}

function updateEnemies(delta) {
    const playerPos = camera.position.clone(); playerPos.y = 0;
    const time = Date.now() * 0.003;

    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0 && !enemy.userData.dying) return;

        // Death animation
        if (enemy.userData.dying) {
            enemy.userData.deathTime += delta;
            enemy.rotation.x = Math.min(Math.PI / 2, enemy.userData.deathTime * 3);
            const opacity = Math.max(0, 1 - enemy.userData.deathTime / 2);
            enemy.traverse(child => {
                if (child.isMesh && child.material.transparent) child.material.opacity = opacity;
            });
            // Death smoke
            if (enemy.userData.deathTime < 1.5 && Math.random() < 0.3) {
                const smokeGeo = new THREE.SphereGeometry(0.08, 4, 4);
                const smokeMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.4 });
                const smoke = new THREE.Mesh(smokeGeo, smokeMat);
                smoke.position.copy(enemy.position);
                smoke.position.y += Math.random() * 1.5;
                smoke.userData.velocity = new THREE.Vector3((Math.random()-0.5)*0.5, 1+Math.random(), (Math.random()-0.5)*0.5);
                smoke.userData.lifetime = 0.8; smoke.userData.maxLifetime = 0.8;
                smoke.userData.isParticle = true; smoke.userData.noGravity = true;
                addParticle(smoke);
            }
            if (enemy.userData.deathTime > 2.5) {
                scene.remove(enemy);
                enemy.userData.health = -999;
            }
            return;
        }

        if (enemy.userData.health <= 0) return;

        const enemyPos = enemy.position.clone(); enemyPos.y = 0;
        const dist = enemyPos.distanceTo(playerPos);

        // Pulsating eye glow
        if (enemy.userData.eyeLight) {
            const pulse = 0.4 + Math.sin(time + enemy.position.x * 3) * 0.3;
            enemy.userData.eyeLight.intensity = pulse;
        }

        // Smoke trail when chasing
        if (enemy.userData.state === 'chase' && Math.random() < 0.08) {
            const smokeGeo = new THREE.SphereGeometry(0.06, 4, 4);
            const smokeMat = new THREE.MeshBasicMaterial({ color: 0x181818, transparent: true, opacity: 0.3 });
            const smoke = new THREE.Mesh(smokeGeo, smokeMat);
            smoke.position.copy(enemy.position);
            smoke.position.y += 0.3;
            smoke.userData.velocity = new THREE.Vector3(0, 0.5, 0);
            smoke.userData.lifetime = 0.6; smoke.userData.maxLifetime = 0.6;
            smoke.userData.isParticle = true; smoke.userData.noGravity = true;
            addParticle(smoke);
        }

        // Hit flash
        if (enemy.userData.hitFlash > 0) {
            enemy.userData.hitFlash -= delta;
            enemy.traverse(child => {
                if (child.isMesh && child.material.emissive) {
                    if (enemy.userData.hitFlash > 0) {
                        child.material.emissive.set(0xff0000);
                        child.material.emissiveIntensity = 0.8;
                    } else if (child.userData.origEmissive) {
                        child.material.emissive.copy(child.userData.origEmissive);
                        child.material.emissiveIntensity = child.userData.origEmissiveI;
                    }
                }
            });
        }

        // Health bar update
        const hb = enemy.userData.healthBar;
        if (hb) {
            const pct = Math.max(0, enemy.userData.health / enemy.userData.maxHealth);
            hb.userData.fg.scale.x = pct;
            hb.userData.fg.position.x = -(1 - pct) * 0.38;
            const col = pct > 0.5 ? 0x00ff00 : pct > 0.25 ? 0xffff00 : 0xff0000;
            hb.userData.fgMat.color.setHex(col);
            hb.quaternion.copy(camera.quaternion);
            hb.visible = (dist < 20);
        }

        // Detection
        if (dist < 14) {
            enemy.userData.state = 'chase';
            if (Date.now() - enemy.userData.lastGrowl > 3000 + Math.random() * 2000) {
                playMonsterGrowl(enemy.userData.type);
                enemy.userData.lastGrowl = Date.now();
            }
        } else {
            enemy.userData.state = 'patrol';
        }

        // Movement
        if (enemy.userData.state === 'chase') {
            const dir = playerPos.clone().sub(enemyPos).normalize();
            const spd = enemy.userData.speed;
            const nextPos = enemy.position.clone().add(dir.clone().multiplyScalar(spd * delta));
            const moved = enemy.position.distanceTo(enemy.userData.lastPosition);
            if (moved < 0.01) {
                enemy.userData.stuckTime += delta;
                if (enemy.userData.stuckTime > 0.3) {
                    const side = new THREE.Vector3(-dir.z, 0, dir.x);
                    if (Math.random() > 0.5) side.negate();
                    const sidePos = enemy.position.clone().add(side.multiplyScalar(spd * delta * 2));
                    if (!checkWallCollision(sidePos)) enemy.position.copy(sidePos);
                    enemy.userData.stuckTime = 0;
                }
            } else { enemy.userData.stuckTime = 0; }
            enemy.userData.lastPosition.copy(enemy.position);
            if (!checkWallCollision(nextPos)) enemy.position.add(dir.multiplyScalar(spd * delta));
            enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);
        } else {
            if (Math.random() < 0.01) enemy.rotation.y += (Math.random() - 0.5) * Math.PI;
        }

        // Attack
        const atkRange = enemy.userData.type === 'tank' ? 2.0 : 1.5;
        if (dist < atkRange && enemy.userData.attackCooldown <= 0) {
            takeDamage(enemy.userData.damage, true);
            enemy.userData.attackCooldown = enemy.userData.type === 'tank' ? 1.5 : 1;
        }
        if (enemy.userData.attackCooldown > 0) enemy.userData.attackCooldown -= delta;

        // Bobbing
        const bobAmt = enemy.userData.type === 'crawler' ? 0.05 : 0.1;
        const bobSpd = enemy.userData.state === 'chase' ? 0.008 : 0.005;
        enemy.position.y = Math.sin(Date.now() * bobSpd) * bobAmt;
    });
}

function checkWallCollision(pos) {
    for (const wall of walls) {
        if (wall.userData.box && wall.userData.box.containsPoint(pos)) return true;
    }
    for (const door of doors) {
        if (!door.userData.isOpen && door.userData.box && door.userData.box.containsPoint(pos)) return true;
    }
    return false;
}

// ============ PLAYER ============
function takeDamage(amount, fromMonster) {
    state.health -= amount;
    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = '0.5';
    setTimeout(() => overlay.style.opacity = '0', 200);
    camera.position.x += (Math.random() - 0.5) * 0.2;
    camera.position.z += (Math.random() - 0.5) * 0.2;
    if (fromMonster) playMonsterAttack();
    updateHUD();
    if (state.health <= 0) gameOver(false);
}

function updatePlayer(delta) {
    if (!state.playing || state.gameOver) return;
    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();
    if (state.isMobile && joystickActive) { direction.z = -joystickDelta.y; direction.x = joystickDelta.x; }
    const speed = moveState.sprint ? SPRINT_SPEED : WALK_SPEED;
    if (direction.length() > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const moveDir = new THREE.Vector3();
        moveDir.addScaledVector(forward, direction.z);
        moveDir.addScaledVector(right, direction.x);
        moveDir.normalize();
        const nextPos = camera.position.clone().add(moveDir.clone().multiplyScalar(speed * delta));
        nextPos.y = PLAYER_HEIGHT;
        if (!checkPlayerCollision(nextPos)) camera.position.add(moveDir.multiplyScalar(speed * delta));
        const now = Date.now();
        const stepInterval = moveState.sprint ? 250 : 400;
        if (now - lastFootstepTime > stepInterval) { playFootstep(); lastFootstepTime = now; }
    }
    if (state.isMobile) camera.rotation.set(mobilePitch, mobileYaw, 0, 'YXZ');
    if (state.health < 30 && Date.now() - lastHeartbeatTime > 800) { playHeartbeat(); lastHeartbeatTime = Date.now(); }
    if (Date.now() - lastWhisperTime > 10000 + Math.random() * 15000) { playWhisper(); lastWhisperTime = Date.now(); }
    const lowHealthOverlay = document.getElementById('low-health-overlay');
    if (state.health < 30) { lowHealthOverlay.style.opacity = String(0.3 + Math.sin(Date.now() * 0.005) * 0.2); }
    else { lowHealthOverlay.style.opacity = '0'; }
    if (state.attackHeld) {
        state.attackCooldown -= delta;
        if (state.attackCooldown <= 0) {
            const def = weaponDefs[state.currentWeapon];
            if (def.auto) { fireCurrentWeapon(); state.attackCooldown = def.fireRate; }
        }
    } else {
        if (state.attackCooldown > 0) state.attackCooldown -= delta;
        if (weaponDefs[state.currentWeapon].isFlamethrower) stopFlameSound();
    }
}

function checkPlayerCollision(pos) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(0.5, PLAYER_HEIGHT, 0.5));
    for (const wall of walls) {
        if (wall.userData.box && playerBox.intersectsBox(wall.userData.box)) return true;
    }
    for (const door of doors) {
        if (!door.userData.isOpen && door.userData.box && playerBox.intersectsBox(door.userData.box)) return true;
    }
    return false;
}

// ============ INTERACTION ============
function checkInteraction() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    interactRaycaster.set(camera.position, dir);
    for (const kc of keycardObjects) {
        if (!kc.visible) continue;
        const hits = interactRaycaster.intersectObject(kc, true);
        if (hits.length > 0 && hits[0].distance < 3) return { type: 'keycard', object: kc };
    }
    for (const door of doors) {
        if (door.userData.isOpen) continue;
        const hits = interactRaycaster.intersectObject(door);
        if (hits.length > 0 && hits[0].distance < 3) return { type: 'door', object: door };
    }
    return null;
}

function interact() {
    const target = checkInteraction();
    if (!target) return;
    if (target.type === 'keycard') {
        const kc = target.object;
        state.keycards[kc.userData.color] = true;
        kc.visible = false;
        if (kc.userData.light) kc.userData.light.intensity = 0;
        playPickup();
        showMessage(`${kc.userData.color.toUpperCase()} KEYCARD COLLECTED!`);
        updateHUD();
    } else if (target.type === 'door') {
        const door = target.object;
        const keyReq = door.userData.keyRequired;
        if (keyReq === 'exit') {
            if (state.keycards.red && state.keycards.blue && state.keycards.green) {
                door.userData.isOpen = true; door.visible = false;
                playDoorCreak(); showMessage('EXIT UNLOCKED!');
                setTimeout(() => gameOver(true), 1000);
            } else { playDoorLocked(); showMessage('Need all 3 keycards to exit!'); }
        } else if (keyReq === null || state.keycards[keyReq]) {
            door.userData.isOpen = true; door.visible = false;
            playDoorCreak(); showMessage('Door opened');
        } else { playDoorLocked(); showMessage(`Need ${keyReq.toUpperCase()} KEYCARD!`); }
    }
}

// ============ HUD ============
function updateHUD() {
    const healthBar = document.getElementById('health-bar');
    const healthText = document.getElementById('health-text');
    healthBar.style.width = `${Math.max(0, state.health)}%`;
    if (state.health > 50) {
        healthBar.style.background = 'linear-gradient(90deg, #0a8, #0ff)';
        healthBar.style.boxShadow = '0 0 8px rgba(0,255,255,0.4)';
    } else if (state.health > 25) {
        healthBar.style.background = 'linear-gradient(90deg, #aa0, #ff0)';
        healthBar.style.boxShadow = '0 0 8px rgba(255,255,0,0.4)';
    } else {
        healthBar.style.background = 'linear-gradient(90deg, #a00, #f00)';
        healthBar.style.boxShadow = '0 0 8px rgba(255,0,0,0.4)';
    }
    healthText.textContent = `HP: ${Math.max(0, state.health)}`;
    document.getElementById('kc-red').classList.toggle('collected', state.keycards.red);
    document.getElementById('kc-blue').classList.toggle('collected', state.keycards.blue);
    document.getElementById('kc-green').classList.toggle('collected', state.keycards.green);
    const def = weaponDefs[state.currentWeapon];
    document.getElementById('weapon-name').textContent = def.name;
    document.getElementById('ammo-count').textContent = def.ammo >= 999 ? '∞' : def.ammo;
    document.getElementById('kill-counter').textContent = `KILLS: ${state.kills}`;
}

function showMessage(text) {
    const msg = document.getElementById('message');
    msg.textContent = text; msg.style.opacity = '1';
    setTimeout(() => msg.style.opacity = '0', 2000);
}

function updateInteractPrompt() {
    const prompt = document.getElementById('interact-prompt');
    const target = checkInteraction();
    prompt.style.display = target ? 'block' : 'none';
}

function updateMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#050a10'; ctx.fillRect(0, 0, W, H);
    const scale = W / (MAP_SIZE * CELL_SIZE);
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const cell = mapLayout[z][x];
            const cx = x * CELL_SIZE * scale, cz = z * CELL_SIZE * scale, cs = CELL_SIZE * scale;
            if (cell === '1') { ctx.fillStyle = '#1a2530'; ctx.fillRect(cx, cz, cs, cs); }
            else if (cell !== '1') { ctx.fillStyle = '#0a0f18'; ctx.fillRect(cx, cz, cs, cs); }
        }
    }
    for (const door of doors) {
        if (door.userData.isOpen) continue;
        const dx = door.position.x * scale, dz = door.position.z * scale;
        const k = door.userData.keyRequired;
        if (k === 'red') ctx.fillStyle = '#f44';
        else if (k === 'blue') ctx.fillStyle = '#44f';
        else if (k === 'green') ctx.fillStyle = '#4f4';
        else if (k === 'exit') ctx.fillStyle = '#fd0';
        else ctx.fillStyle = '#864';
        ctx.fillRect(dx - 2, dz - 2, 4, 4);
    }
    for (const kc of keycardObjects) {
        if (!kc.visible) continue;
        const kx = kc.position.x * scale, kz = kc.position.z * scale;
        const col = kc.userData.color;
        ctx.fillStyle = col === 'red' ? '#f00' : col === 'blue' ? '#00f' : '#0f0';
        ctx.beginPath(); ctx.arc(kx, kz, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    enemies.forEach(e => {
        if (e.userData.health > 0 && !e.userData.dying) {
            const t = e.userData.type;
            ctx.fillStyle = t === 'tank' ? '#f80' : t === 'fast' ? '#f0f' : '#f00';
            const r = t === 'tank' ? 3 : 2;
            ctx.beginPath(); ctx.arc(e.position.x * scale, e.position.z * scale, r, 0, Math.PI * 2); ctx.fill();
        }
    });
    const px = camera.position.x * scale, pz = camera.position.z * scale;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, -dir.z);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(angle);
    ctx.fillStyle = '#0ff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#088'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
}

// ============ JUMP SCARES ============
let jumpScareRooms = new Set();
function checkJumpScare() {
    const cellX = Math.floor(camera.position.x / CELL_SIZE);
    const cellZ = Math.floor(camera.position.z / CELL_SIZE);
    const cellKey = `${cellX},${cellZ}`;
    if (!jumpScareRooms.has(cellKey) && Math.random() < 0.02) {
        jumpScareRooms.add(cellKey);
        triggerJumpScare();
    }
}

function triggerJumpScare() {
    playJumpScare();
    const overlay = document.getElementById('jumpscare-overlay');
    overlay.style.display = 'flex'; overlay.style.opacity = '1';
    const shake = setInterval(() => { camera.rotation.z = (Math.random() - 0.5) * 0.1; }, 50);
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 300);
        clearInterval(shake); camera.rotation.z = 0;
    }, 300);
}

// ============ FLICKERING LIGHTS & ENV ============
function updateLights() {
    scene.traverse(obj => {
        if (obj.userData.flicker && obj.isLight) {
            if (Math.random() < 0.05) {
                obj.intensity = Math.random() < 0.3 ? 0 : obj.userData.baseIntensity * (0.5 + Math.random() * 0.5);
            }
        }
    });

    // Monitor flicker
    const time = Date.now() * 0.001;
    for (const m of monitors) {
        m.time += 0.016;
        if (Math.random() < 0.02) {
            m.mat.emissiveIntensity = Math.random() < 0.3 ? 0.05 : 0.3;
        }
    }

    // Spark panels
    for (const sp of sparkPanels) {
        sp.timer -= 0.016;
        if (sp.timer <= 0) {
            sp.light.intensity = 2 + Math.random() * 3;
            sp.timer = 1 + Math.random() * 4;
            // Spawn spark particles
            for (let i = 0; i < 3; i++) {
                const geo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
                const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1 });
                const spark = new THREE.Mesh(geo, mat);
                spark.position.copy(sp.pos);
                spark.userData.velocity = new THREE.Vector3(
                    (Math.random()-0.5)*3, Math.random()*2-1, (Math.random()-0.5)*3
                );
                spark.userData.lifetime = 0.3 + Math.random()*0.3;
                spark.userData.maxLifetime = spark.userData.lifetime;
                spark.userData.isParticle = true;
                addParticle(spark);
            }
        } else {
            sp.light.intensity *= 0.9;
        }
    }
}

// ============ GAME STATE ============
function startGame() {
    state.playing = true; state.startTime = Date.now();
    state.gameOver = false; state.health = 100;
    state.keycards = { red: false, blue: false, green: false };
    state.kills = 0; state.currentWeapon = 0;
    weaponDefs[0].ammo = 999; weaponDefs[1].ammo = 50;
    weaponDefs[2].ammo = 300; weaponDefs[3].ammo = 500; weaponDefs[4].ammo = 20;
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    if (state.isMobile) document.body.classList.add('mobile-visible');
    else controls.lock();
    playAmbientDrone();
    updateHUD();
}

function gameOver(won) {
    state.gameOver = true; state.won = won; state.playing = false;
    stopFlameSound();
    if (state.isMobile) document.body.classList.remove('mobile-visible');
    else controls.unlock();
    document.getElementById('hud').style.display = 'none';
    if (won) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
        document.getElementById('victory-stats').innerHTML = `
            Time: ${mins}:${secs.toString().padStart(2, '0')}<br>
            Health: ${state.health}%<br>
            Kills: ${state.kills}
        `;
        document.getElementById('victory-screen').style.display = 'flex';
    } else {
        document.getElementById('death-screen').style.display = 'flex';
    }
}

function restartGame() { location.reload(); }

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    document.getElementById('title-screen').addEventListener('click', () => { if (!state.playing) startGame(); });
    document.getElementById('title-screen').addEventListener('touchend', e => { e.preventDefault(); if (!state.playing) startGame(); });
    controls.addEventListener('lock', () => { if (!state.playing) startGame(); });

    document.addEventListener('keydown', e => {
        if (!state.playing) return;
        switch (e.code) {
            case 'KeyW': moveState.forward = true; break;
            case 'KeyS': moveState.backward = true; break;
            case 'KeyA': moveState.left = true; break;
            case 'KeyD': moveState.right = true; break;
            case 'ShiftLeft': moveState.sprint = true; break;
            case 'KeyF': toggleFlashlight(); break;
            case 'KeyE': interact(); break;
            case 'Digit1': switchWeapon(0); break;
            case 'Digit2': switchWeapon(1); break;
            case 'Digit3': switchWeapon(2); break;
            case 'Digit4': switchWeapon(3); break;
            case 'Digit5': switchWeapon(4); break;
        }
    });

    document.addEventListener('keyup', e => {
        switch (e.code) {
            case 'KeyW': moveState.forward = false; break;
            case 'KeyS': moveState.backward = false; break;
            case 'KeyA': moveState.left = false; break;
            case 'KeyD': moveState.right = false; break;
            case 'ShiftLeft': moveState.sprint = false; break;
        }
    });

    document.addEventListener('mousedown', e => {
        if (!state.playing || state.gameOver) return;
        if (e.button === 0 && controls.isLocked) {
            state.attackHeld = true;
            if (state.attackCooldown <= 0) {
                fireCurrentWeapon();
                state.attackCooldown = weaponDefs[state.currentWeapon].fireRate;
            }
        }
    });

    document.addEventListener('mouseup', e => {
        if (e.button === 0) {
            state.attackHeld = false;
            if (weaponDefs[state.currentWeapon].isFlamethrower) stopFlameSound();
        }
    });

    document.getElementById('restart-death').addEventListener('click', restartGame);
    document.getElementById('restart-victory').addEventListener('click', restartGame);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    if (state.isMobile) setupMobileControls();
}

function toggleFlashlight() {
    state.flashlightOn = !state.flashlightOn;
    flashlight.intensity = state.flashlightOn ? 4 : 0;
    showMessage(state.flashlightOn ? 'Flashlight ON' : 'Flashlight OFF');
}

function setupMobileControls() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickThumb = document.getElementById('joystick-thumb');
    const lookZone = document.getElementById('look-zone');

    joystickZone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        joystickStartPos.x = touch.clientX; joystickStartPos.y = touch.clientY;
        joystickActive = true;
    }, { passive: false });

    lookZone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        lookTouchId = touch.identifier;
        lookLastPos.x = touch.clientX; lookLastPos.y = touch.clientY;
        lookStartY = touch.clientY;
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (!state.playing) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                e.preventDefault();
                const maxDist = 50;
                let dx = touch.clientX - joystickStartPos.x;
                let dy = touch.clientY - joystickStartPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
                joystickDelta.x = dx / maxDist; joystickDelta.y = dy / maxDist;
                joystickThumb.style.transform = `translate(${dx}px, ${-dy}px)`;
            }
            if (touch.identifier === lookTouchId) {
                e.preventDefault();
                const dx = touch.clientX - lookLastPos.x;
                const dy = touch.clientY - lookLastPos.y;
                mobileYaw -= dx * 0.004;
                mobilePitch -= dy * 0.004;
                mobilePitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, mobilePitch));
                lookLastPos.x = touch.clientX; lookLastPos.y = touch.clientY;
            }
        }
    }, { passive: false });

    document.addEventListener('touchend', e => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                joystickTouchId = null; joystickActive = false;
                joystickDelta.x = 0; joystickDelta.y = 0;
                joystickThumb.style.transform = 'translate(0, 0)';
            }
            if (touch.identifier === lookTouchId) {
                const dy = touch.clientY - lookStartY;
                if (dy < -60) switchWeapon((state.currentWeapon + 1) % weaponDefs.length);
                lookTouchId = null;
            }
        }
    });

    document.addEventListener('touchcancel', e => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                joystickTouchId = null; joystickActive = false;
                joystickDelta.x = 0; joystickDelta.y = 0;
                joystickThumb.style.transform = 'translate(0, 0)';
            }
            if (touch.identifier === lookTouchId) lookTouchId = null;
        }
    });

    document.getElementById('btn-attack').addEventListener('touchstart', e => {
        e.preventDefault();
        state.attackHeld = true;
        if (state.attackCooldown <= 0) {
            fireCurrentWeapon();
            state.attackCooldown = weaponDefs[state.currentWeapon].fireRate;
        }
    }, { passive: false });

    document.getElementById('btn-attack').addEventListener('touchend', () => {
        state.attackHeld = false;
        if (weaponDefs[state.currentWeapon].isFlamethrower) stopFlameSound();
    });

    document.getElementById('btn-interact').addEventListener('touchstart', e => {
        e.preventDefault(); interact();
    }, { passive: false });

    document.getElementById('btn-flashlight').addEventListener('touchstart', e => {
        e.preventDefault(); toggleFlashlight();
    }, { passive: false });

    document.getElementById('btn-sprint').addEventListener('touchstart', e => {
        e.preventDefault(); moveState.sprint = true;
    }, { passive: false });
    document.getElementById('btn-sprint').addEventListener('touchend', () => { moveState.sprint = false; });

    document.getElementById('btn-weapon').addEventListener('touchstart', e => {
        e.preventDefault();
        switchWeapon((state.currentWeapon + 1) % weaponDefs.length);
    }, { passive: false });
}

// ============ ANIMATION LOOP ============
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (state.playing && !state.gameOver) {
        updatePlayer(delta);
        updateEnemies(delta);
        updateWeapon(delta);
        updateParticles(delta);
        updateGrenades(delta);
        updateEffects(delta);
        updateLights();
        updateInteractPrompt();
        updateMinimap();
        checkJumpScare();
        keycardObjects.forEach(kc => {
            if (kc.visible) {
                kc.rotation.y += delta * 2;
                kc.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;
            }
        });
    }
    composer.render();
}

// ============ START ============
init();
animate();

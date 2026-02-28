// BioLab: Containment Breach - 3D Horror Game
// Using Three.js for browser-based 3D

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============ GAME STATE ============
const state = {
    playing: false,
    health: 100,
    keycards: { red: false, blue: false, green: false },
    flashlightOn: true,
    startTime: 0,
    isMobile: false,
    gameOver: false,
    won: false
};

// ============ THREE.JS SETUP ============
let scene, camera, renderer, controls;
let flashlight, flashlightTarget;
let clock = new THREE.Clock();
let audioContext, masterGain;

// Movement
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };
const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const PLAYER_HEIGHT = 1.7;

// Map and objects
let walls = [];
let doors = [];
let keycardObjects = [];
let enemies = [];
let interactables = [];
let exitDoor = null;

// Raycasting
const raycaster = new THREE.Raycaster();
const interactRaycaster = new THREE.Raycaster();

// Mobile controls
let joystickActive = false;
let joystickStart = { x: 0, y: 0 };
let joystickDelta = { x: 0, y: 0 };
let lookStart = { x: 0, y: 0 };
let lookActive = false;

// ============ MAP DEFINITION ============
// 0 = empty, 1 = wall, 2 = door, 3 = red door, 4 = blue door, 5 = green door, 6 = exit
// K = keycard spawn, S = start, E = enemy spawn
const MAP_SIZE = 20;
const CELL_SIZE = 4;

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
}

function playTone(freq, duration, type = 'sine', volume = 0.3) {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
}

function playFootstep() {
    playTone(80 + Math.random() * 40, 0.05, 'square', 0.1);
}

function playPickup() {
    playTone(880, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(1100, 0.1, 'sine', 0.2), 100);
}

function playDoorOpen() {
    playTone(150, 0.3, 'sawtooth', 0.2);
}

function playDoorLocked() {
    playTone(100, 0.1, 'square', 0.3);
    setTimeout(() => playTone(80, 0.1, 'square', 0.3), 150);
}

function playMonsterGrowl() {
    playTone(60 + Math.random() * 30, 0.5, 'sawtooth', 0.4);
}

function playJumpScare() {
    playTone(200, 0.5, 'sawtooth', 0.8);
    playTone(400, 0.3, 'square', 0.6);
}

function playHeartbeat() {
    playTone(40, 0.1, 'sine', 0.3);
    setTimeout(() => playTone(50, 0.15, 'sine', 0.2), 150);
}

function playAmbientDrone() {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 30;
    filter.type = 'lowpass';
    filter.frequency.value = 100;
    gain.gain.value = 0.1;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start();
    return { osc, gain };
}

// ============ INITIALIZATION ============
function init() {
    // Detect mobile
    state.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 1, 25);
    
    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(CELL_SIZE * 1.5, PLAYER_HEIGHT, CELL_SIZE * 1.5);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Controls
    controls = new PointerLockControls(camera, document.body);
    
    // Lighting
    const ambient = new THREE.AmbientLight(0x111111, 0.3);
    scene.add(ambient);
    
    // Flashlight
    flashlight = new THREE.SpotLight(0xffffcc, 2, 20, Math.PI / 6, 0.5, 1);
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
    
    // Build map
    buildMap();
    
    // Spawn enemies
    spawnEnemies();
    
    // Event listeners
    setupEventListeners();
    
    // Hide loading
    document.getElementById('loading').style.display = 'none';
    
    // Audio
    initAudio();
}

// ============ MAP BUILDING ============
function buildMap() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * CELL_SIZE, MAP_SIZE * CELL_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222,
        roughness: 0.9,
        metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_SIZE * CELL_SIZE / 2, 0, MAP_SIZE * CELL_SIZE / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Ceiling
    const ceilingMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.95
    });
    const ceiling = new THREE.Mesh(floorGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(MAP_SIZE * CELL_SIZE / 2, 3, MAP_SIZE * CELL_SIZE / 2);
    scene.add(ceiling);
    
    // Wall material
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x2a3a2a,
        roughness: 0.8
    });
    
    // Parse map
    let keycardIndex = 0;
    const keycardColors = ['red', 'blue', 'green'];
    
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const cell = mapLayout[z][x];
            const posX = x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = z * CELL_SIZE + CELL_SIZE / 2;
            
            if (cell === '1') {
                // Wall
                const wall = createWall(posX, posZ, wallMat);
                walls.push(wall);
                scene.add(wall);
            } else if (cell === '2') {
                // Normal door
                const door = createDoor(posX, posZ, 0x8B4513, null);
                doors.push(door);
                scene.add(door);
            } else if (cell === '3') {
                // Red door
                const door = createDoor(posX, posZ, 0xff0000, 'red');
                doors.push(door);
                scene.add(door);
            } else if (cell === '4') {
                // Blue door
                const door = createDoor(posX, posZ, 0x0000ff, 'blue');
                doors.push(door);
                scene.add(door);
            } else if (cell === '5') {
                // Green door
                const door = createDoor(posX, posZ, 0x00ff00, 'green');
                doors.push(door);
                scene.add(door);
            } else if (cell === '6') {
                // Exit door
                exitDoor = createDoor(posX, posZ, 0xffd700, 'exit');
                doors.push(exitDoor);
                scene.add(exitDoor);
            } else if (cell === 'K') {
                // Keycard
                if (keycardIndex < 3) {
                    const kc = createKeycard(posX, posZ, keycardColors[keycardIndex]);
                    keycardObjects.push(kc);
                    scene.add(kc);
                    keycardIndex++;
                }
            } else if (cell === 'S') {
                // Start position
                camera.position.set(posX, PLAYER_HEIGHT, posZ);
            }
            
            // Random flickering lights
            if (cell === ' ' && Math.random() < 0.1) {
                const light = createFlickeringLight(posX, posZ);
                scene.add(light);
            }
            
            // Random blood splatter
            if (cell === ' ' && Math.random() < 0.08) {
                const blood = createBloodSplatter(posX, posZ);
                scene.add(blood);
            }
        }
    }
}

function createWall(x, z, material) {
    const geo = new THREE.BoxGeometry(CELL_SIZE, 3, CELL_SIZE);
    const wall = new THREE.Mesh(geo, material);
    wall.position.set(x, 1.5, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    
    // Collision box
    wall.userData.isWall = true;
    wall.userData.box = new THREE.Box3().setFromObject(wall);
    
    return wall;
}

function createDoor(x, z, color, keyRequired) {
    const geo = new THREE.BoxGeometry(CELL_SIZE * 0.8, 2.5, 0.2);
    const mat = new THREE.MeshStandardMaterial({ 
        color: color,
        emissive: color,
        emissiveIntensity: 0.2
    });
    const door = new THREE.Mesh(geo, mat);
    door.position.set(x, 1.25, z);
    door.castShadow = true;
    
    door.userData.isDoor = true;
    door.userData.keyRequired = keyRequired;
    door.userData.isOpen = false;
    door.userData.box = new THREE.Box3().setFromObject(door);
    
    interactables.push(door);
    
    return door;
}

function createKeycard(x, z, color) {
    const geo = new THREE.BoxGeometry(0.3, 0.02, 0.2);
    const colorHex = color === 'red' ? 0xff0000 : color === 'blue' ? 0x0000ff : 0x00ff00;
    const mat = new THREE.MeshStandardMaterial({ 
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.5
    });
    const kc = new THREE.Mesh(geo, mat);
    kc.position.set(x, 0.5, z);
    
    // Glow effect
    const glowGeo = new THREE.SphereGeometry(0.3);
    const glowMat = new THREE.MeshBasicMaterial({ 
        color: colorHex, 
        transparent: true, 
        opacity: 0.2 
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    kc.add(glow);
    
    kc.userData.isKeycard = true;
    kc.userData.color = color;
    
    interactables.push(kc);
    
    return kc;
}

function createFlickeringLight(x, z) {
    const light = new THREE.PointLight(0xffaa00, 0.5, 8);
    light.position.set(x, 2.5, z);
    light.userData.flicker = true;
    light.userData.baseIntensity = 0.5;
    return light;
}

function createBloodSplatter(x, z) {
    const geo = new THREE.PlaneGeometry(1 + Math.random(), 0.5 + Math.random() * 0.5);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x440000,
        transparent: true,
        opacity: 0.7
    });
    const blood = new THREE.Mesh(geo, mat);
    blood.rotation.x = -Math.PI / 2;
    blood.position.set(x + (Math.random() - 0.5) * 2, 0.01, z + (Math.random() - 0.5) * 2);
    return blood;
}

// ============ ENEMIES ============
function spawnEnemies() {
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (mapLayout[z][x] === 'E') {
                const posX = x * CELL_SIZE + CELL_SIZE / 2;
                const posZ = z * CELL_SIZE + CELL_SIZE / 2;
                
                const type = Math.random() < 0.5 ? 'crawler' : 'stalker';
                const enemy = createEnemy(posX, posZ, type);
                enemies.push(enemy);
                scene.add(enemy);
            }
        }
    }
}

function createEnemy(x, z, type) {
    const group = new THREE.Group();
    
    if (type === 'crawler') {
        // Low, fast creature
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.4, 1.2);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x332222, roughness: 0.9 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.3;
        group.add(body);
        
        // Head
        const headGeo = new THREE.SphereGeometry(0.25);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.set(0, 0.4, 0.5);
        group.add(head);
        
        // Eyes (glowing)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const eyeGeo = new THREE.SphereGeometry(0.05);
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(-0.1, 0.45, 0.7);
        eye2.position.set(0.1, 0.45, 0.7);
        group.add(eye1, eye2);
        
        group.userData.speed = 4;
        group.userData.damage = 15;
    } else {
        // Humanoid stalker
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.5);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.8 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75;
        group.add(body);
        
        // Head
        const headGeo = new THREE.SphereGeometry(0.3);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 1.7;
        group.add(head);
        
        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const eyeGeo = new THREE.SphereGeometry(0.06);
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(-0.12, 1.75, 0.25);
        eye2.position.set(0.12, 1.75, 0.25);
        group.add(eye1, eye2);
        
        group.userData.speed = 2;
        group.userData.damage = 25;
    }
    
    group.position.set(x, 0, z);
    group.userData.isEnemy = true;
    group.userData.type = type;
    group.userData.state = 'patrol';
    group.userData.health = 100;
    group.userData.attackCooldown = 0;
    group.userData.lastGrowl = 0;
    
    return group;
}

function updateEnemies(delta) {
    const playerPos = camera.position.clone();
    playerPos.y = 0;
    
    enemies.forEach((enemy, index) => {
        if (enemy.userData.health <= 0) return;
        
        const enemyPos = enemy.position.clone();
        enemyPos.y = 0;
        const dist = enemyPos.distanceTo(playerPos);
        
        // Detection
        if (dist < 12) {
            enemy.userData.state = 'chase';
            
            // Growl
            if (Date.now() - enemy.userData.lastGrowl > 3000) {
                playMonsterGrowl();
                enemy.userData.lastGrowl = Date.now();
            }
        } else {
            enemy.userData.state = 'patrol';
        }
        
        // Movement
        if (enemy.userData.state === 'chase') {
            const dir = playerPos.clone().sub(enemyPos).normalize();
            
            // Simple wall avoidance
            const nextPos = enemy.position.clone().add(dir.clone().multiplyScalar(enemy.userData.speed * delta));
            if (!checkWallCollision(nextPos)) {
                enemy.position.add(dir.multiplyScalar(enemy.userData.speed * delta));
            }
            
            // Look at player
            enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);
        } else {
            // Patrol - wander randomly
            if (Math.random() < 0.01) {
                enemy.rotation.y += (Math.random() - 0.5) * Math.PI;
            }
        }
        
        // Attack
        if (dist < 1.5 && enemy.userData.attackCooldown <= 0) {
            takeDamage(enemy.userData.damage);
            enemy.userData.attackCooldown = 1;
        }
        
        if (enemy.userData.attackCooldown > 0) {
            enemy.userData.attackCooldown -= delta;
        }
        
        // Bobbing animation
        enemy.position.y = Math.sin(Date.now() * 0.005) * 0.1;
    });
}

function checkWallCollision(pos) {
    for (const wall of walls) {
        const box = wall.userData.box;
        if (box && box.containsPoint(pos)) {
            return true;
        }
    }
    return false;
}

// ============ PLAYER ============
function takeDamage(amount) {
    state.health -= amount;
    
    // Flash red
    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = '0.5';
    setTimeout(() => overlay.style.opacity = '0', 200);
    
    // Screen shake
    camera.position.x += (Math.random() - 0.5) * 0.2;
    camera.position.z += (Math.random() - 0.5) * 0.2;
    
    updateHUD();
    
    if (state.health <= 0) {
        gameOver(false);
    }
}

function updatePlayer(delta) {
    if (!state.playing || state.gameOver) return;
    
    // Movement direction
    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();
    
    // Apply joystick on mobile
    if (state.isMobile && joystickActive) {
        direction.z = -joystickDelta.y;
        direction.x = joystickDelta.x;
    }
    
    // Speed
    const speed = moveState.sprint ? SPRINT_SPEED : WALK_SPEED;
    
    // Movement
    if (direction.length() > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        
        const moveDir = new THREE.Vector3();
        moveDir.addScaledVector(forward, direction.z);
        moveDir.addScaledVector(right, direction.x);
        moveDir.normalize();
        
        // Check collision
        const nextPos = camera.position.clone().add(moveDir.clone().multiplyScalar(speed * delta));
        nextPos.y = PLAYER_HEIGHT;
        
        if (!checkPlayerCollision(nextPos)) {
            camera.position.add(moveDir.multiplyScalar(speed * delta));
        }
        
        // Footsteps
        if (Math.random() < 0.1) {
            playFootstep();
        }
    }
    
    // Heartbeat when low health
    if (state.health < 30 && Math.random() < 0.02) {
        playHeartbeat();
    }
    
    // Low health overlay
    const lowHealthOverlay = document.getElementById('low-health-overlay');
    if (state.health < 30) {
        lowHealthOverlay.style.opacity = String(0.3 + Math.sin(Date.now() * 0.005) * 0.2);
    } else {
        lowHealthOverlay.style.opacity = '0';
    }
}

function checkPlayerCollision(pos) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        pos,
        new THREE.Vector3(0.5, PLAYER_HEIGHT, 0.5)
    );
    
    // Walls
    for (const wall of walls) {
        if (wall.userData.box && playerBox.intersectsBox(wall.userData.box)) {
            return true;
        }
    }
    
    // Closed doors
    for (const door of doors) {
        if (!door.userData.isOpen && door.userData.box && playerBox.intersectsBox(door.userData.box)) {
            return true;
        }
    }
    
    return false;
}

// ============ INTERACTION ============
function checkInteraction() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    
    interactRaycaster.set(camera.position, dir);
    
    // Check keycards
    for (const kc of keycardObjects) {
        if (!kc.visible) continue;
        const intersects = interactRaycaster.intersectObject(kc, true);
        if (intersects.length > 0 && intersects[0].distance < 3) {
            return { type: 'keycard', object: kc };
        }
    }
    
    // Check doors
    for (const door of doors) {
        if (door.userData.isOpen) continue;
        const intersects = interactRaycaster.intersectObject(door);
        if (intersects.length > 0 && intersects[0].distance < 3) {
            return { type: 'door', object: door };
        }
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
        playPickup();
        showMessage(`${kc.userData.color.toUpperCase()} KEYCARD COLLECTED!`);
        updateHUD();
    } else if (target.type === 'door') {
        const door = target.object;
        const keyReq = door.userData.keyRequired;
        
        if (keyReq === 'exit') {
            // Check all keycards
            if (state.keycards.red && state.keycards.blue && state.keycards.green) {
                door.userData.isOpen = true;
                door.visible = false;
                playDoorOpen();
                showMessage('EXIT UNLOCKED!');
                setTimeout(() => gameOver(true), 1000);
            } else {
                playDoorLocked();
                showMessage('Need all 3 keycards to exit!');
            }
        } else if (keyReq === null || state.keycards[keyReq]) {
            door.userData.isOpen = true;
            door.visible = false;
            playDoorOpen();
            showMessage('Door opened');
        } else {
            playDoorLocked();
            showMessage(`Need ${keyReq.toUpperCase()} KEYCARD!`);
        }
    }
}

// ============ HUD ============
function updateHUD() {
    // Health
    const healthBar = document.getElementById('health-bar');
    const healthText = document.getElementById('health-text');
    healthBar.style.width = `${state.health}%`;
    healthBar.style.backgroundColor = state.health > 50 ? '#0f0' : state.health > 25 ? '#ff0' : '#f00';
    healthText.textContent = `HP: ${Math.max(0, state.health)}`;
    
    // Keycards
    document.getElementById('kc-red').classList.toggle('collected', state.keycards.red);
    document.getElementById('kc-blue').classList.toggle('collected', state.keycards.blue);
    document.getElementById('kc-green').classList.toggle('collected', state.keycards.green);
}

function showMessage(text) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.style.opacity = '1';
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
    
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 150, 150);
    
    const scale = 150 / (MAP_SIZE * CELL_SIZE);
    
    // Draw walls
    ctx.fillStyle = '#333';
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (mapLayout[z][x] === '1') {
                ctx.fillRect(x * CELL_SIZE * scale, z * CELL_SIZE * scale, CELL_SIZE * scale, CELL_SIZE * scale);
            }
        }
    }
    
    // Draw player
    ctx.fillStyle = '#0f0';
    const px = camera.position.x * scale;
    const pz = camera.position.z * scale;
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw enemies
    ctx.fillStyle = '#f00';
    enemies.forEach(e => {
        if (e.userData.health > 0) {
            ctx.beginPath();
            ctx.arc(e.position.x * scale, e.position.z * scale, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
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
    overlay.style.opacity = '1';
    
    // Screen shake
    const shake = setInterval(() => {
        camera.rotation.z = (Math.random() - 0.5) * 0.1;
    }, 50);
    
    setTimeout(() => {
        overlay.style.opacity = '0';
        clearInterval(shake);
        camera.rotation.z = 0;
    }, 300);
}

// ============ FLICKERING LIGHTS ============
function updateLights() {
    scene.traverse(obj => {
        if (obj.userData.flicker && obj.isLight) {
            if (Math.random() < 0.05) {
                obj.intensity = Math.random() < 0.3 ? 0 : obj.userData.baseIntensity * (0.5 + Math.random() * 0.5);
            }
        }
    });
}

// ============ GAME STATE ============
function startGame() {
    state.playing = true;
    state.startTime = Date.now();
    state.gameOver = false;
    state.health = 100;
    state.keycards = { red: false, blue: false, green: false };
    
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    
    if (state.isMobile) {
        document.getElementById('mobile-controls').style.display = 'block';
    } else {
        controls.lock();
    }
    
    playAmbientDrone();
    updateHUD();
}

function gameOver(won) {
    state.gameOver = true;
    state.won = won;
    state.playing = false;
    
    if (state.isMobile) {
        document.getElementById('mobile-controls').style.display = 'none';
    } else {
        controls.unlock();
    }
    
    document.getElementById('hud').style.display = 'none';
    
    if (won) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        document.getElementById('victory-stats').innerHTML = `
            Time: ${mins}:${secs.toString().padStart(2, '0')}<br>
            Health: ${state.health}%
        `;
        document.getElementById('victory-screen').style.display = 'flex';
    } else {
        document.getElementById('death-screen').style.display = 'flex';
    }
}

function restartGame() {
    location.reload();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Pointer lock
    document.getElementById('title-screen').addEventListener('click', () => {
        if (!state.playing) startGame();
    });
    
    controls.addEventListener('lock', () => {
        if (!state.playing) startGame();
    });
    
    // Keyboard
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
    
    // Restart buttons
    document.getElementById('restart-death').addEventListener('click', restartGame);
    document.getElementById('restart-victory').addEventListener('click', restartGame);
    
    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Mobile controls
    if (state.isMobile) {
        setupMobileControls();
    }
}

function toggleFlashlight() {
    state.flashlightOn = !state.flashlightOn;
    flashlight.intensity = state.flashlightOn ? 2 : 0;
    showMessage(state.flashlightOn ? 'Flashlight ON' : 'Flashlight OFF');
}

function setupMobileControls() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickThumb = document.getElementById('joystick-thumb');
    const lookZone = document.getElementById('look-zone');
    
    // Joystick
    joystickZone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.touches[0];
        joystickStart.x = touch.clientX;
        joystickStart.y = touch.clientY;
        joystickActive = true;
    });
    
    joystickZone.addEventListener('touchmove', e => {
        e.preventDefault();
        if (!joystickActive) return;
        const touch = e.touches[0];
        const maxDist = 40;
        let dx = touch.clientX - joystickStart.x;
        let dy = touch.clientY - joystickStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
        }
        joystickDelta.x = dx / maxDist;
        joystickDelta.y = dy / maxDist;
        joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    
    joystickZone.addEventListener('touchend', () => {
        joystickActive = false;
        joystickDelta.x = 0;
        joystickDelta.y = 0;
        joystickThumb.style.transform = 'translate(0, 0)';
    });
    
    // Look
    lookZone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.touches[0];
        lookStart.x = touch.clientX;
        lookStart.y = touch.clientY;
        lookActive = true;
    });
    
    lookZone.addEventListener('touchmove', e => {
        e.preventDefault();
        if (!lookActive) return;
        const touch = e.touches[0];
        const dx = touch.clientX - lookStart.x;
        const dy = touch.clientY - lookStart.y;
        camera.rotation.y -= dx * 0.005;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x - dy * 0.005));
        lookStart.x = touch.clientX;
        lookStart.y = touch.clientY;
    });
    
    lookZone.addEventListener('touchend', () => {
        lookActive = false;
    });
    
    // Buttons
    document.getElementById('btn-interact').addEventListener('touchstart', e => {
        e.preventDefault();
        interact();
    });
    
    document.getElementById('btn-flashlight').addEventListener('touchstart', e => {
        e.preventDefault();
        toggleFlashlight();
    });
    
    document.getElementById('btn-sprint').addEventListener('touchstart', e => {
        e.preventDefault();
        moveState.sprint = true;
    });
    
    document.getElementById('btn-sprint').addEventListener('touchend', () => {
        moveState.sprint = false;
    });
}

// ============ ANIMATION LOOP ============
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    if (state.playing && !state.gameOver) {
        updatePlayer(delta);
        updateEnemies(delta);
        updateLights();
        updateInteractPrompt();
        updateMinimap();
        checkJumpScare();
        
        // Keycard rotation
        keycardObjects.forEach(kc => {
            if (kc.visible) {
                kc.rotation.y += delta * 2;
                kc.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;
            }
        });
    }
    
    renderer.render(scene, camera);
}

// ============ START ============
init();
animate();

import * as THREE from './vendor/three.mjs';
import { OrbitControls } from './vendor/OrbitControls.mjs';
import { axisVector, calculate, forward, interpolateSegment, pathDuration, pathSegmentAt, makeJoint, preset, rootJointConstraint, sampleWorkspace, collisionReason, safeMotion } from './core.mjs';
import { robotLessons, jointRole, explainJoint } from './education.mjs';
import { createGameLevel, gameScore, gameStarsFromScore, recordGameStarStreak } from './game.mjs';

const $ = id => document.getElementById(id);
const number = (value, digits = 1) => Number(value).toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const icons = () => window.lucide?.createIcons();
const escapeText = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const unit = joint => joint.type === 'R' ? '°' : 'mm';
const effortUnit = joint => joint.type === 'R' ? 'N·m' : 'N';
const palette = {
    primary: '#4827AF', secondary: '#FF4208', anthracite: '#29282E', black: '#000000', white: '#FFFFFF',
    scene: '#f0eef5', floor: '#eceaf0', steel: '#c3c0cb', body: '#eceaf0', guide: '#817b8c',
};
const names = { articulated: 'Artikulált ipari kar', scara: 'SCARA', cartesian: 'Kartéziánus robot', cylindrical: 'Hengerkoordinátás robot', polar: 'Poláris robot', lift: 'Lineáris emelő', cobot: 'Redundáns robotkar', delta: 'Delta robot', custom: 'Saját robot' };
let joints = preset('articulated');
let initialJoints = structuredClone(joints);
let modelName = 'articulated';
let payload = 1;
let selectedJoint = -1;
let mathJoint = 0;
let teachingJoint = 0;
let hoveredJoint = -1;
let points = [];
let movement = 'manual';
let velocities = [];
let accelerations = [];
let demoTime = 0;
let demoOrigin = [];
let elapsed = 0;
let pathPlaying = false;
let result;
let dirty = true;
let toastTimer;
let scene, camera, renderer, orbit, robotGroup, workspace, pathLine, tcpAxes, gripper, tcpMarker, deltaPlatform;
let meshes = [];
let gantryParts;
let liftTable;
let lastTime = performance.now();
let oldTip;
let speed = 0;
const workSize = 0.08;
let workHeld = false;
let workVelocity = 0;
let workEnabled = false;
let workDelivered = false;
let cellEnabled = false;
let workMesh, conveyorA, conveyorB, machineBed;
let cellGroup;
let gameModeEnabled = false;
let gameRoomGroup, gameLevelGroup, gameButtonCap;
let gameSession = null;
let gameLevelData = createGameLevel(1);
let lastGameHudUpdate = 0;
let gameSavedRobot = null;
let gameConfettiTimer;
const gameFurniture = [
    { name: 'polc', x: -1.18, y: 0.35, z: 0.72, width: 0.28, depth: 0.78, height: 1.44, color: '#527b70' },
    { name: 'szekrény', x: -0.72, y: 1.12, z: 0.58, width: 0.52, depth: 0.34, height: 1.16, color: '#8e6956' },
    { name: 'asztal', x: 1.02, y: 0.48, z: 0.36, width: 0.55, depth: 0.78, height: 0.72, color: '#b19a77' },
    { name: 'fotel', x: 0.93, y: -0.94, z: 0.28, width: 0.66, depth: 0.58, height: 0.56, color: '#6d7f91' },
    { name: 'kanapé', x: -0.42, y: -1.16, z: 0.29, width: 0.9, depth: 0.38, height: 0.58, color: '#758b7a' },
    { name: 'lerakóasztal', x: 0.82, y: 1.14, z: 0.25, width: 0.48, depth: 0.30, height: 0.50, color: '#a68661' },
];
const conveyorTop = 0.38;
const conveyorLength = 1.02;
const conveyorWidth = 0.30;
const sourcePosition = new THREE.Vector3(-0.84, 0, conveyorTop + workSize / 2);
const targetPosition = new THREE.Vector3(0, -0.84, conveyorTop + workSize / 2);
const cellBounds = { minX: -1.05, maxX: 1.05, minY: -1.05, maxY: 1.05, minZ: 0.1, maxZ: 2.2, wall: 0.035 };
const viewport = $('viewport');

function cellWallSpecs() {
    const { minX, maxX, minY, maxY, minZ, maxZ, wall } = cellBounds;
    const opening = conveyorWidth / 2 + 0.035;
    const openingTop = conveyorTop + 0.05;
    const height = maxZ - minZ;
    const sideWidth = maxY - minY;
    const frontWidth = maxX - minX;
    const specs = [];
    const panel = (position, size) => specs.push({ position, size });
    panel([maxX, 0, (minZ + maxZ) / 2], [wall, sideWidth, height]);
    panel([minX, (minY - opening) / 2, (minZ + maxZ) / 2], [wall, -opening - minY, height]);
    panel([minX, (maxY + opening) / 2, (minZ + maxZ) / 2], [wall, maxY - opening, height]);
    panel([minX, 0, (openingTop + maxZ) / 2], [wall, opening * 2, maxZ - openingTop]);
    panel([0, maxY, (minZ + maxZ) / 2], [frontWidth, wall, height]);
    panel([(minX - opening) / 2, minY, (minZ + maxZ) / 2], [-opening - minX, wall, height]);
    panel([(maxX + opening) / 2, minY, (minZ + maxZ) / 2], [maxX - opening, wall, height]);
    panel([0, minY, (openingTop + maxZ) / 2], [opening * 2, wall, maxZ - openingTop]);
    panel([0, 0, maxZ - wall / 2], [maxX - minX, maxY - minY, wall]);
    return specs;
}

function currentObstacle(enabled = cellEnabled, robotModel = modelName) {
    const box = (minX, maxX, minY, maxY, minZ, maxZ, extra = {}) => ({
        min: new THREE.Vector3(minX, minY, minZ),
        max: new THREE.Vector3(maxX, maxY, maxZ),
        ...extra,
    });
    if (gameModeEnabled) {
        const walls = [
            box(-1.43, -1.38, -1.4, 1.4, 0, 2.2), box(1.38, 1.43, -1.4, 1.4, 0, 2.2),
            box(-1.4, 1.4, -1.43, -1.38, 0, 2.2), box(-1.4, 1.4, 1.38, 1.43, 0, 2.2),
        ];
        const solids = [
            box(-0.38, 0.38, -0.38, 0.38, 0, conveyorTop, { kind: 'machine' }),
            ...gameFurniture.map(item => box(item.x - item.width / 2, item.x + item.width / 2, item.y - item.depth / 2, item.y + item.depth / 2, 0, item.height)),
            ...gameLevelData.obstacles.map(item => box(item.x - item.width / 2, item.x + item.width / 2, item.y - item.depth / 2, item.y + item.depth / 2, item.z, item.z + item.height)),
        ];
        return { walls, solids };
    }
    const solids = robotModel === 'articulated' ? [
        box(-0.38, 0.38, -0.38, 0.38, 0, conveyorTop, { kind: 'machine' }),
        box(sourcePosition.x - conveyorLength / 2, sourcePosition.x + conveyorLength / 2, sourcePosition.y - conveyorWidth / 2, sourcePosition.y + conveyorWidth / 2, 0, conveyorTop - 0.03, { kind: 'conveyor', surfaceZ: conveyorTop, alongX: true }),
        box(targetPosition.x - conveyorWidth / 2, targetPosition.x + conveyorWidth / 2, targetPosition.y - conveyorLength / 2, targetPosition.y + conveyorLength / 2, 0, conveyorTop - 0.03, { kind: 'conveyor', surfaceZ: conveyorTop, alongX: false }),
    ] : [];
    const walls = enabled ? cellWallSpecs().map(({ position, size }) => ({
        min: new THREE.Vector3(position[0] - size[0] / 2, position[1] - size[1] / 2, position[2] - size[2] / 2),
        max: new THREE.Vector3(position[0] + size[0] / 2, position[1] + size[1] / 2, position[2] + size[2] / 2),
    })) : [];
    return { walls, solids };
}

function effectivePayload() {
    return payload + (workHeld ? Number($('work-mass').value) : 0);
}

function activePathPoints() {
    return gameModeEnabled && gameSession ? gameSession.route : points;
}

function boxIntersectsPart(box, position) {
    const radius = workSize / 2;
    return box && position.x + radius > box.min.x && position.x - radius < box.max.x && position.y + radius > box.min.y && position.y - radius < box.max.y && position.z + radius > box.min.z && position.z - radius < box.max.z;
}

function createTaskScene() {
    machineBed = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, conveyorTop), new THREE.MeshStandardMaterial({ color: '#8e9896', metalness: 0.58, roughness: 0.36 }));
    machineBed.position.set(0, 0, conveyorTop / 2);
    machineBed.castShadow = machineBed.receiveShadow = true;
    scene.add(machineBed);
    workMesh = new THREE.Mesh(new THREE.BoxGeometry(workSize, workSize, workSize), material(palette.secondary, 0.15));
    workMesh.castShadow = workMesh.receiveShadow = true;
    workMesh.position.copy(sourcePosition);
    scene.add(workMesh);
    const createConveyor = (center, axis, color) => {
        const group = new THREE.Group();
        scene.add(group);
        const frameMaterial = new THREE.MeshStandardMaterial({ color: '#687370', metalness: 0.58, roughness: 0.34 });
        const beltMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.65 });
        const alongX = axis === 'x';
        const size = (length, width) => alongX ? [length, width] : [width, length];
        const [bodyX, bodyY] = size(conveyorLength, conveyorWidth);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(bodyX, bodyY, conveyorTop - 0.03), frameMaterial);
        housing.position.set(center.x, center.y, (conveyorTop - 0.03) / 2);
        housing.castShadow = housing.receiveShadow = true;
        group.add(housing);
        const [beltX, beltY] = size(conveyorLength - 0.035, conveyorWidth - 0.035);
        const belt = new THREE.Mesh(new THREE.BoxGeometry(beltX, beltY, 0.035), beltMaterial);
        belt.position.set(center.x, center.y, conveyorTop - 0.0175);
        belt.castShadow = belt.receiveShadow = true;
        group.add(belt);
        const rollerGeometry = new THREE.CylinderGeometry(0.018, 0.018, conveyorWidth - 0.02, 16);
        for (const offset of [-conveyorLength / 2 + 0.02, conveyorLength / 2 - 0.02]) {
            const roller = new THREE.Mesh(rollerGeometry, frameMaterial);
            roller.position.set(center.x + (alongX ? offset : 0), center.y + (alongX ? 0 : offset), conveyorTop - 0.035);
            if (!alongX) roller.rotation.z = Math.PI / 2;
            roller.castShadow = roller.receiveShadow = true;
            group.add(roller);
        }
        return group;
    };
    conveyorA = createConveyor(sourcePosition, 'x', '#527b70');
    conveyorB = createConveyor(targetPosition, 'y', palette.primary);
    createRobotCell();
    createGameEnvironment();
    updateTaskScene();
}

function createGameEnvironment() {
    gameRoomGroup = new THREE.Group();
    scene.add(gameRoomGroup);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.92, transparent: true, opacity: 0.20, depthWrite: false, side: THREE.DoubleSide });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: '#798681', metalness: 0.55, roughness: 0.4 });
    const rugMaterial = new THREE.MeshStandardMaterial({ color: '#778b83', roughness: 0.94 });
    const addBox = (parent, size, position, color, options = {}) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.8, metalness: options.metalness ?? 0, transparent: options.transparent ?? false, opacity: options.opacity ?? 1 }));
        mesh.position.set(...position);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };
    const wallOptions = { roughness: 0.95, transparent: true, opacity: 0.20 };
    addBox(gameRoomGroup, [2.86, 0.045, 2.15], [0, -1.41, 1.12], wallMaterial.color, wallOptions);
    addBox(gameRoomGroup, [0.045, 2.82, 2.15], [-1.41, 0, 1.12], wallMaterial.color, wallOptions);
    addBox(gameRoomGroup, [0.045, 2.82, 2.15], [1.41, 0, 1.12], wallMaterial.color, wallOptions);
    addBox(gameRoomGroup, [2.86, 0.045, 2.15], [0, 1.41, 1.12], wallMaterial.color, wallOptions);
    addBox(gameRoomGroup, [1.15, 0.82, 0.018], [0.15, 0.1, 0.012], rugMaterial);
    addBox(gameRoomGroup, [0.26, 0.78, 1.42], [-1.18, 0.35, 0.72], '#65766f');
    for (const z of [0.12, 0.52, 0.92, 1.30]) addBox(gameRoomGroup, [0.28, 0.78, 0.045], [-1.18, 0.35, z], '#c1b095');
    addBox(gameRoomGroup, [0.55, 0.36, 1.16], [-0.72, 1.12, 0.58], '#8e6956');
    addBox(gameRoomGroup, [0.58, 0.34, 0.035], [-0.72, 0.925, 1.17], '#bd9b73');
    addBox(gameRoomGroup, [0.58, 0.34, 0.035], [-0.72, 0.925, 0.58], '#bd9b73');
    addBox(gameRoomGroup, [0.59, 0.82, 0.06], [1.02, 0.48, 0.70], '#b19a77');
    for (const x of [0.80, 1.24]) for (const y of [0.19, 0.77]) addBox(gameRoomGroup, [0.045, 0.045, 0.65], [x, y, 0.34], '#6d6457');
    addBox(gameRoomGroup, [0.66, 0.56, 0.34], [0.93, -0.94, 0.24], '#6d7f91');
    addBox(gameRoomGroup, [0.66, 0.17, 0.18], [0.93, -1.12, 0.49], '#596b7c');
    addBox(gameRoomGroup, [0.18, 0.56, 0.48], [0.69, -0.94, 0.40], '#596b7c');
    addBox(gameRoomGroup, [0.18, 0.56, 0.48], [1.17, -0.94, 0.40], '#596b7c');
    addBox(gameRoomGroup, [0.92, 0.40, 0.48], [-0.42, -1.16, 0.25], '#758b7a');
    addBox(gameRoomGroup, [0.90, 0.12, 0.28], [-0.42, -1.28, 0.49], '#657a6b');
    addBox(gameRoomGroup, [0.50, 0.32, 0.045], [0.82, 1.14, 0.50], '#a68661');
    for (const x of [0.62, 1.02]) for (const y of [1.02, 1.26]) addBox(gameRoomGroup, [0.04, 0.04, 0.48], [x, y, 0.25], '#78634e');
    addBox(gameRoomGroup, [0.045, 0.045, 0.32], [0, 0, 1.95], '#626c69', { metalness: 0.5 });
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 32), new THREE.MeshStandardMaterial({ color: '#d1ad62', metalness: 0.6, roughness: 0.3 }));
    lamp.position.set(0, 0, 1.78);
    gameRoomGroup.add(lamp);
    for (const [x, y] of [[-0.14, 0], [0.14, 0], [0, -0.14], [0, 0.14]]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: '#f4d48d', emissive: '#b38c42', emissiveIntensity: 0.65 }));
        bulb.position.set(x, y, 1.75);
        gameRoomGroup.add(bulb);
    }
    const stand = addBox(gameRoomGroup, [0.76, 0.76, conveyorTop], [0, 0, conveyorTop / 2], '#8e9896', { metalness: 0.58, roughness: 0.36 });
    stand.userData.solid = true;
    gameLevelGroup = new THREE.Group();
    gameRoomGroup.add(gameLevelGroup);
    gameRoomGroup.visible = false;
    setGameLevelScene();
}

function setGameLevelScene() {
    if (!gameLevelGroup) return;
    gameLevelGroup.traverse(child => {
        if (child === gameLevelGroup) return;
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
        else child.material?.dispose();
    });
    gameLevelGroup.clear();
    const boxMaterial = new THREE.MeshStandardMaterial({ color: '#87928f', metalness: 0.45, roughness: 0.52 });
    for (const obstacle of gameLevelData.obstacles) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(obstacle.width, obstacle.depth, obstacle.height), boxMaterial);
        block.position.set(obstacle.x, obstacle.y, obstacle.z + obstacle.height / 2);
        block.castShadow = block.receiveShadow = true;
        gameLevelGroup.add(block);
    }
    const { x, y, z } = gameLevelData.target;
    const target = new THREE.Vector3(x, y, z);
    const normal = new THREE.Vector3(...gameLevelData.target.normal).normalize();
    const cylinderOrientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const rimOrientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.17, 24), new THREE.MeshStandardMaterial({ color: '#33383b', metalness: 0.5, roughness: 0.35 }));
    pedestal.quaternion.copy(cylinderOrientation);
    pedestal.position.copy(target).addScaledVector(normal, -0.085);
    pedestal.castShadow = pedestal.receiveShadow = true;
    gameLevelGroup.add(pedestal);
    gameButtonCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.065, 32), new THREE.MeshStandardMaterial({ color: '#e21c2a', emissive: '#780811', emissiveIntensity: 0.25, metalness: 0.12, roughness: 0.3 }));
    gameButtonCap.quaternion.copy(cylinderOrientation);
    gameButtonCap.position.copy(target);
    gameButtonCap.castShadow = gameButtonCap.receiveShadow = true;
    gameLevelGroup.add(gameButtonCap);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.009, 8, 32), new THREE.MeshStandardMaterial({ color: '#d6d4cc', metalness: 0.75, roughness: 0.25 }));
    rim.quaternion.copy(rimOrientation);
    rim.position.copy(target).addScaledVector(normal, -0.027);
    gameLevelGroup.add(rim);
}

function formatGameDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    const [wholeSeconds, fractionalSeconds] = number(remainder).split(',');
    return `${String(minutes).padStart(2, '0')}:${wholeSeconds.padStart(2, '0')},${fractionalSeconds ?? '0'}`;
}

function gameElapsedSeconds() {
    if (!gameSession) return 0;
    const running = gameSession.running ? performance.now() - gameSession.levelStartedAt : 0;
    return (gameSession.levelElapsedMs + running) / 1000;
}

function updateGameHud(force = false) {
    $('game-hud').hidden = !gameModeEnabled;
    if (!gameModeEnabled || !gameSession) return;
    const now = performance.now();
    if (!force && now - lastGameHudUpdate < 120) return;
    lastGameHudUpdate = now;
    const elapsedSeconds = gameElapsedSeconds();
    const score = gameScore(joints.length, elapsedSeconds, gameSession.levelTimeBonusSeconds || 0);
    const stars = gameSession.levelComplete ? gameSession.results.at(-1)?.stars ?? gameStarsFromScore(score) : 0;
    $('game-level').textContent = String(gameSession.level).padStart(2, '0');
    $('game-difficulty').textContent = gameLevelData.difficulty;
    $('game-time').textContent = formatGameDuration(elapsedSeconds);
    $('game-dof').textContent = String(joints.length);
    $('game-score').textContent = String(score);
    $('game-rating').textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
    $('game-rating').setAttribute('aria-label', gameSession.levelComplete ? `${stars} / 3 csillag` : 'Csillagértékelés a pálya teljesítésekor');
    $('game-rating').classList.toggle('complete', gameSession.levelComplete);
    $('game-reward').textContent = gameSession.levelTimeBonusSeconds
        ? `Aktív jutalom: +${gameSession.levelTimeBonusSeconds} mp a pontozáshoz.`
        : gameSession.pendingTimeBonusSeconds
            ? `Jutalom a következő szintre: +${gameSession.pendingTimeBonusSeconds} mp pontozási bónusz.`
            : gameSession.threeStarStreak
                ? `Háromcsillagos sorozat: ${gameSession.threeStarStreak} / 2 szint.`
                : 'Két egymást követő 3 csillagért +15 mp pontozási bónusz jár.';
    $('game-objective').textContent = gameLevelData.requiresProgram
        ? `Útvonaltervezés: rögzíts legalább ${gameLevelData.requiredPoints} pontot, kerüld ki az akadályokat, majd játszd le a pályát a gombig. A gomb helye: ${gameLevelData.target.surface}.`
        : `Nyomd meg a piros gombot a robottal. Ne használj több szabadságfokot a szükségesnél. A gomb helye: ${gameLevelData.target.surface}.`;
    $('game-next').disabled = !gameSession.levelComplete || gameSession.level >= 30;
    $('game-results').innerHTML = gameSession.results.slice(-4).reverse().map(record => `<div><span>${String(record.level).padStart(2, '0')}</span><span class="game-result-stars" aria-label="${record.stars} csillag">${'★'.repeat(record.stars)}${'☆'.repeat(3 - record.stars)}</span><span>${record.dofs} DOF</span><span>${formatGameDuration(record.seconds)}</span><strong>${record.score}</strong></div>`).join('');
}

function startGameSession() {
    const now = performance.now();
    gameSession = { level: 1, startedAt: now, levelStartedAt: now, levelElapsedMs: 0, levelTimeBonusSeconds: 0, pendingTimeBonusSeconds: 0, threeStarStreak: 0, running: true, levelComplete: false, results: [], route: [] };
    gameLevelData = createGameLevel(1);
    setGameLevelScene();
    updateGameHud(true);
}

async function setGameMode(enabled) {
    if (enabled === gameModeEnabled) return;
    stopMovement();
    const now = performance.now();
    if (enabled) {
        gameSavedRobot = { joints: structuredClone(joints), initialJoints: structuredClone(initialJoints), modelName };
        if (!gameSession) startGameSession();
        else {
            gameSession.levelStartedAt = now;
            gameSession.running = true;
        }
        gameModeEnabled = true;
        cellEnabled = false;
        $('cell-enabled').checked = false;
        workEnabled = false;
        workHeld = false;
        workDelivered = false;
        workMesh.position.copy(sourcePosition);
        $('loop-path').checked = false;
        elapsed = 0;
        gameSession.route = [];
        await changeGeometry([structuredClone(preset('articulated')[0])], 'custom');
        selectTab('builder');
        renderPoints();
    } else {
        if (gameSession?.running) {
            gameSession.levelElapsedMs += now - gameSession.levelStartedAt;
            gameSession.running = false;
        }
        gameModeEnabled = false;
        if (gameSavedRobot) {
            joints = gameSavedRobot.joints;
            initialJoints = gameSavedRobot.initialJoints;
            modelName = gameSavedRobot.modelName;
            gameSavedRobot = null;
            selectedJoint = -1;
            $('joint-popover').hidden = true;
            renderControls();
            renderBuilder();
            renderPoints();
            rebuildRobot();
        }
    }
    renderPoints();
    updateTaskScene();
    rebuildWorkspace();
    frameRobot();
    dirty = true;
}

function resetGameSession() {
    startGameSession();
    if (gameSession) gameSession.route = [];
    elapsed = 0;
    stopMovement();
    $('joint-popover').hidden = true;
    selectedJoint = -1;
    resetGameRobotToR1();
    renderPoints();
}

function resetGameRobotToR1() {
    joints = [structuredClone(preset('articulated')[0])];
    initialJoints = structuredClone(joints);
    modelName = 'custom';
    mathJoint = 0;
    teachingJoint = 0;
    selectedJoint = -1;
    $('preset').value = 'custom';
    $('joint-popover').hidden = true;
    oldTip = undefined;
    renderControls();
    renderBuilder();
    rebuildRobot();
    rebuildWorkspace();
    frameRobot();
    dirty = true;
}

function finishGameLevel() {
    if (!gameSession || gameSession.levelComplete) return;
    const seconds = gameElapsedSeconds();
    stopMovement();
    gameSession.levelElapsedMs = seconds * 1000;
    gameSession.running = false;
    const score = gameScore(joints.length, seconds, gameSession.levelTimeBonusSeconds || 0);
    const stars = gameStarsFromScore(score);
    const resultRecord = { level: gameSession.level, seconds, dofs: joints.length, score, stars };
    gameSession.results.push(resultRecord);
    gameSession.levelComplete = true;
    const streakResult = recordGameStarStreak(gameSession.threeStarStreak, stars, gameSession.pendingTimeBonusSeconds || 0);
    gameSession.threeStarStreak = streakResult.streak;
    gameSession.pendingTimeBonusSeconds = streakResult.pendingBonusSeconds;
    if (gameButtonCap) {
        const normal = new THREE.Vector3(...gameLevelData.target.normal).normalize();
        gameButtonCap.position.set(gameLevelData.target.x, gameLevelData.target.y, gameLevelData.target.z).addScaledVector(normal, -0.025);
        gameButtonCap.material.color.set('#3eaa73');
        gameButtonCap.material.emissive.set('#164d2c');
    }
    $('game-feedback').textContent = `Pálya kész: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · ${resultRecord.dofs} DOF · ${formatGameDuration(resultRecord.seconds)} · ${resultRecord.score} pont.${streakResult.rewardEarned ? ' Jutalom: +15 mp pontozási bónusz a következő szintre!' : ''}`;
    updateGameHud(true);
    celebrateGameLevel();
    toast(`Pálya ${resultRecord.level} teljesítve · ${resultRecord.dofs} DOF · ${formatGameDuration(resultRecord.seconds)}`);
}

function celebrateGameLevel() {
    const celebration = $('game-confetti');
    const colors = ['#e21c2a', '#f0b323', '#328c72', '#3878b8', '#ed6c42', '#8e6956'];
    window.clearTimeout(gameConfettiTimer);
    celebration.replaceChildren();
    for (let index = 0; index < 72; index++) {
        const piece = document.createElement('i');
        piece.className = 'game-confetti-piece';
        piece.style.setProperty('--x', `${Math.random() * 100}%`);
        piece.style.setProperty('--drift', `${Math.round(Math.random() * 220 - 110)}px`);
        piece.style.setProperty('--rotation', `${Math.round(Math.random() * 900 - 450)}deg`);
        piece.style.setProperty('--duration', `${2.8 + Math.random() * 1.8}s`);
        piece.style.setProperty('--delay', `${Math.random() * 0.45}s`);
        piece.style.setProperty('--color', colors[index % colors.length]);
        celebration.append(piece);
    }
    celebration.classList.remove('active');
    requestAnimationFrame(() => celebration.classList.add('active'));
    gameConfettiTimer = window.setTimeout(() => {
        celebration.classList.remove('active');
        celebration.replaceChildren();
    }, 5000);
}

function checkGameButton() {
    if (!gameModeEnabled || !gameSession || gameSession.levelComplete) return;
    if (gameLevelData.requiresProgram) {
        const route = activePathPoints();
        if (!pathPlaying || route.length < gameLevelData.requiredPoints || elapsed < totalDuration() - 0.06) return;
        const finalPoint = route.at(-1);
        const finalTip = new THREE.Vector3(...finalPoint.tip);
        const target = new THREE.Vector3(gameLevelData.target.x, gameLevelData.target.y, gameLevelData.target.z);
        if (finalTip.distanceTo(target) > 0.14) return;
    }
    const target = new THREE.Vector3(gameLevelData.target.x, gameLevelData.target.y, gameLevelData.target.z);
    if (forward(joints).tip.distanceTo(target) > 0.12) return;
    finishGameLevel();
    if (gameLevelData.requiresProgram) {
        movement = 'manual';
        pathPlaying = false;
        updateMotionButtons();
    }
}

function advanceGameLevel() {
    if (!gameSession?.levelComplete || gameSession.level >= 30) return;
    gameSession.level += 1;
    gameSession.levelElapsedMs = 0;
    gameSession.levelStartedAt = performance.now();
    gameSession.levelTimeBonusSeconds = gameSession.pendingTimeBonusSeconds || 0;
    gameSession.pendingTimeBonusSeconds = 0;
    gameSession.levelComplete = false;
    gameSession.route = [];
    gameLevelData = createGameLevel(gameSession.level);
    $('loop-path').checked = false;
    gameButtonCap = undefined;
    setGameLevelScene();
    resetGameRobotToR1();
    elapsed = 0;
    renderPoints();
    $('game-feedback').textContent = gameLevelData.requiresProgram
        ? `Új kihívás: ${gameLevelData.requiredPoints} vagy több útvonalponttal kerüld meg az akadályokat.`
        : 'Új kihívás: érd el a piros gombot.';
    updateGameHud(true);
}

function createRobotCell() {
    cellGroup = new THREE.Group();
    scene.add(cellGroup);
    const profileMaterial = new THREE.MeshStandardMaterial({ color: '#87928f', metalness: 0.78, roughness: 0.28 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: '#a8d8df', transparent: true, opacity: 0.14, roughness: 0.15, metalness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const add = (geometry, surface, position) => {
        const mesh = new THREE.Mesh(geometry, surface);
        mesh.position.set(...position);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        cellGroup.add(mesh);
        return mesh;
    };
    const centerZ = (cellBounds.minZ + cellBounds.maxZ) / 2;
    const height = cellBounds.maxZ - cellBounds.minZ;
    const opening = conveyorWidth / 2 + 0.035;
    const openingTop = conveyorTop + 0.05;
    for (const x of [cellBounds.minX, cellBounds.maxX]) for (const y of [cellBounds.minY, cellBounds.maxY]) {
        add(new THREE.BoxGeometry(0.045, 0.045, height), profileMaterial, [x, y, centerZ]);
        add(new THREE.BoxGeometry(0.06, 0.06, 0.03), profileMaterial, [x, y, cellBounds.minZ + 0.015]);
    }
    for (const z of [cellBounds.minZ, cellBounds.maxZ]) {
        if (z === cellBounds.maxZ) {
            add(new THREE.BoxGeometry(cellBounds.maxX - cellBounds.minX, 0.045, 0.045), profileMaterial, [0, cellBounds.minY, z]);
            add(new THREE.BoxGeometry(0.045, cellBounds.maxY - cellBounds.minY, 0.045), profileMaterial, [cellBounds.minX, 0, z]);
        } else {
            for (const range of [[cellBounds.minX, -opening], [opening, cellBounds.maxX]]) add(new THREE.BoxGeometry(range[1] - range[0], 0.045, 0.045), profileMaterial, [(range[0] + range[1]) / 2, cellBounds.minY, z]);
            for (const range of [[cellBounds.minY, -opening], [opening, cellBounds.maxY]]) add(new THREE.BoxGeometry(0.045, range[1] - range[0], 0.045), profileMaterial, [cellBounds.minX, (range[0] + range[1]) / 2, z]);
        }
        add(new THREE.BoxGeometry(cellBounds.maxX - cellBounds.minX, 0.045, 0.045), profileMaterial, [0, cellBounds.maxY, z]);
        add(new THREE.BoxGeometry(0.045, cellBounds.maxY - cellBounds.minY, 0.045), profileMaterial, [cellBounds.maxX, 0, z]);
    }
    for (const y of [-opening, opening]) add(new THREE.BoxGeometry(0.035, 0.035, cellBounds.maxZ - openingTop), profileMaterial, [cellBounds.minX, y, (cellBounds.maxZ + openingTop) / 2]);
    for (const x of [-opening, opening]) add(new THREE.BoxGeometry(0.035, 0.035, cellBounds.maxZ - openingTop), profileMaterial, [x, cellBounds.minY, (cellBounds.maxZ + openingTop) / 2]);
    add(new THREE.BoxGeometry(0.035, opening * 2, 0.035), profileMaterial, [cellBounds.minX, 0, openingTop]);
    add(new THREE.BoxGeometry(opening * 2, 0.035, 0.035), profileMaterial, [0, cellBounds.minY, openingTop]);
    const glassSpecs = cellWallSpecs();
    for (const { position, size } of glassSpecs) {
        const [x, y, z] = position;
        const dimensions = z > cellBounds.maxZ - cellBounds.wall ? size : x === cellBounds.minX || x === cellBounds.maxX ? [0.012, size[1], size[2]] : [size[0], 0.012, size[2]];
        add(new THREE.BoxGeometry(...dimensions), glassMaterial, position);
    }
    cellGroup.visible = cellEnabled;
}

function updateTaskScene() {
    if (!machineBed) return;
    if (cellGroup) cellGroup.visible = cellEnabled && !gameModeEnabled;
    if (gameRoomGroup) gameRoomGroup.visible = gameModeEnabled;
    machineBed.visible = !gameModeEnabled;
    $('cell-enabled').checked = cellEnabled && !gameModeEnabled;
    $('cell-toggle-wrap').hidden = gameModeEnabled;
    $('collision-status').textContent = gameModeEnabled ? 'Játékszoba- és bútorütközés-védelem aktív' : cellEnabled ? 'Cella- és talajvédelem aktív' : 'Talajvédelem aktív';
    const taskAvailable = modelName === 'articulated';
    $('work-toggle-wrap').hidden = !taskAvailable || gameModeEnabled;
    $('work-enabled').checked = taskAvailable && workEnabled && !gameModeEnabled;
    conveyorA.visible = conveyorB.visible = workMesh.visible = taskAvailable && workEnabled && !gameModeEnabled;
    if (workHeld) {
        workMesh.position.copy(forward(joints).tip);
        workMesh.quaternion.identity();
    }
    $('work-status').textContent = gameModeEnabled ? 'Játék mód aktív' : !taskAvailable ? 'Csak Artikulált robotnál érhető el' : !workEnabled ? 'Feladat kikapcsolva' : workHeld ? 'Megfogóban · + terhelés' : workDelivered ? 'Átrakás kész · B konvejor' : 'Várakozik az A konvejoron';
    $('transfer-status').textContent = !workEnabled ? 'Kapcsold be az átrakó feladatot a munkatérben.' : workHeld ? 'Vidd a darabot a B konvejor fölé, majd engedd el.' : workDelivered ? 'Sikeres átrakás: a darab a B konvejoron van.' : 'Vedd fel a darabot az A konvejorról, majd tedd le a B konvejorra.';
    $('transfer-task').hidden = !taskAvailable || !workEnabled || gameModeEnabled;
    $('gripper-toolbar').hidden = gameModeEnabled;
    $('grip').disabled = !taskAvailable || !workEnabled || workHeld || workDelivered;
    $('release').disabled = !workHeld;
    $('game-hud').hidden = !gameModeEnabled;
    updateGameHud();
}

function releaseWork() {
    workHeld = false;
    workVelocity = 0;
    dirty = true;
    updateTaskScene();
    rebuildWorkspace();
}

function settleWork(delta) {
    if (!workMesh || !workEnabled || workHeld) return;
    let support = workSize / 2;
    for (const center of [sourcePosition, targetPosition]) {
        const alongX = center === sourcePosition;
        const inside = alongX
            ? Math.abs(workMesh.position.x - center.x) <= conveyorLength / 2 - workSize / 2 && Math.abs(workMesh.position.y - center.y) <= conveyorWidth / 2 - workSize / 2
            : Math.abs(workMesh.position.x - center.x) <= conveyorWidth / 2 - workSize / 2 && Math.abs(workMesh.position.y - center.y) <= conveyorLength / 2 - workSize / 2;
        if (inside && workMesh.position.z >= conveyorTop + workSize / 2 - 0.001) support = conveyorTop + workSize / 2;
    }
    if (!joints[0].gantry && Math.abs(workMesh.position.x) < 0.28 && Math.abs(workMesh.position.y) < 0.28 && workMesh.position.z >= 0.16) support = Math.max(support, 0.16);
    if (workMesh.position.z > support) {
        workVelocity += 9.81 * delta;
        workMesh.position.z = Math.max(support, workMesh.position.z - workVelocity * delta);
        if (workMesh.position.z <= support) { workVelocity = 0; updateTaskScene(); }
    }
}

function applyCellState() {
    stopMovement();
    const enabled = $('cell-enabled').checked;
    const nextCell = currentObstacle(enabled);
    const reason = collisionReason(forward(joints), nextCell, workHeld ? workSize : 0);
    if (reason) {
        $('cell-enabled').checked = cellEnabled;
        toast(`${reason}: a cella nem kapcsolható be ebben a robothelyzetben.`);
        return;
    }
    cellEnabled = enabled;
    updateTaskScene();
    rebuildWorkspace();
    frameRobot();
}

function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}

function confirmAction(title, message) {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    return new Promise(resolve => {
        $('confirm-ok').onclick = () => { dialog.close('yes'); };
        $('confirm-cancel').onclick = () => { dialog.close('no'); };
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
        dialog.returnValue = 'no';
        dialog.showModal();
    });
}

function stopMovement() {
    movement = 'manual';
    pathPlaying = false;
    velocities = joints.map(() => 0);
    accelerations = joints.map(() => 0);
    speed = 0;
    oldTip = undefined;
    dirty = true;
    updateMotionButtons();
}

function updateMotionButtons() {
    $('demo').innerHTML = `<i data-lucide="${movement === 'demo' ? 'pause' : 'play'}"></i><span>${movement === 'demo' ? 'Szimuláció szünet' : 'Mozgásszimuláció'}</span>`;
    $('play-path').innerHTML = `<i data-lucide="${pathPlaying ? 'pause' : 'play'}"></i>`;
    $('play-path').setAttribute('aria-label', pathPlaying ? 'Pálya szüneteltetése' : 'Pálya lejátszása');
    icons();
}

function selectTab(name) {
    document.querySelectorAll('[data-tab]').forEach(button => {
        const active = button.dataset.tab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    for (const panel of ['control', 'builder', 'math']) $(`${panel}-panel`).hidden = panel !== name;
    dirty = true;
}

function chooseJoint(index) {
    teachingJoint = index;
    hideJointTeaching();
    selectedJoint = index;
    mathJoint = index;
    $('math-joint').value = String(index);
    $('joint-popover').hidden = false;
    const joint = joints[index];
    $('popover-title').textContent = modelName === 'delta' ? `M${index + 1} · forgómotor` : `${joint.type}${index + 1} · ${joint.axis} ${joint.type === 'R' ? 'forgatás' : 'eltolás'}`;
    $('popover-slider').min = joint.min;
    $('popover-slider').max = joint.max;
    $('popover-min').textContent = `${joint.min} ${unit(joint)}`;
    $('popover-max').textContent = `${joint.max} ${unit(joint)}`;
    dirty = true;
}

function showJointTeaching(index) {
    if (index < 0 || index >= joints.length) return;
    teachingJoint = index;
    hoveredJoint = index;
    $('joint-teaching-tooltip').hidden = false;
    dirty = true;
}

function hideJointTeaching() {
    hoveredJoint = -1;
    $('joint-teaching-tooltip').hidden = true;
}

function renderRobotLesson() {
    const lesson = robotLessons[modelName] || robotLessons.custom;
    const rotary = joints.filter(joint => joint.type === 'R').length;
    const architecture = modelName === 'delta' ? 'Párhuzamos, zárt lánc' : 'Nyitott soros lánc';
    const dynamicsNote = modelName === 'delta' ? '<p class="model-note"><i data-lucide="info"></i><span>A megjelenített hajtásterhelés közelítő oktatási becslés. A Delta karok és az összekötő rudak teljes dinamikai csatolását nem modellezi.</span></p>' : '';
    $('robot-lesson').innerHTML = `<h3>Mit tud ez a robot?</h3><p>${lesson.properties}</p><div class="lesson-facts"><span>${joints.length} konfigurációs DOF</span><span>${rotary} forgó + ${joints.length - rotary} lineáris</span><span>${architecture}</span></div><h3>Miért ilyen alakú a munkatér?</h3><p>${lesson.workspace}</p><p>A munkatér a TCP, azaz a szerszámközéppont lehetséges helyzeteinek halmaza, nem a teljes robot által söpört térfogat. A pontfelhő legfeljebb 2400, csuklóhatárokkal és közelítő ütközésvizsgálattal elfogadott állásból készül. A pontok hiánya nem mindig elérhetetlenség: a mintavétel ritka is lehet.</p><p>Az akadály és a felvett darab szűkítheti a szabad munkateret. A pontok nem ábrázolják az összes lehetséges szerszámorientációt, és nem bizonyítják, hogy minden állás összefüggő, akadálymentes úton megközelíthető.</p><div class="lesson-question"><strong>Figyeld meg!</strong><p>${lesson.experiment}</p></div>${dynamicsNote}`;
    icons();
}

function jointTeachingMarkup(index, compact = false) {
    const joint = joints[index];
    const load = result.loads[index];
    const lesson = explainJoint(joints, result, effectivePayload(), index);
    const rotary = joint.type === 'R';
    const title = `${joint.type}${index + 1} · ${rotary ? 'Rotációs, forgó csukló' : 'Transzlációs, lineáris csukló'}`;
    const role = jointRole(modelName, index, joint);
    if (modelName === 'delta') return compact ? `<strong>${title}</strong><p>${role}</p><p class="hover-facts">Motorállás: ${number(joint.value)}° · Közelítő tartónyomaték: ${number(load.total, 2)} N·m</p><p>A motor a párhuzamos rudakon keresztül mozgatja a közös platformot.</p>` : `<h3>${title}</h3><p>${role}</p><div class="lesson-facts"><span>Forgó motor</span><span>120°-os elrendezés</span><span>Párhuzamos karok</span></div><p>A motor rövid felső kart mozgat. A két végén csuklós alsó rúd nem önálló csukló; állandó hossza a többi karral együtt kényszeríti ki a platform helyzetét.</p><h3>Motor terhelése</h3><p>A gravitációs erőt a három párhuzamos kar osztja el. A motor becsült tartónyomatéka a platform és a rudak pillanatnyi geometriájától függ.</p><div class="formula">Közelítő tartónyomaték = ${number(load.holding, 2)} N·m</div><p>A kijelzés a becsült gravitációs tartónyomatékot mutatja. A párhuzamos rudak teljes tehetetlensége és a karok közötti dinamikai csatolás nem része az oktatási modellnek.</p>`;
    if (compact) return `<strong>${title}</strong><p>${role}</p><p class="hover-facts">Helyi ${joint.axis} tengely · ${number(joint.value)} ${unit(joint)} · ${number(load.total, 2)} ${effortUnit(joint)} · ${number(lesson.ratio * 100, 0)}%<br>Határok: ${joint.min}…${joint.max} ${unit(joint)} · Tag: ${joint.length} mm / ${number(joint.mass)} kg</p><p>${lesson.reason}</p>`;
    return `<h3>${title}</h3><p>${role}</p><div class="lesson-facts"><span>1 szabadságfok</span><span>Helyi tengely: ${joint.axis}</span><span>Határok: ${joint.min}…${joint.max} ${unit(joint)}</span><span>Taghossz: ${joint.length} mm</span><span>Tagtömeg: ${number(joint.mass)} kg</span></div><p>${rotary ? 'Szöggel leírt mozgás a helyi tengely körül. A csukló után következő összes tag vele együtt fordul. A helyi tengely a korábbi csuklók mozgásával a világban elfordulhat.' : 'Egyenes vonalú eltolás a helyi tengely mentén. Nem nyomatékot, hanem a tengely irányában szükséges hajtóerőt számoljuk. A korábbi forgó csuklók ezt a tengelyt a világban elfordíthatják.'}</p><h3>Miért ekkora most a ${rotary ? 'nyomaték' : 'hajtóerő'}?</h3><p>${lesson.reason}</p><div class="formula">${rotary ? 'τg = Σ (m · g · k)' : 'Fg = Σ (m · g · ez)'} = ${number(load.holding, 2)} ${effortUnit(joint)}<br>${rotary ? 'τ ≈ τg + Ieff · α' : 'F ≈ Fg + meff · a'} = ${number(load.total, 2)} ${effortUnit(joint)}</div><p>${number(lesson.supportedMass)} kg tömeg hat erre a csuklóra a lánc további részéből és a végponti teherből. ${rotary ? 'k a súlyerő tengelyre vetített, előjeles erőkarja méterben: nem feltétlenül azonos a merev tag hosszával.' : `ez a mozgástengely függőleges komponense: most ${number(result.frames[index].axis.z, 3)}. Függőleges tengelynél ±1, vízszintesnél 0.`}</p><p>A negatív előjel nem negatív terhelést vagy hibát jelent: a tartó hajtás a választott pozitív tengelyiránnyal ellentétesen hat. A kihasználtság az abszolút értékből számolódik: ${number(lesson.ratio * 100, 0)}% a ${number(joint.limit)} ${effortUnit(joint)} beállított határból.</p><p>A gyorsítási hozzájárulás most ${number(load.inertial, 2)} ${effortUnit(joint)}. Álló helyzetben nulla; a bemutató és a pályalejátszás alatt változik. A súrlódás és a csuklók dinamikai csatolása nincs ebben a becslésben.</p>`;
}

function updateTeaching() {
    teachingJoint = Math.min(teachingJoint, joints.length - 1);
    $('joint-lesson-heading').textContent = `Csukló közelről · ${joints[teachingJoint].type}${teachingJoint + 1}`;
    $('joint-lesson').innerHTML = jointTeachingMarkup(teachingJoint);
    if (hoveredJoint >= 0) {
        $('joint-teaching-tooltip').innerHTML = jointTeachingMarkup(hoveredJoint, true);
        $('joint-teaching-tooltip').classList.toggle('p', joints[hoveredJoint].type === 'P');
    }
}

function calculationTeaching(index) {
    const joint = joints[index];
    const load = result.loads[index];
    const rotary = joint.type === 'R';
    const lesson = explainJoint(joints, result, effectivePayload(), index);
    return `<section class="teaching-calculations"><h3>1. Mit keresünk?</h3><p>A ${joint.type}${index + 1} csukló ${rotary ? 'tartásához és gyorsításához szükséges hajtónyomatékot' : 'tartásához és gyorsításához szükséges tengelyirányú hajtóerőt'}. A gravitáció és a gyorsítás hatását külön összegezzük.</p><h3>2. Súlyerő és erőkar</h3><p>F = m · g. A tömeg mértékegysége kg, a nehézségi gyorsulás g = 9,81 m/s², így a súlyerő newtonban adódik. ${rotary ? 'M = F · k: az erőt az előjeles, tengelyre vetített erőkarral szorozzuk. N × m = N·m. A nyomaték az adott tengely körüli forgatóhatás mértéke.' : 'A súlyerőt a szán tengelyére vetítjük: Fg = m · g · ez. Ezért nem elég a tömeget ismerni: a tengely térbeli iránya is számít.'}</p><p>${lesson.reason}</p><div class="contribution-list">${lesson.contributions.map(body => `<div><strong>${body.name}</strong><span>${number(body.mass, 2)} kg × 9,81 = ${number(body.weight, 2)} N</span><span>× ${number(body.projection, 4)} ${rotary ? 'm előjeles erőkar' : 'tengelyvetület'} = ${number(body.holding, 2)} ${effortUnit(joint)}</span></div>`).join('')}</div><div class="formula">Σ hozzájárulás = ${number(load.holding, 2)} ${effortUnit(joint)}</div><p>A kijelzett részértékek kerekítettek; a program a teljes pontosságú értékeket adja össze. Az előjel a választott pozitív tengelyhez viszonyított hajtásirányt jelenti.</p><h3>3. Gyorsítás és tehetetlenség</h3><p>${rotary ? 'Ieff = Σ m · r⊥² [kg·m²]. r⊥ a tömegpontnak a forgástengelytől mért merőleges távolsága. Kétszer akkora távolság négyszer akkora tehetetlenségi hozzájárulást jelent. A gyorsításhoz Ieff · α nyomaték kell, ahol α rad/s².' : 'meff [kg] az összes későbbi tag és a teher mozgatott tömege. A gyorsításhoz meff · a erő kell, ahol a m/s². Álló vagy egyenletesen mozgó szánnál a gyorsulás nulla.'}</p><p>A képlet közelítés: nincs saját középponti tagtehetetlenség, súrlódás, Coriolis-hatás vagy más csuklók gyorsulása miatti dinamikai csatolás. A nulla gravitációs terhelés ezért nem jelent nulla motorteljesítmény-igényt.</p><h3>4. Koordináták és egységek</h3><p>Fok → radián: φrad = φ° · π / 180. Milliméter → méter: s[m] = s[mm] / 1000. A program belső számításai SI-egységekkel készülnek, hogy például a nyomaték N·m-ben legyen, ne N·mm-ben.</p><p>T = T₀ · A₁ · … · Aₙ: a csuklók helyi mozgásait sorrendben összeszorozzuk. A 4×4-es mátrix bal felső 3×3-as része a szerszám irányát, jobb oldali oszlopa a TCP világkoordinátáit adja méterben. A sorrend számít: a forgatás utáni eltolás más eredményt adhat, mint fordítva.</p><h3>5. Energia és sebesség</h3><dl><dt>Ep = Σ m · g · z [J]</dt><dd>Helyzeti energia a Z = 0 talajsíkhoz viszonyítva. Emeléskor nő; a tagok középpontjának és a tehernek az energiáját összegezzük.</dd><dt>Ek ≈ Σ ½ · Ieff · ω² vagy ½ · meff · v² [J]</dt><dd>A mozgási energia itt független csuklók szerinti becslés. A valós, csatolt robotenergia ettől eltérhet.</dd><dt>vátlag = Δs / Δt; ωátlag = Δφ / Δt</dt><dd>Átlagos lineáris sebesség m/s-ban, szögsebesség rad/s-ban. A TCP-kijelző két képkocka közötti térbeli elmozdulásból becsül, nem a pálya teljes hosszából.</dd></dl><h3>6. Simított pályamozgás</h3><p>u = t / T, s(u) = 10u³ − 15u⁴ + 6u⁵. A csuklókoordináta q(t) = q₀ + (q₁ − q₀) · s(u). Az első derivált a sebesség, a második a gyorsulás; mindkettő nulla a szakasz elején és végén. Rövidebb szakaszidő nagyobb gyorsulást, így nagyobb becsült hajtásterhelést okoz. A csuklótérben sima átmenet nem garantál egyenes TCP-pályát.</p></section>`;
}

function setJoint(index, value) {
    if (!Number.isFinite(value)) return;
    stopMovement();
    const target = joints.map(joint => joint.value);
    target[index] = THREE.MathUtils.clamp(value, joints[index].min, joints[index].max);
    moveSafely(target);
}

function moveSafely(values) {
    const safe = safeMotion(joints, values, currentObstacle(), workHeld ? workSize : 0);
    joints.forEach((joint, index) => { joint.value = safe.values[index]; });
    if (safe.reason) {
        stopMovement();
        $('collision-status').textContent = `${safe.reason} · mozgás megállítva`;
        toast(`${safe.reason}: a robot az utolsó szabad állásban megállt.`);
    } else $('collision-status').textContent = cellEnabled ? 'Cella- és talajvédelem aktív' : 'Talajvédelem aktív';
    dirty = true;
    return !safe.reason;
}

function renderControls() {
    $('math-joint').innerHTML = joints.map((joint, index) => `<option value="${index}">${modelName === 'delta' ? `M${index + 1} · forgómotor` : `${joint.type}${index + 1} · ${joint.axis} ${joint.type === 'R' ? 'forgó' : 'lineáris'}`}</option>`).join('');
    mathJoint = Math.min(mathJoint, joints.length - 1);
    $('math-joint').value = String(mathJoint);
    $('load-list').innerHTML = joints.map((joint, index) => `<div class="load-row" id="load-${index}"><div class="load-head"><strong>${joint.type}${index + 1}</strong><span id="load-value-${index}"></span><small>/ ${joint.limit}</small></div><div class="load-bar"><span id="load-bar-${index}"></span></div></div>`).join('');
    const rotary = joints.filter(joint => joint.type === 'R').length;
    $('dof-number').textContent = joints.length;
    $('r-count').textContent = rotary;
    $('p-count').textContent = joints.length - rotary;
    $('chain').textContent = modelName === 'delta' ? 'Párhuzamos' : modelName === 'custom' ? 'Saját lánc' : 'Soros';
    $('dof-note').textContent = joints.length > 6 ? 'Redundáns soros lánc; a végpont póza legfeljebb 6 független összetevőjű.' : 'Nyitott soros lánc. A végpont mozgásképessége a geometriától és a helyzettől is függ.';
    if (modelName === 'delta') $('dof-note').textContent = 'Három motor egy párhuzamos zárt láncú platformot mozgat; a 3R itt nem soros kar.';
    $('robot-title').textContent = names[modelName];
    $('robot-dialog-title').textContent = `Robot ismertető · ${names[modelName]}`;
    $('selected-robot-name').textContent = names[modelName];
    document.querySelector('#robot-picker-toggle .robot-thumb-current').dataset.art = modelName;
    document.querySelectorAll('.robot-option').forEach(option => option.setAttribute('aria-selected', String(option.dataset.model === modelName)));
    $('math-panel').querySelector('.model-note p').textContent = modelName === 'delta'
        ? 'Háromkarú párhuzamos zárt lánc. A platform helyét a rögzített alsó rudak gömbmetszése adja; a motor terhelése közelítő oktatási becslés.'
        : 'Soros, merev lánc. Közelítő talaj-, talapzat- és cellafalvédelem; teljes önütközés-vizsgálat nélkül. A dinamika független tömegpontmodell, csatolás és súrlódás nélkül.';
    hideJointTeaching();
    renderRobotLesson();
    icons();
}

function numericField(label, key, value, index, min, max, step = 1) {
    return `<label class="field">${label}<input type="number" data-config="${key}" data-index="${index}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
}

function renderBuilder() {
    $('builder-count').textContent = `${joints.length} / 12`;
    $('add-r').disabled = $('add-p').disabled = joints.length >= 12;
    $('builder-list').innerHTML = joints.map((joint, index) => {
        const fixedR1 = index === 0 && joint.type === 'R';
        const select = (label, key, values) => `<label class="field">${label}${fixedR1 && key === 'type' ? '<small class="fixed-joint-note">R1 · rögzített forgócsukló, Z tengely</small>' : ''}<select data-config="${key}" data-index="${index}" ${fixedR1 && ['type', 'axis'].includes(key) ? 'disabled' : ''}>${values.map(value => `<option ${joint[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`;
        const lockPrevious = index === 1 && joints[0].type === 'R';
        return `<section class="builder-joint"><div class="section-head"><strong>${joint.type}${index + 1} · ${joint.type === 'R' ? 'Rotáció' : 'Transzláció'}</strong><div class="reorder"><button class="icon-button" data-reorder="${index}" data-direction="-1" title="Előrébb a láncban" aria-label="${index + 1}. csukló előrébb" ${index === 0 || lockPrevious ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button><button class="icon-button" data-reorder="${index}" data-direction="1" title="Hátrébb a láncban" aria-label="${index + 1}. csukló hátrébb" ${index === 0 || index === joints.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button><button class="icon-button danger" data-remove="${index}" title="Csukló törlése" aria-label="${index + 1}. csukló törlése" ${fixedR1 || joints.length === 1 ? 'disabled' : ''}><i data-lucide="x"></i></button></div></div><div class="inline-fields">${select('Csuklótípus', 'type', ['R', 'P'])}${select('Helyi mozgástengely', 'axis', ['X', 'Y', 'Z'])}${numericField('Taghossz [mm]', 'length', joint.length, index, 10, 1500)}${select('Merev tag iránya', 'linkAxis', ['X', 'Y', 'Z'])}${numericField('Tagtömeg [kg]', 'mass', joint.mass, index, 0, 100, 0.1)}${numericField(`Hajtáshatár [${effortUnit(joint)}]`, 'limit', joint.limit, index, 0.1, 100000, 0.1)}${numericField(`Alsó határ [${unit(joint)}]`, 'min', joint.min, index, joint.type === 'R' ? -360 : -1000, joint.type === 'R' ? 360 : 2000)}${numericField(`Felső határ [${unit(joint)}]`, 'max', joint.max, index, joint.type === 'R' ? -360 : -1000, joint.type === 'R' ? 360 : 2000)}</div></section>`;
    }).join('');
    icons();
}

async function changeGeometry(next, name = 'custom') {
    stopMovement();
    const rootConstraint = name === 'custom' ? rootJointConstraint(next) : '';
    if (rootConstraint) { toast(rootConstraint); return false; }
    if (name === 'custom' && modelName === 'custom' && joints[0].type === 'R' && next[0]?.type !== 'R') {
        toast('Az R1 rögzített forgó csukló, nem törölhető és nem cserélhető le.');
        return false;
    }
    if (next[0].gantry && (next.length !== 3 || !next.every((joint, index) => joint.type === 'P' && joint.axis === ['X', 'Y', 'Z'][index] && joint.length === 0))) {
        toast('A portál három merőleges lineáris tengelyből áll. Más lánc építéséhez válassz robotkar-kiindulást.');
        return false;
    }
    if (next[0].gantry && next.some((joint, index) => joint.min < [0, 0, -1000][index] || joint.max > [800, 600, -150][index])) {
        toast('A portál szánhatárai nem léphetnek túl a vezetősínek löketén.');
        return false;
    }
    const reason = collisionReason(forward(next), currentObstacle(cellEnabled, name));
    if (reason) { toast(`${reason}: ez a konfiguráció nem állítható be.`); return false; }
    const currentRoute = activePathPoints();
    if (currentRoute.length && !await confirmAction('Új robotkonfiguráció?', 'A módosítás törli a jelenlegi munkamenethez tartozó pályapontokat.')) return false;
    joints = next;
    modelName = name;
    if (name !== 'articulated') {
        workEnabled = false;
        workHeld = false;
        workDelivered = false;
        workVelocity = 0;
        workMesh.position.copy(sourcePosition);
    }
    if (workHeld) {
        workHeld = false;
        workDelivered = false;
        workMesh.position.copy(sourcePosition);
        updateTaskScene();
    }
    initialJoints = structuredClone(next);
    if (gameModeEnabled && gameSession) gameSession.route = [];
    else points = [];
    elapsed = 0;
    selectedJoint = -1;
    $('joint-popover').hidden = true;
    $('preset').value = name;
    oldTip = undefined;
    renderControls();
    renderBuilder();
    rebuildRobot();
    renderPoints();
    rebuildWorkspace();
    if (name !== 'custom') frameRobot();
    dirty = true;
    return true;
}

function disposeObject(object) {
    if (!object) return;
    object.traverse(child => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
        else child.material?.dispose();
    });
    scene.remove(object);
}

function material(color, metallic = 0.2) {
    return new THREE.MeshStandardMaterial({ color, metalness: metallic, roughness: 0.4 });
}

function addMesh(geometry, surface, parent = robotGroup) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function rebuildRobot() {
    disposeObject(robotGroup);
    robotGroup = new THREE.Group();
    scene.add(robotGroup);
    meshes = [];
    gantryParts = null;
    liftTable = null;
    deltaPlatform = null;
    if (joints[0].gantry) {
        const beam = (size, position, color = palette.body) => {
            const mesh = addMesh(new THREE.BoxGeometry(...size), material(color, 0.5));
            mesh.position.set(...position);
            return mesh;
        };
        for (const x of [-0.52, 0.52]) for (const y of [-0.42, 0.42]) {
            beam([0.09, 0.09, 1.08], [x, y, 0.54]);
            beam([0.18, 0.18, 0.04], [x, y, 0.02], palette.anthracite);
        }
        for (const y of [-0.42, 0.42]) beam([1.16, 0.065, 0.08], [0, y, 1.1], palette.steel);
        const bridge = beam([0.10, 0.96, 0.10], [0, 0, 1.1]);
        const carriage = beam([0.16, 0.16, 0.13], [0, 0, 1.1], palette.primary);
        const ram = beam([0.055, 0.055, 0.95], [0, 0, 0.9], palette.steel);
        gantryParts = { bridge, carriage, ram };
    } else if (joints[0].lift) {
        const beam = (parent, size, position, color, metallic = 0.45) => {
            const mesh = addMesh(new THREE.BoxGeometry(...size), material(color, metallic), parent);
            mesh.position.set(...position);
            return mesh;
        };
        beam(robotGroup, [0.78, 0.48, 0.07], [0, 0, 0.035], palette.anthracite, 0.7);
        beam(robotGroup, [0.19, 0.19, 0.56], [0, 0, 0.33], palette.steel, 0.7);

        liftTable = new THREE.Group();
        robotGroup.add(liftTable);
        beam(liftTable, [0.98, 0.62, 0.055], [0, 0, -0.028], palette.primary, 0.55);
        beam(liftTable, [0.88, 0.52, 0.025], [0, 0, -0.068], palette.steel, 0.7);
        beam(liftTable, [0.12, 0.12, 0.45], [0, 0, -0.275], palette.guide, 0.65);

        const car = new THREE.Group();
        liftTable.add(car);
        beam(car, [0.64, 0.31, 0.075], [0, 0, 0.12], '#d94f32', 0.35);
        beam(car, [0.22, 0.30, 0.045], [0.19, 0, 0.18], '#e56a42', 0.35);
        beam(car, [0.34, 0.25, 0.13], [-0.045, 0, 0.225], '#34434a', 0.5);
        beam(car, [0.23, 0.225, 0.022], [-0.045, 0, 0.302], '#d94f32', 0.35);
        beam(car, [0.018, 0.20, 0.085], [0.132, 0, 0.229], '#9bcbd2', 0.25);
        beam(car, [0.018, 0.20, 0.075], [-0.222, 0, 0.227], '#9bcbd2', 0.25);
        for (const side of [-1, 1]) {
            beam(car, [0.22, 0.012, 0.075], [-0.045, side * 0.128, 0.23], '#9bcbd2', 0.25);
            for (const x of [-0.21, 0.21]) {
                const wheel = addMesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 20), material(palette.anthracite, 0.2), car);
                wheel.position.set(x, side * 0.165, 0.055);
                const hub = addMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.038, 16), material(palette.steel, 0.8), car);
                hub.position.copy(wheel.position);
            }
            beam(car, [0.025, 0.025, 0.04], [0.307, side * 0.105, 0.16], '#f4d77b', 0.15);
            beam(car, [0.018, 0.025, 0.035], [-0.315, side * 0.105, 0.155], '#b73b36', 0.15);
        }
        beam(car, [0.055, 0.34, 0.045], [0.327, 0, 0.105], palette.anthracite, 0.65);
        beam(car, [0.055, 0.34, 0.045], [-0.327, 0, 0.105], palette.anthracite, 0.65);
    } else {
    const base = addMesh(new THREE.CylinderGeometry(0.23, 0.28, 0.10, 48), material(palette.anthracite, 0.5));
    base.rotation.x = Math.PI / 2;
    const baseHeight = joints[0].delta ? conveyorTop : joints[0].baseOffset?.[2] ?? 0.18;
    const footHeight = joints[0].scara ? conveyorTop : baseHeight;
    base.position.z = footHeight - 0.04;
    const pedestal = addMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.10, 40), material(palette.body, 0.55));
    pedestal.rotation.x = Math.PI / 2;
    pedestal.position.z = footHeight + 0.025;
    for (const angle of [45, 135, 225, 315]) {
        const bolt = addMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6), material(palette.steel, 0.7));
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(Math.cos(angle * Math.PI / 180) * 0.22, Math.sin(angle * Math.PI / 180) * 0.22, footHeight + 0.016);
    }
    if (!joints[0].delta && joints[0].baseOffset?.[2] > 0.18) {
        const height = joints[0].baseOffset[2] - 0.18;
        const column = addMesh(new THREE.CylinderGeometry(0.09, 0.12, height, 32), material(palette.body));
        column.rotation.x = Math.PI / 2;
        column.position.z = 0.18 + height / 2;
    }
    if (joints[0].delta) {
        const deltaMotorHeight = joints[0].baseOffset[2];
        const supportHeight = deltaMotorHeight - conveyorTop;
        const ring = addMesh(new THREE.TorusGeometry(0.36, 0.025, 12, 64), material(palette.anthracite, 0.55));
        ring.position.z = deltaMotorHeight;
        for (let index = 0; index < 3; index++) {
            const angle = Math.PI / 2 + index * Math.PI * 2 / 3;
            const column = addMesh(new THREE.CylinderGeometry(0.025, 0.035, supportHeight, 12), material(palette.body, 0.5));
            column.rotation.x = Math.PI / 2;
            column.position.set(Math.cos(angle) * 0.36, Math.sin(angle) * 0.36, conveyorTop + supportHeight / 2);
        }
    }
    }
    $('joint-labels').replaceChildren();
    joints.forEach((joint, index) => {
        const hub = addMesh(new THREE.CylinderGeometry(0.068, 0.068, 0.16, 36), material(joint.type === 'R' ? palette.primary : palette.secondary, 0.4));
        const cap = addMesh(new THREE.CylinderGeometry(0.047, 0.047, 0.166, 32), material(palette.steel, 0.65));
        const link = addMesh(new THREE.CylinderGeometry(0.044, 0.053, 1, 20), material(palette.body, 0.4));
        const guide = addMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 16), material(palette.guide, 0.8));
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData.joint = index;
        hub.userData.joint = cap.userData.joint = index;
        robotGroup.add(hit);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.24, joint.type === 'R' ? palette.primary : palette.secondary, 0.05, 0.025);
        robotGroup.add(arrow);
        const label = document.createElement('button');
        label.className = `joint-label ${joint.type === 'P' ? 'p' : ''}`;
        label.textContent = `${joint.type}${index + 1}`;
        label.setAttribute('aria-label', `${index + 1}. csukló vezérlése`);
        label.onclick = () => chooseJoint(index);
        label.onpointerenter = event => { if (event.pointerType !== 'touch') showJointTeaching(index); };
        label.onpointerleave = hideJointTeaching;
        label.onfocus = () => showJointTeaching(index);
        label.onblur = hideJointTeaching;
        label.setAttribute('aria-describedby', 'joint-teaching-tooltip');
        $('joint-labels').append(label);
        meshes.push({ hub, cap, link, guide, hit, arrow, label });
    });
    gripper = new THREE.Group();
    robotGroup.add(gripper);
    const palm = addMesh(new THREE.BoxGeometry(0.07, 0.15, 0.09), material(palette.anthracite, 0.4), gripper);
    palm.position.x = -0.06;
    for (const side of [-1, 1]) {
        const finger = addMesh(new THREE.BoxGeometry(0.10, 0.025, 0.045), material(palette.steel, 0.7), gripper);
        finger.position.set(-0.01, side * 0.064, 0);
    }
    if (joints[0].delta) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(9, 3));
        geometry.setIndex([0, 1, 2]);
        const surface = new THREE.MeshStandardMaterial({ color: palette.secondary, metalness: 0.2, roughness: 0.45, side: THREE.DoubleSide });
        deltaPlatform = addMesh(geometry, surface);
    }
    tcpMarker = addMesh(new THREE.SphereGeometry(0.015, 16, 12), new THREE.MeshBasicMaterial({ color: palette.secondary }));
    tcpAxes = new THREE.AxesHelper(0.15);
    tcpAxes.setColors(palette.secondary, palette.primary, palette.anthracite);
    robotGroup.add(tcpAxes);
}

function placeRod(mesh, start, end) {
    const direction = end.clone().sub(start);
    mesh.visible = direction.length() > 0.00001;
    mesh.position.copy(start).lerp(end, 0.5);
    mesh.scale.y = direction.length();
    if (mesh.visible) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

function drawRobot() {
    result.frames.forEach((frame, index) => {
        const item = meshes[index];
        const mount = joints[index].type === 'P' ? frame.start : frame.origin;
        item.hub.position.copy(mount);
        item.hub.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), frame.axis);
        item.cap.position.copy(mount);
        item.cap.quaternion.copy(item.hub.quaternion);
        item.hub.material.emissive.set(index === selectedJoint ? (joints[index].type === 'R' ? palette.primary : palette.secondary) : palette.black);
        item.hit.position.copy(mount);
        placeRod(item.link, frame.start, frame.end);
        placeRod(item.guide, frame.origin, frame.start);
        if (gantryParts) { item.hub.visible = false; item.cap.visible = false; item.link.visible = false; item.guide.visible = false; }
        if (liftTable) { item.hub.visible = false; item.cap.visible = false; item.link.visible = false; item.guide.visible = false; }
        item.arrow.position.copy(mount);
        item.arrow.setDirection(frame.axis);
        item.arrow.visible = $('show-axes').checked;
        item.label.classList.toggle('selected', index === selectedJoint);
        item.label.setAttribute('aria-pressed', String(index === selectedJoint));
    });
    if (gantryParts) {
        gantryParts.bridge.position.x = result.frames[0].start.x;
        gantryParts.carriage.position.set(result.tip.x, result.tip.y, 1.1);
        gantryParts.ram.position.set(result.tip.x, result.tip.y, result.tip.z + 0.475);
    }
    if (liftTable) liftTable.position.z = result.tip.z;
    if (deltaPlatform) {
        const positions = result.frames.flatMap(frame => frame.end.toArray());
        deltaPlatform.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        deltaPlatform.geometry.computeVertexNormals();
    }
    gripper.position.copy(result.tip);
    gripper.quaternion.setFromRotationMatrix(result.matrix);
    tcpMarker.position.copy(result.tip);
    tcpAxes.position.copy(result.tip);
    tcpAxes.quaternion.copy(gripper.quaternion);
}

function frameRobot(view = 'home') {
    const extent = joints.reduce((sum, joint) => sum + joint.length / 1000 + (joint.type === 'P' ? Math.max(Math.abs(joint.min), Math.abs(joint.max)) / 1000 : 0), 0);
    const radius = Math.max(gameModeEnabled ? 2.25 : joints[0].delta ? 1.15 : cellEnabled ? 1.8 : 0.7, extent * 0.58);
    const center = gameModeEnabled ? new THREE.Vector3(0, 0, 0.82) : joints[0].delta ? new THREE.Vector3(0, 0, (joints[0].baseOffset[2] + conveyorTop) / 2) : cellEnabled ? new THREE.Vector3(0, 0, 1.05) : joints[0].gantry ? new THREE.Vector3(0, 0, 0.65) : new THREE.Vector3(0.15, 0, Math.max(0.38, extent * 0.27));
    orbit.target.copy(center);
    const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
    const distance = radius * (aspect < 0.9 ? 4.7 : 3.6);
    const direction = view === 'top' ? new THREE.Vector3(0, -0.001, 1) : view === 'front' ? new THREE.Vector3(0, -1, 0.08) : new THREE.Vector3(1.4, -2, 1.15).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    orbit.update();
}

function rebuildWorkspace() {
    disposeObject(workspace);
    workspace = undefined;
    if (!$('show-workspace').checked) { $('workspace-status').textContent = ''; return; }
    const samples = sampleWorkspace(joints, 2400, currentObstacle(), workHeld ? workSize : 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(samples, 3));
    workspace = new THREE.Group();
    workspace.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: palette.primary, size: 0.014, transparent: true, opacity: 0.30, depthWrite: false })));
    if (joints[0].gantry) {
        const corners = [];
        for (let mask = 0; mask < 8; mask++) {
            const copy = structuredClone(joints);
            copy.forEach((joint, index) => { joint.value = mask & (1 << index) ? joint.max : joint.min; });
            corners.push(forward(copy).tip);
        }
        const edges = [];
        corners.forEach((corner, index) => {
            for (let axis = 0; axis < 3; axis++) if (!(index & (1 << axis))) edges.push(corner, corners[index | (1 << axis)]);
        });
        workspace.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), new THREE.LineBasicMaterial({ color: palette.primary, transparent: true, opacity: 0.65 })));
    }
    scene.add(workspace);
    $('workspace-status').textContent = `${samples.length / 3} szabad TCP-minta${joints[0].gantry ? ' · téglatest: tengelyhatárok' : ' · ütközésszűrt közelítés'}`;
}

function totalDuration() {
    return pathDuration(activePathPoints(), $('loop-path').checked);
}

function rebuildPath() {
    disposeObject(pathLine);
    pathLine = undefined;
    const route = activePathPoints();
    if (route.length < 2) return;
    const positions = [];
    const copy = structuredClone(joints);
    const segmentCount = $('loop-path').checked ? route.length : route.length - 1;
    for (let index = 0; index < segmentCount; index++) {
        const nextIndex = (index + 1) % route.length;
        for (let sample = 0; sample <= 36; sample++) {
            const state = interpolateSegment(route[index].values, route[nextIndex].values, sample / 36, 1);
            copy.forEach((joint, jointIndex) => { joint.value = state.values[jointIndex]; });
            positions.push(forward(copy).tip);
        }
    }
    pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions), new THREE.LineBasicMaterial({ color: palette.secondary, transparent: true, opacity: 0.85 }));
    pathLine.visible = $('show-path').checked;
    scene.add(pathLine);
}

function renderPoints() {
    const route = activePathPoints();
    $('point-count').textContent = `${route.length} pont`;
    $('point-name').placeholder = `P${String(route.length + 1).padStart(2, '0')}`;
    $('waypoint-list').innerHTML = route.length ? route.map((point, index) => {
        const hasNext = index < route.length - 1 || $('loop-path').checked;
        const destination = index === route.length - 1 ? 'az első pontra visszatérő' : `${index + 1}.`;
        return `<div class="waypoint"><span class="waypoint-number">${String(index + 1).padStart(2, '0')}</span><div><div class="waypoint-title">${escapeText(point.name)}</div><div class="waypoint-coordinates">${point.tip.map(value => number(value * 1000, 0)).join(' / ')} mm</div></div><div class="waypoint-time">${hasNext ? `<input type="number" min="0.5" max="60" step="0.5" value="${point.duration}" data-duration="${index}" aria-label="${destination} szakasz ideje másodpercben">s` : 'Végpont'}</div><div class="waypoint-actions"><button class="icon-button" data-goto="${index}" title="Erre a pontra állítás" aria-label="${index + 1}. pontra állítás"><i data-lucide="eye"></i></button><button class="icon-button" data-replace="${index}" title="Pont felülírása a jelenlegi helyzettel" aria-label="${index + 1}. pont felülírása"><i data-lucide="refresh-cw"></i></button><button class="icon-button danger" data-delete="${index}" title="Pont törlése" aria-label="${index + 1}. pont törlése"><i data-lucide="x"></i></button></div></div>`;
    }).join('') : '<p class="empty-state">Nincs rögzített pont.</p>';
    const enabled = route.length >= 2;
    $('play-path').disabled = $('stop-path').disabled = $('timeline').disabled = !enabled;
    $('loop-path').disabled = !enabled || (gameModeEnabled && gameLevelData.requiresProgram);
    $('clear-path').disabled = !route.length;
    $('timeline').max = totalDuration() || 1;
    elapsed = Math.min(elapsed, totalDuration());
    updateTimeline();
    rebuildPath();
    icons();
}

function updateTimeline() {
    $('timeline').value = elapsed;
    $('path-time').textContent = `${number(elapsed)} / ${number(totalDuration())} s`;
}

function followPath(time) {
    const route = activePathPoints();
    if (route.length < 2) return;
    const segment = pathSegmentAt(route, time, $('loop-path').checked);
    if (!segment) return;
    const sample = interpolateSegment(route[segment.index].values, route[segment.nextIndex].values, segment.elapsed, segment.duration);
    if (!moveSafely(sample.values)) return;
    const toSI = (value, jointIndex) => value * (joints[jointIndex].type === 'R' ? Math.PI / 180 : 0.001);
    velocities = sample.velocities.map(toSI);
    accelerations = sample.accelerations.map(toSI);
    dirty = true;
    elapsed = $('loop-path').checked && totalDuration() ? time % totalDuration() : time;
    updateTimeline();
}

function renderMath() {
    if (modelName === 'delta') {
        const pose = result;
        $('math-content').innerHTML = `<div class="math-section"><h3>Delta platformhelyzet</h3><p>A három motor szöge három, rögzített hosszúságú alsó rúd végpontját határozza meg. A TCP a három azonos sugarú gömb metszéspontja.</p><div class="math-result"><strong>${number(pose.tip.z, 3)}</strong><span>m · platformmagasság</span></div><div class="math-line"><span>TCP X / Y</span><strong>${number(pose.tip.x, 3)} / ${number(pose.tip.y, 3)} m</strong></div><div class="math-line"><span>Motorállások</span><strong>${joints.map(joint => `${number(joint.value)}°`).join(' / ')}</strong></div><div class="formula">|TCP − gömbközéppontᵢ| = állandó<br>i = 1, 2, 3</div><p>A motorok együttes mozgása határozza meg a platform helyét. A motorok tartónyomatékának kijelzése közelítő statikai becslés, nem teljes dinamikai modell.</p></div>`;
        return;
    }
    const payload = effectivePayload();
    const joint = joints[mathJoint];
    const load = result.loads[mathJoint];
    const rotary = joint.type === 'R';
    const end = result.frames[mathJoint].end;
    const matrix = result.matrix.elements;
    const inertiaUnit = rotary ? 'kg·m²' : 'kg';
    $('math-content').innerHTML = `<div class="formula">${rotary ? 'τ ≈ τg + Ieff · α' : 'F ≈ Fg + meff · a'}</div><div class="math-result"><strong>${number(load.total, 2)}</strong><span>${effortUnit(joint)}</span></div><div class="math-line"><span>Gravitáció megtartása</span><strong>${number(load.holding, 2)} ${effortUnit(joint)}</strong></div><div class="math-line"><span>${rotary ? 'Effektív tehetetlenség' : 'Mozgatott tömeg'}</span><strong>${number(load.effectiveInertia, 3)} ${inertiaUnit}</strong></div><div class="math-line"><span>${rotary ? 'Szöggyorsulás' : 'Gyorsulás'}</span><strong>${number(load.acceleration, 3)} ${rotary ? 'rad/s²' : 'm/s²'}</strong></div><div class="math-line"><span>Gyorsítási hozzájárulás</span><strong>${number(load.inertial, 2)} ${effortUnit(joint)}</strong></div><div class="formula">${number(load.holding, 2)} + ${number(load.effectiveInertia, 3)} × ${number(load.acceleration, 3)}<br>= ${number(load.total, 2)} ${effortUnit(joint)}</div><div class="math-section"><h3>${joint.type}${mathJoint + 1} koordinátája</h3><div class="math-line"><span>${rotary ? 'Szög' : 'Eltolódás'}</span><strong>${number(joint.value)} ${unit(joint)} = ${number(joint.value * (rotary ? Math.PI / 180 : 0.001), 3)} ${rotary ? 'rad' : 'm'}</strong></div><div class="math-line"><span>Tag végpontja [m]</span><strong>${number(end.x, 3)} / ${number(end.y, 3)} / ${number(end.z, 3)}</strong></div></div><div class="math-section"><h3>TCP transzformációs mátrix</h3><div class="matrix">${Array.from({ length: 16 }, (_, index) => `<span>${number(matrix[(index % 4) * 4 + Math.floor(index / 4)], 2)}</span>`).join('')}</div><p class="small muted">Jobb oldali oszlop: X, Y, Z méterben. A 3×3-as blokk az orientáció.</p></div><div class="math-section"><h3>Alapösszefüggések</h3><div class="formula">F = m · g<br>M = F · k<br>v = Δs / Δt<br>ω = Δφ / Δt<br>Ep = Σ m · g · z</div><div class="math-line"><span>Végponti teher súlya</span><strong>${number(payload)} × 9,81<br>= ${number(payload * 9.81, 2)} N</strong></div></div>`;
    $('math-content').insertAdjacentHTML('beforeend', calculationTeaching(mathJoint));
}

function updateReadings() {
    joints.forEach((joint, index) => {
        const load = result.loads[index];
        const ratio = Math.abs(load.total) / joint.limit;
        const state = ratio > 1 ? 'overload' : ratio >= 0.8 ? 'warning' : 'normal';
        const caption = ratio > 1 ? 'Túlterhelés' : ratio >= 0.8 ? 'Határközeli terhelés' : 'Normál terhelés';
        const reading = `${number(load.total)} ${effortUnit(joint)} · ${number(ratio * 100, 0)}%`;
        $(`load-value-${index}`).textContent = reading;
        $(`load-${index}`).dataset.load = state;
        $(`load-${index}`).title = `${caption}: ${number(ratio * 100, 0)}%`;
        meshes[index].label.style.borderColor = state === 'normal' ? '' : palette.secondary;
        meshes[index].label.title = `${caption}: ${number(ratio * 100, 0)}%`;
        $(`load-bar-${index}`).style.width = `${Math.min(100, ratio * 100)}%`;
        $(`load-${index}`).classList.toggle('over', ratio > 1);
    });
    const overloaded = result.loads.some((load, index) => Math.abs(load.total) > joints[index].limit);
    $('overload').hidden = !overloaded;
    if (overloaded) $('overload').closest('details').open = true;
    $('tcp').innerHTML = ['x', 'y', 'z'].map(axis => `<div class="coordinate"><span>${axis.toUpperCase()}</span><strong>${number(result.tip[axis], 3)}</strong><small>m</small></div>`).join('');
    $('orientation').textContent = `ZYX Euler · Z ${number(THREE.MathUtils.radToDeg(result.orientation.z))}° / Y ${number(THREE.MathUtils.radToDeg(result.orientation.y))}° / X ${number(THREE.MathUtils.radToDeg(result.orientation.x))}°`;
    $('total-mass').textContent = `${number(result.mass)} kg`;
    $('potential').textContent = `${number(result.potential, 2)} J`;
    $('kinetic').textContent = `${number(result.loads.reduce((sum, load, index) => sum + 0.5 * load.effectiveInertia * (velocities[index] || 0) ** 2, 0), 2)} J`;
    $('tcp-speed').textContent = `${number(speed, 3)} m/s`;
    if (selectedJoint >= 0) {
        const joint = joints[selectedJoint];
        const load = result.loads[selectedJoint];
        $('popover-value').textContent = `${number(joint.value)} ${unit(joint)}`;
        $('popover-effort').textContent = $(`load-value-${selectedJoint}`).textContent;
        $('popover-effort').dataset.load = $(`load-${selectedJoint}`).dataset.load;
        $('popover-effort').title = $(`load-${selectedJoint}`).title;
        $('popover-slider').value = joint.value;
    }
    if (!$('math-panel').hidden) renderMath();
    updateTeaching();
}

function updateLabels() {
    if (!result) return;
    const rect = viewport.getBoundingClientRect();
    result.frames.forEach((frame, index) => {
        const position = (joints[index].type === 'P' ? frame.start : frame.origin).clone().project(camera);
        const label = meshes[index].label;
        const left = (position.x * 0.5 + 0.5) * rect.width + 19;
        const top = (-position.y * 0.5 + 0.5) * rect.height - 16;
        label.hidden = !$('show-labels').checked || position.z > 1 || position.z < -1 || left < 15 || left > rect.width - 15 || top < 15 || top > rect.height - 15;
        label.style.left = `${left}px`;
        label.style.top = `${top}px`;
    });
    for (const [id, position] of [['conveyor-label-a', sourcePosition], ['conveyor-label-b', targetPosition]]) {
        const label = $(id);
        const projected = position.clone().project(camera);
        label.hidden = modelName !== 'articulated' || !workEnabled || projected.z > 1 || projected.z < -1;
        label.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
        label.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height - 36}px`;
    }
}

function animate(time) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
    lastTime = time;
    if (movement === 'demo') {
        const before = joints.map(joint => joint.value);
        const period = Number($('demo-period').value);
        demoTime = (demoTime + delta) % period;
        let target;
        let nextVelocities;
        let nextAccelerations;
        if (modelName === 'articulated') {
            const raisedSource = demoOrigin.slice();
            raisedSource[1] = -50;
            const raisedTarget = raisedSource.slice();
            raisedTarget[0] = -90;
            const loweredTarget = raisedTarget.slice();
            loweredTarget[1] = -40;
            const states = [demoOrigin, raisedSource, raisedTarget, loweredTarget, raisedTarget, raisedSource, demoOrigin];
            const duration = period / (states.length - 1);
            const segment = Math.min(states.length - 2, Math.floor(demoTime / duration));
            const sample = interpolateSegment(states[segment], states[segment + 1], demoTime - segment * duration, duration);
            target = sample.values;
            const toSI = (value, index) => value * (joints[index].type === 'R' ? Math.PI / 180 : 0.001);
            nextVelocities = sample.velocities.map(toSI);
            nextAccelerations = sample.accelerations.map(toSI);
        } else {
            const frequency = 2 * Math.PI / period;
            joints.forEach((joint, index) => {
                const forwardRoom = joint.max - demoOrigin[index];
                const backwardRoom = demoOrigin[index] - joint.min;
                const direction = forwardRoom >= backwardRoom ? 1 : -1;
                const amplitude = Math.min(Math.max(forwardRoom, backwardRoom) * 0.5, (joint.max - joint.min) * 0.17);
                const phase = frequency * demoTime;
                joint.value = demoOrigin[index] + direction * amplitude * (1 - Math.cos(phase));
                const scale = joint.type === 'R' ? Math.PI / 180 : 0.001;
                velocities[index] = direction * amplitude * frequency * Math.sin(phase) * scale;
                accelerations[index] = direction * amplitude * frequency ** 2 * Math.cos(phase) * scale;
            });
            target = joints.map(joint => joint.value);
            joints.forEach((joint, index) => { joint.value = before[index]; });
        }
        if (moveSafely(target)) {
            if (nextVelocities) velocities = nextVelocities;
            if (nextAccelerations) accelerations = nextAccelerations;
        }
        dirty = true;
    } else if (pathPlaying) {
        elapsed = $('loop-path').checked
            ? (elapsed + delta) % totalDuration()
            : Math.min(totalDuration(), elapsed + delta);
        followPath(elapsed);
        checkGameButton();
        if (!gameSession?.levelComplete && !$('loop-path').checked && elapsed >= totalDuration()) {
            stopMovement();
            toast('A pályaprogram befejeződött.');
        }
    }
    if (dirty) {
        result = calculate(joints, effectivePayload(), accelerations);
        if (movement !== 'manual' && oldTip) speed = oldTip.distanceTo(result.tip) / delta;
        else speed = 0;
        oldTip = result.tip.clone();
        drawRobot();
        updateTaskScene();
        updateReadings();
        dirty = false;
    }
    checkGameButton();
    updateGameHud();
    orbit.update();
    settleWork(delta);
    updateLabels();
    renderer.render(scene, camera);
}

function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => selectTab(button.dataset.tab); });
    $('robot-info').onclick = () => $('robot-dialog').showModal();
    $('close-robot').onclick = () => $('robot-dialog').close();
    $('help').onclick = () => $('help-dialog').showModal();
    $('close-help').onclick = () => $('help-dialog').close();
    $('reset-all').onclick = async () => {
        if (await confirmAction('Új munkamenet?', 'Minden beállítás, pályapont és munkadarab-állapot alaphelyzetbe áll.')) location.reload();
    };
    $('robot-picker-toggle').onclick = () => {
        const expanded = $('robot-picker-toggle').getAttribute('aria-expanded') === 'true';
        $('robot-picker-toggle').setAttribute('aria-expanded', String(!expanded));
        $('robot-picker-panel').hidden = expanded;
    };
    $('robot-picker-panel').onclick = async event => {
        const option = event.target.closest('[data-model]');
        if (!option) return;
        const nextName = option.dataset.model;
        $('robot-picker-toggle').setAttribute('aria-expanded', 'false');
        $('robot-picker-panel').hidden = true;
        if (!await changeGeometry(preset(nextName), nextName)) {
            $('robot-picker-toggle').setAttribute('aria-expanded', 'true');
            $('robot-picker-panel').hidden = false;
        }
    };
    $('payload').onchange = event => {
        payload = THREE.MathUtils.clamp(Number(event.target.value) || 0, 0, 100);
        event.target.value = payload;
        dirty = true;
    };
    $('demo-period').onchange = event => {
        event.target.value = THREE.MathUtils.clamp(Number(event.target.value) || 8, 2, 30);
        stopMovement();
    };
    $('demo').onclick = () => {
        if (movement === 'demo') { stopMovement(); return; }
        stopMovement();
        demoOrigin = joints.map(joint => joint.value);
        demoTime = 0;
        movement = 'demo';
        updateMotionButtons();
    };
    $('home-joints').onclick = () => {
        stopMovement();
        moveSafely(initialJoints.map(joint => joint.value));
    };
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideJointTeaching(); });
    $('popover-slider').oninput = event => setJoint(selectedJoint, Number(event.target.value));
    $('close-popover').onclick = () => { selectedJoint = -1; $('joint-popover').hidden = true; dirty = true; };
    $('math-joint').onchange = event => { mathJoint = Number(event.target.value); teachingJoint = mathJoint; dirty = true; };
    for (const type of ['r', 'p']) $(`add-${type}`).onclick = async () => {
        if (joints.length >= 12) return;
        const next = structuredClone(joints);
        next.push(makeJoint(type.toUpperCase(), type === 'r' ? 'Y' : 'Z', 200, 'X'));
        await changeGeometry(next);
    };
    $('builder-list').onchange = async event => {
        const input = event.target;
        const key = input.dataset.config;
        if (!key) return;
        const index = Number(input.dataset.index);
        if (index === 0 && joints[0].type === 'R' && ['type', 'axis'].includes(key)) { renderBuilder(); return; }
        const next = structuredClone(joints);
        if (input.type === 'number') {
            if (input.value === '' || !Number.isFinite(Number(input.value))) { renderBuilder(); return; }
            next[index][key] = THREE.MathUtils.clamp(Number(input.value), Number(input.min), Number(input.max));
        } else next[index][key] = input.value;
        if (key === 'type') {
            next[index].min = input.value === 'R' ? -180 : 0;
            next[index].max = input.value === 'R' ? 180 : 400;
            next[index].limit = input.value === 'R' ? 100 : 400;
        }
        if (next[index].min >= next[index].max) {
            toast('Az alsó határnak kisebbnek kell lennie a felsőnél.');
            renderBuilder();
            return;
        }
        next[index].value = THREE.MathUtils.clamp(next[index].value, next[index].min, next[index].max);
        if (!await changeGeometry(next)) renderBuilder();
    };
    $('builder-list').onclick = async event => {
        const remove = event.target.closest('[data-remove]');
        const reorder = event.target.closest('[data-reorder]');
        if (!remove && !reorder) return;
        const index = Number((remove || reorder).dataset.remove ?? (remove || reorder).dataset.reorder);
        if (joints[0].type === 'R' && (index === 0 || (reorder && index === 1 && Number(reorder.dataset.direction) < 0))) return;
        const next = structuredClone(joints);
        if (remove && joints.length > 1) next.splice(Number(remove.dataset.remove), 1);
        else if (reorder) {
            const index = Number(reorder.dataset.reorder);
            const destination = index + Number(reorder.dataset.direction);
            [next[index], next[destination]] = [next[destination], next[index]];
        }
        await changeGeometry(next);
    };
    $('record').onclick = () => {
        stopMovement();
        const route = activePathPoints();
        if (route.length >= 100) { toast('Legfeljebb 100 pályapont rögzíthető.'); return; }
        const duration = THREE.MathUtils.clamp(Number($('point-duration').value) || 2, 0.5, 60);
        $('point-duration').value = duration;
        route.push({ name: $('point-name').value.trim() || `P${String(route.length + 1).padStart(2, '0')}`, values: joints.map(joint => joint.value), tip: forward(joints).tip.toArray(), duration });
        $('point-name').value = '';
        renderPoints();
        toast(`${route[route.length - 1].name} rögzítve.`);
    };
    $('waypoint-list').onclick = async event => {
        const go = event.target.closest('[data-goto]');
        const replace = event.target.closest('[data-replace]');
        const remove = event.target.closest('[data-delete]');
        if (!go && !replace && !remove) return;
        const route = activePathPoints();
        stopMovement();
        if (go) {
            const index = Number(go.dataset.goto);
            moveSafely(route[index].values);
            elapsed = route.slice(0, index).reduce((sum, point) => sum + point.duration, 0);
            updateTimeline();
        } else if (replace) {
            const index = Number(replace.dataset.replace);
            if (!await confirmAction('Pont felülírása?', `${route[index].name} a robot jelenlegi csuklóhelyzetét kapja.`)) return;
            route[index].values = joints.map(joint => joint.value);
            route[index].tip = forward(joints).tip.toArray();
            renderPoints();
        } else {
            route.splice(Number(remove.dataset.delete), 1);
            elapsed = 0;
            renderPoints();
        }
    };
    $('waypoint-list').onchange = event => {
        if (event.target.dataset.duration === undefined) return;
        stopMovement();
        activePathPoints()[Number(event.target.dataset.duration)].duration = THREE.MathUtils.clamp(Number(event.target.value) || 2, 0.5, 60);
        elapsed = 0;
        renderPoints();
    };
    $('play-path').onclick = () => {
        if (activePathPoints().length < 2) return;
        if (pathPlaying) { stopMovement(); movement = 'path'; updateMotionButtons(); return; }
        stopMovement();
        if (elapsed >= totalDuration()) elapsed = 0;
        movement = 'path';
        pathPlaying = true;
        followPath(elapsed);
        updateMotionButtons();
    };
    $('stop-path').onclick = () => {
        stopMovement();
        elapsed = 0;
        followPath(0);
        velocities = accelerations = joints.map(() => 0);
    };
    $('timeline').oninput = event => {
        stopMovement();
        elapsed = Number(event.target.value);
        followPath(elapsed);
        velocities = accelerations = joints.map(() => 0);
    };
    $('loop-path').onchange = () => {
        if (movement !== 'manual') stopMovement();
        elapsed = 0;
        renderPoints();
    };
    $('clear-path').onclick = async () => {
        stopMovement();
        if (await confirmAction('Pályaprogram törlése?', gameModeEnabled ? 'A játék session saját útvonalának pontjai törlődnek.' : 'Az összes rögzített pont véglegesen törlődik ebből a munkamenetből.')) {
            if (gameModeEnabled && gameSession) gameSession.route = [];
            else points = [];
            elapsed = 0;
            renderPoints();
        }
    };
    $('show-workspace').onchange = rebuildWorkspace;
    $('cell-enabled').onchange = applyCellState;
    $('game-enabled').onchange = event => setGameMode(event.target.checked);
    $('game-reset').onclick = resetGameSession;
    $('game-next').onclick = advanceGameLevel;
    $('work-mass').onchange = event => {
        event.target.value = THREE.MathUtils.clamp(Number(event.target.value) || 0.5, 0.1, 50);
        dirty = true;
    };
    $('work-enabled').onchange = event => {
        if (modelName !== 'articulated') return;
        stopMovement();
        const activating = event.target.checked;
        if (activating) {
            const safeStart = preset('articulated').map(joint => joint.value);
            const reason = collisionReason(forward(preset('articulated')), currentObstacle(cellEnabled), 0);
            if (reason) {
                event.target.checked = false;
                toast(`A biztonságos kezdőhelyzet nem állítható be: ${reason}.`);
                return;
            }
            joints.forEach((joint, index) => { joint.value = safeStart[index]; });
            selectedJoint = -1;
            $('joint-popover').hidden = true;
            velocities = accelerations = joints.map(() => 0);
            oldTip = undefined;
            speed = 0;
        }
        workEnabled = activating;
        workHeld = false;
        workVelocity = 0;
        workDelivered = false;
        workMesh.position.copy(sourcePosition);
        updateTaskScene();
        rebuildWorkspace();
        dirty = true;
    };
    $('grip').onclick = () => {
        stopMovement();
        const pose = forward(joints);
        if (workMesh.position.distanceTo(pose.tip) > 0.09) { toast('A TCP túl messze van: közelíts 90 mm-en belül a munkadarabhoz.'); return; }
        const reason = collisionReason(pose, currentObstacle(), workSize);
        if (reason) { toast(`${reason}: nincs elég hely a megfogáshoz.`); return; }
        workHeld = true;
        workVelocity = 0;
        updateTaskScene();
        rebuildWorkspace();
        dirty = true;
        toast('Munkadarab megfogva; a tömege hozzáadódott a végponti teherhez.');
    };
    $('release').onclick = () => {
        stopMovement();
        const delivered = Math.abs(workMesh.position.x - targetPosition.x) <= 0.14 && Math.abs(workMesh.position.y - targetPosition.y) <= 0.07 && workMesh.position.z >= conveyorTop - 0.08;
        workDelivered = delivered;
        releaseWork();
        toast(delivered ? 'Átrakás kész: a darab a B konvejorra került.' : 'Munkadarab elengedve. Vidd a B konvejor fölé az átrakáshoz.');
    };
    $('show-path').onchange = () => { if (pathLine) pathLine.visible = $('show-path').checked; };
    $('show-axes').onchange = () => { dirty = true; };
    $('camera-home').onclick = () => frameRobot();
    $('camera-top').onclick = () => frameRobot('top');
    $('camera-front').onclick = () => frameRobot('front');
    $('fullscreen').onclick = async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await viewport.requestFullscreen();
        } catch { toast('A böngésző nem engedélyezte a teljes képernyőt.'); }
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopMovement(); });
}

function start() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.scene);
    scene.fog = new THREE.Fog(palette.scene, 9, 28);
    camera = new THREE.PerspectiveCamera(38, 1, 0.02, 100);
    camera.up.set(0, 0, 1);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.domElement.setAttribute('aria-label', 'Interaktív 3D robotmodell');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        stopMovement();
        $('scene-loading').hidden = false;
        $('scene-loading').classList.add('error');
        $('loading-detail').textContent = 'A grafikus kapcsolat megszakadt. Frissítsd az oldalt a megjelenítés újraindításához.';
    });
    viewport.prepend(renderer.domElement);
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.minDistance = 0.45;
    orbit.maxDistance = 30;
    orbit.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight(palette.white, '#aaa4b5', 2.6));
    const sun = new THREE.DirectionalLight(palette.white, 4.2);
    sun.position.set(-3, -4, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(palette.white, 1.7);
    fill.position.set(4, 3, 4);
    scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material(palette.floor, 0));
    floor.position.z = -0.005;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(20, 100, '#cfc7df', '#e1dce9');
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    scene.add(grid);
    const worldAxes = new THREE.AxesHelper(0.45);
    worldAxes.setColors(palette.secondary, palette.primary, palette.anthracite);
    worldAxes.position.set(-0.4, -0.4, 0.008);
    scene.add(worldAxes);
    new ResizeObserver(() => {
        camera.aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
        camera.updateProjectionMatrix();
        renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    }).observe(viewport);
    const raycaster = new THREE.Raycaster();
    let down;
    renderer.domElement.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || event.buttons) { hideJointTeaching(); return; }
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
        const hit = raycaster.intersectObjects(meshes.flatMap(item => [item.hit, item.hub, item.cap]))[0];
        const index = hit ? hit.object.userData.joint : -1;
        renderer.domElement.style.cursor = index >= 0 ? 'pointer' : '';
        if (index >= 0 && hoveredJoint !== index) showJointTeaching(index);
        else if (index < 0) hideJointTeaching();
    });
    renderer.domElement.addEventListener('pointerleave', hideJointTeaching);
    renderer.domElement.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
    renderer.domElement.addEventListener('pointerup', event => {
        if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
        const hit = raycaster.intersectObjects(meshes.flatMap(item => [item.hit, item.hub, item.cap]))[0];
        if (hit) chooseJoint(hit.object.userData.joint);
    });
    createTaskScene();
    bindEvents();
    renderControls();
    renderBuilder();
    rebuildRobot();
    renderPoints();
    frameRobot();
    updateMotionButtons();
    $('scene-loading').hidden = true;
    requestAnimationFrame(animate);
}

try {
    start();
} catch (error) {
    console.error(error);
    $('scene-loading').classList.add('error');
    $('loading-detail').textContent = `A 3D-nézet nem indult el. WebGL-képes böngésző szükséges. ${error.message}`;
}
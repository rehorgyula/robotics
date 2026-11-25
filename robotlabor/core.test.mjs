import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, forward, makeJoint, interpolateSegment, pathDuration, pathSegmentAt, rootJointConstraint, sampleWorkspace, preset, collisionReason, safeMotion, segmentHitsBox } from './core.mjs';
import { createGameLevel, gameScore, gameStarsFromScore, recordGameStarStreak } from './game.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('horizontal rotary arm includes link mass, payload and lever length', () => {
    const joint = makeJoint('R', 'Y', 1000, 'X');
    const result = calculate([joint], 3);
    close(result.tip.x, 1);
    close(result.loads[0].holding, -(2 * 0.5 + 3) * 9.81);
    close(result.loads[0].effectiveInertia, 2 * 0.5 ** 2 + 3);
});

test('vertical rotation has zero gravitational torque', () => {
    close(calculate([makeJoint('R', 'Z', 1000, 'X')], 4).loads[0].holding, 0);
});

test('vertical slide needs weight plus accelerating moving mass', () => {
    const result = calculate([makeJoint('P', 'Z', 100, 'Z', 200)], 3, [2]);
    close(result.tip.z, 0.48);
    close(result.loads[0].holding, 5 * 9.81);
    close(result.loads[0].total, 5 * 9.81 + 10);
});

test('serial rotation transforms subsequent prismatic axes', () => {
    const result = forward([makeJoint('R', 'Z', 0, 'X', 90), makeJoint('P', 'X', 0, 'X', 500)]);
    close(result.tip.x, 0);
    close(result.tip.y, 0.5);
});

test('holding effort matches potential energy derivative for mixed chains', () => {
    const joints = preset('cylindrical');
    joints.push(makeJoint('R', 'Y', 300, 'X', 30));
    for (let index = 0; index < joints.length; index++) {
        const step = joints[index].type === 'R' ? 0.0001 * 180 / Math.PI : 0.1;
        const above = structuredClone(joints);
        const below = structuredClone(joints);
        above[index].value += step;
        below[index].value -= step;
        const derivative = (calculate(above, 2).potential - calculate(below, 2).potential) / 0.0002;
        close(calculate(joints, 2).loads[index].holding, derivative, 1e-5);
    }
});

test('quintic interpolation starts and ends at rest', () => {
    for (const elapsed of [0, 3]) {
        const result = interpolateSegment([0], [90], elapsed, 3);
        close(result.velocities[0], 0);
        close(result.accelerations[0], 0);
        close(result.values[0], elapsed === 0 ? 0 : 90);
    }
    close(interpolateSegment([0], [90], 1.5, 3).values[0], 45);
});

test('workspace sampling is repeatable and does not mutate the robot', () => {
    const joints = preset('cartesian');
    const original = structuredClone(joints);
    const cloud = sampleWorkspace(joints, 50);
    assert.equal(cloud.length, 150);
    assert.deepEqual(joints, original);
    assert.deepEqual(cloud, sampleWorkspace(joints, 50));
    assert.ok([...cloud].every(Number.isFinite));
});

test('Cartesian gantry coordinates follow three orthogonal slides and a downward tool', () => {
    const joints = preset('cartesian');
    const home = forward(joints);
    close(home.tip.x, 0);
    close(home.tip.y, 0);
    close(home.tip.z, 0.65);
    joints[0].value += 100;
    close(forward(joints).tip.x, 0.1);
    close(forward(joints).tip.z, home.tip.z);
    const cloud = sampleWorkspace(joints, 100);
    for (let index = 0; index < cloud.length; index += 3) {
        assert.ok(cloud[index] >= -0.4 && cloud[index] <= 0.4);
        assert.ok(cloud[index + 1] >= -0.3 && cloud[index + 1] <= 0.3);
        assert.ok(cloud[index + 2] >= 0.1 && cloud[index + 2] <= 0.95);
    }
});

test('workspace excludes below-floor configurations', () => {
    const cloud = sampleWorkspace(preset('articulated'), 300);
    assert.equal(cloud.length, 900);
    for (let index = 2; index < cloud.length; index += 3) assert.ok(cloud[index] >= 0.085);
});

test('motion is stopped before a robot arm crosses the floor', () => {
    const joints = [makeJoint('R', 'Y', 1000, 'X', 0)];
    const safe = safeMotion(joints, [90]);
    assert.ok(safe.reason);
    assert.ok(safe.values[0] < 90);
    joints[0].value = safe.values[0];
    assert.equal(collisionReason(forward(joints)), '');
});

test('expanded segment-box test detects intermediate obstacle crossings', () => {
    const obstacle = { min: { x: 0.4, y: -0.1, z: 0.1 }, max: { x: 0.6, y: 0.1, z: 0.4 } };
    assert.ok(segmentHitsBox({ x: 0, y: 0, z: 0.2 }, { x: 1, y: 0, z: 0.2 }, obstacle));
    assert.ok(!segmentHitsBox({ x: 0, y: 1, z: 0.2 }, { x: 1, y: 1, z: 0.2 }, obstacle));
    assert.equal(collisionReason(forward([makeJoint('R', 'Z', 1000, 'X')]), obstacle), 'Akadályütközés');
});

test('all preset home configurations are clear of the floor and pedestal', () => {
    for (const name of ['articulated', 'scara', 'cartesian', 'cylindrical', 'polar', 'lift', 'cobot']) {
        assert.equal(collisionReason(forward(preset(name))), '', name);
    }
});

test('Cartesian robot can approach a floor part without penetrating the floor', () => {
    const joints = preset('cartesian');
    const safe = safeMotion(joints, [760, 500, -1000], null, 0.08);
    assert.equal(safe.reason, '');
    joints.forEach((joint, index) => { joint.value = safe.values[index]; });
    const pose = forward(joints);
    close(pose.tip.x, 0.36);
    close(pose.tip.y, 0.2);
    close(pose.tip.z, 0.1);
    assert.ok(pose.tip.distanceTo({ x: 0.36, y: 0.2, z: 0.04 }) < 0.09);
});

test('motion checks the swept path even when both endpoints are clear', () => {
    const joints = [makeJoint('R', 'Z', 1000, 'X', -60)];
    const obstacle = { min: { x: 0.45, y: -0.05, z: 0.1 }, max: { x: 0.55, y: 0.05, z: 0.4 } };
    assert.equal(collisionReason(forward(joints), obstacle), '');
    const target = structuredClone(joints);
    target[0].value = 60;
    assert.equal(collisionReason(forward(target), obstacle), '');
    const safe = safeMotion(joints, [60], obstacle);
    assert.equal(safe.reason, 'Akadályütközés');
    assert.ok(safe.values[0] < 0);
});

test('Cartesian workspace excludes the expanded obstacle region', () => {
    const obstacle = { min: { x: -0.1, y: -0.1, z: 0 }, max: { x: 0.1, y: 0.1, z: 0.4 } };
    const cloud = sampleWorkspace(preset('cartesian'), 200, obstacle);
    assert.equal(cloud.length, 600);
    for (let index = 0; index < cloud.length; index += 3) {
        assert.ok(!(Math.abs(cloud[index]) < 0.18 && Math.abs(cloud[index + 1]) < 0.18 && cloud[index + 2] < 0.48));
    }
});

test('Delta forward kinematics place the platform below three symmetric arms', () => {
    const joints = preset('delta');
    const pose = forward(joints);
    assert.deepEqual(joints.map(joint => joint.value), [80, 80, 80]);
    assert.equal(joints[0].baseOffset[2], 1.55);
    close(pose.tip.x, 0);
    close(pose.tip.y, 0);
    assert.ok(pose.tip.z > 0.38);
    assert.equal(pose.frames.length, 3);
    for (const frame of pose.frames) close(frame.end.distanceTo(pose.tip), 0.08);
    assert.equal(collisionReason(pose), '');
    const moved = structuredClone(joints);
    moved[1].value = 70;
    assert.deepEqual(moved.map(joint => joint.value), [80, 70, 80]);
    const movedPose = forward(moved);
    close(movedPose.frames[0].origin.distanceTo(pose.frames[0].origin), 0);
    close(movedPose.frames[0].start.distanceTo(pose.frames[0].start), 0);
    assert.ok(movedPose.frames[0].end.distanceTo(pose.frames[0].end) > 0);
    assert.notEqual(movedPose.tip.z, pose.tip.z);
});

test('Articulated robot can transfer a held part between both conveyor poses', () => {
    const joints = preset('articulated');
    const opening = 0.185;
    const cell = { walls: [
        { min: { x: -1.0675, y: -1.05, z: 0.1 }, max: { x: -1.0325, y: -opening, z: 2.2 } },
        { min: { x: -1.0675, y: opening, z: 0.1 }, max: { x: -1.0325, y: 1.05, z: 2.2 } },
        { min: { x: -1.0675, y: -opening, z: 0.43 }, max: { x: -1.0325, y: opening, z: 2.2 } },
        { min: { x: 1.0325, y: -1.05, z: 0.1 }, max: { x: 1.0675, y: 1.05, z: 2.2 } },
        { min: { x: -1.05, y: -1.0675, z: 0.1 }, max: { x: -opening, y: -1.0325, z: 2.2 } },
        { min: { x: opening, y: -1.0675, z: 0.1 }, max: { x: 1.05, y: -1.0325, z: 2.2 } },
        { min: { x: -opening, y: -1.0675, z: 0.43 }, max: { x: opening, y: -1.0325, z: 2.2 } },
        { min: { x: -1.05, y: 1.0325, z: 0.1 }, max: { x: 1.05, y: 1.0675, z: 2.2 } },
    ], solids: [
        { min: { x: -0.38, y: -0.38, z: 0 }, max: { x: 0.38, y: 0.38, z: 0.35 }, kind: 'machine' },
        { min: { x: -1.35, y: -0.15, z: 0 }, max: { x: -0.33, y: 0.15, z: 0.35 }, kind: 'conveyor', surfaceZ: 0.38 },
        { min: { x: -0.15, y: -1.35, z: 0 }, max: { x: 0.15, y: -0.33, z: 0.35 }, kind: 'conveyor', surfaceZ: 0.38 },
    ] };
    const parked = forward(joints);
    assert.equal(collisionReason(parked, cell), '');
    assert.ok(parked.tip.x > 0.3 && parked.tip.y > 0.3 && parked.tip.z > 0.6);
    let values = joints.map(joint => joint.value);
    const moveJoint = (index, value, heldSize = 0) => {
        const target = values.slice();
        target[index] = value;
        const current = joints.map((joint, jointIndex) => ({ ...joint, value: values[jointIndex] }));
        const motion = safeMotion(current, target, cell, heldSize);
        assert.equal(motion.reason, '');
        values = motion.values;
    };
    moveJoint(0, -180);
    moveJoint(1, -40);
    moveJoint(2, 100);
    const pickupJoints = structuredClone(joints);
    pickupJoints.forEach((joint, index) => { joint.value = values[index]; });
    const pickup = forward(pickupJoints);
    assert.equal(collisionReason(pickup, cell), '');
    assert.ok(pickup.tip.distanceTo({ x: -0.84, y: 0, z: 0.42 }) < 0.09);
    moveJoint(1, -50, 0.08);
    moveJoint(0, -90, 0.08);
    moveJoint(1, -40, 0.08);
    const placement = structuredClone(joints);
    placement.forEach((joint, index) => { joint.value = values[index]; });
    const pose = forward(placement);
    assert.ok(pose.tip.distanceTo({ x: 0, y: -0.84, z: 0.42 }) < 0.09);
});

test('Cell panels allow internal poses and stop links crossing the walls and roof', () => {
    const cell = { walls: [
        { min: { x: 1.0325, y: -0.55, z: 0.1 }, max: { x: 1.0675, y: 0.55, z: 2.2 } },
        { min: { x: -1.0675, y: -0.55, z: 0.1 }, max: { x: -1.0325, y: 0.55, z: 2.2 } },
        { min: { x: -1.05, y: 0.5325, z: 0.1 }, max: { x: 1.05, y: 0.5675, z: 2.2 } },
        { min: { x: -1.05, y: -1.05, z: 2.1825 }, max: { x: 1.05, y: 1.05, z: 2.2175 } },
        { min: { x: -1.05, y: -0.5675, z: 0.1 }, max: { x: 1.05, y: -0.5325, z: 2.2 } },
    ] };
    assert.equal(collisionReason(forward([makeJoint('R', 'Y', 500, 'X')]), cell), '');
    assert.equal(collisionReason(forward([makeJoint('R', 'Y', 1500, 'X')]), cell), 'Cella ütközés');
    assert.equal(collisionReason(forward([makeJoint('R', 'Y', 2500, 'Z')]), cell), 'Cella ütközés');
});

test('looped path adds a timed last-to-first segment without a positional jump', () => {
    const points = [
        { values: [0], duration: 2 },
        { values: [10], duration: 3 },
        { values: [20], duration: 4 },
    ];
    assert.equal(pathDuration(points), 5);
    assert.equal(pathDuration(points, true), 9);
    const closing = pathSegmentAt(points, 6, true);
    assert.deepEqual(closing, { index: 2, nextIndex: 0, elapsed: 1, duration: 4 });
    assert.equal(interpolateSegment(points[closing.index].values, points[closing.nextIndex].values, closing.elapsed, closing.duration).values[0], 17.9296875);
    assert.deepEqual(pathSegmentAt(points, 9, true), { index: 0, nextIndex: 1, elapsed: 0, duration: 2 });
    assert.deepEqual(pathSegmentAt(points, 9, false), { index: 1, nextIndex: 2, elapsed: 3, duration: 3 });
});

test('R1 is a rotary joint on the Z axis', () => {
    assert.equal(rootJointConstraint([makeJoint('R', 'Z')]), '');
    assert.match(rootJointConstraint([makeJoint('R', 'X')]), /R1.*Z tengelyű forgócsukló/);
    assert.equal(rootJointConstraint([makeJoint('P', 'X')]), '');
    for (const name of ['articulated', 'scara', 'cylindrical', 'polar', 'cobot', 'delta']) {
        assert.equal(rootJointConstraint(preset(name)), '', name);
    }
});

test('game levels cover a growing route-planning challenge with separate scoring', () => {
    const first = createGameLevel(1);
    const sofa = createGameLevel(2);
    const cabinet = createGameLevel(3);
    const wall = createGameLevel(4);
    const early = createGameLevel(10);
    const route = createGameLevel(20);
    const final = createGameLevel(30);
    assert.equal(first.level, 1);
    assert.equal(first.target.surface, 'padló');
    assert.equal(sofa.target.surface, 'kanapé oldala');
    assert.equal(cabinet.target.surface, 'szekrény teteje');
    assert.deepEqual(wall.target.normal, [1, 0, 0]);
    assert.ok(new Set(Array.from({ length: 10 }, (_, index) => createGameLevel(index + 1).target.normal.join(','))).size >= 3);
        assert.equal(new Set(Array.from({ length: 30 }, (_, index) => {
            const { x, y, z } = createGameLevel(index + 1).target;
            return `${x},${y},${z}`;
        })).size, 10);
    assert.equal(first.requiresProgram, false);
    assert.equal(early.obstacles.length, 1);
    assert.equal(route.requiresProgram, true);
    assert.equal(route.requiredPoints, 3);
    assert.ok(route.obstacles.length >= 2);
    assert.ok(final.obstacles.length > route.obstacles.length);
    assert.equal(gameScore(3, 20), 8600);
    assert.ok(gameScore(3, 10) > gameScore(4, 20));
    assert.equal(gameStarsFromScore(6999), 1);
    assert.equal(gameStarsFromScore(7000), 2);
    assert.equal(gameStarsFromScore(8699), 2);
    assert.equal(gameStarsFromScore(8700), 3);
    assert.equal(gameScore(3, 20, 15), gameScore(3, 5));
    assert.deepEqual(recordGameStarStreak(0, 3), { streak: 1, pendingBonusSeconds: 0, rewardEarned: false });
    assert.deepEqual(recordGameStarStreak(1, 3), { streak: 0, pendingBonusSeconds: 15, rewardEarned: true });
    assert.deepEqual(recordGameStarStreak(1, 2), { streak: 0, pendingBonusSeconds: 0, rewardEarned: false });
});

test('SCARA starts R1 above a 500 mm vertical shaft from the machine bed', () => {
    const scara = preset('scara');
    assert.deepEqual(scara[0].baseOffset, [0, 0, 0.88]);
    assert.equal(scara[0].scara, true);
    assert.equal(forward(scara).frames[0].origin.z - 0.38, 0.5);
});
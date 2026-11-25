import { Matrix4, Vector3, MathUtils, Euler } from './vendor/three.mjs';

export const gravity = 9.81;
export const axisVector = axis => new Vector3(...({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis]));
export const coordinate = joint => joint.type === 'R' ? MathUtils.degToRad(joint.value) : joint.value / 1000;
export const makeJoint = (type = 'R', axis = 'Z', length = 300, linkAxis = 'X', value = 0) => ({
    type, axis, length, linkAxis, value, mass: 2, limit: type === 'R' ? 100 : 400,
    min: type === 'R' ? -180 : 0, max: type === 'R' ? 180 : 400,
});

export function preset(name) {
    const rotary = (axis, length, linkAxis, value = 0) => makeJoint('R', axis, length, linkAxis, value);
    const linear = (axis, length = 60, linkAxis = axis, value = 100) => makeJoint('P', axis, length, linkAxis, value);
    const models = {
        articulated: [rotary('Z', 250, 'Z', 45), rotary('Y', 450, 'X', -50), rotary('Y', 350, 'X', 75), rotary('X', 100, 'X'), rotary('Y', 150, 'X', -30), rotary('X', 100, 'X')],
        scara: [rotary('Z', 400, 'X', 25), rotary('Z', 300, 'X', -65), linear('Z', 80, 'Z'), rotary('Z', 100, 'X')],
        cartesian: [linear('X', 0), linear('Y', 0), linear('Z', 0)],
        cylindrical: [rotary('Z', 150, 'Z', 30), linear('Z', 120), linear('X', 160)],
        polar: [rotary('Z', 200, 'Z', 25), rotary('Y', 150, 'X', -30), linear('X', 180)],
        lift: [linear('Z', 120, 'Z', 200)],
        cobot: [rotary('Z', 200, 'Z', 20), rotary('Y', 300, 'X', -45), rotary('X', 100, 'X'), rotary('Y', 300, 'X', 80), rotary('X', 100, 'X'), rotary('Y', 150, 'X', -35), rotary('X', 100, 'X')],
        delta: [rotary('Z', 240, 'X', 80), rotary('Y', 240, 'X', 80), rotary('Y', 240, 'X', 80)],
    };
    const selected = structuredClone(models[name] || models.articulated);
    if (name === 'delta') {
        selected[0].delta = true;
        selected[0].baseOffset = [0, 0, 1.55];
        selected[0].min = selected[1].min = selected[2].min = -15;
        selected[0].max = selected[1].max = selected[2].max = 80;
        selected[0].mass = selected[1].mass = selected[2].mass = 1.5;
        selected[0].limit = selected[1].limit = selected[2].limit = 50;
    }
    if (name === 'cartesian') {
        selected[0].baseOffset = [-0.4, -0.3, 1.1];
        selected[0].gantry = true;
        selected[0].max = 800;
        selected[0].value = 400;
        selected[1].max = 600;
        selected[1].value = 300;
        selected[2].min = -1000;
        selected[2].max = -150;
        selected[2].value = -450;
        selected[2].toolDown = true;
    }
    if (name === 'scara') {
        selected[0].baseOffset = [0, 0, 0.88];
        selected[0].scara = true;
        selected[0].min = -150;
        selected[0].max = 150;
        selected[1].min = -145;
        selected[1].max = 145;
        selected[2].min = -350;
        selected[2].max = 0;
        selected[2].value = -150;
    }
    if (['articulated', 'cobot'].includes(name)) {
        selected[1].min = -100;
        selected[1].max = 80;
        selected[2].min = -135;
        selected[2].max = 135;
    }
    if (name === 'polar') { selected[1].min = -80; selected[1].max = 30; }
    if (name === 'lift') selected[0].lift = true;
    if (['articulated', 'cylindrical', 'polar', 'lift', 'cobot'].includes(name)) selected[0].baseOffset = [0, 0, 0.38];
    if (name === 'articulated') selected[0].machineBase = true;
    return selected;
}

export function forward(joints) {
    if (joints[0]?.delta) return forwardDelta(joints);
    const transform = new Matrix4().makeTranslation(...(joints[0]?.baseOffset || [0, 0, 0.18]));
    const frames = [];
    for (const joint of joints) {
        const origin = new Vector3().setFromMatrixPosition(transform);
        const axis = axisVector(joint.axis).transformDirection(transform);
        if (joint.type === 'R') transform.multiply(new Matrix4().makeRotationAxis(axisVector(joint.axis), coordinate(joint)));
        else {
            const shift = axisVector(joint.axis).multiplyScalar(coordinate(joint));
            transform.multiply(new Matrix4().makeTranslation(shift.x, shift.y, shift.z));
        }
        const start = new Vector3().setFromMatrixPosition(transform);
        const offset = axisVector(joint.linkAxis).multiplyScalar(joint.length / 1000);
        transform.multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z));
        const end = new Vector3().setFromMatrixPosition(transform);
        frames.push({ origin, axis, start, end, center: start.clone().lerp(end, 0.5), matrix: transform.clone() });
    }
    if (joints.at(-1)?.toolDown) transform.multiply(new Matrix4().makeRotationY(Math.PI / 2));
    return { frames, tip: new Vector3().setFromMatrixPosition(transform), matrix: transform, orientation: new Euler().setFromRotationMatrix(transform, 'ZYX'), gantry: Boolean(joints[0]?.gantry), machineBase: Boolean(joints[0]?.machineBase) };
}

function forwardDelta(joints) {
    const baseRadius = 0.32;
    const platformRadius = 0.08;
    const upperLength = 0.24;
    const lowerLength = 0.55;
    const motorHeight = joints[0].baseOffset?.[2] ?? 1.05;
    const radial = [0, 1, 2].map(index => {
        const angle = Math.PI / 2 + index * Math.PI * 2 / 3;
        return new Vector3(Math.cos(angle), Math.sin(angle), 0);
    });
    const centers = joints.map((joint, index) => {
        const angle = MathUtils.degToRad(joint.value);
        return radial[index].clone().multiplyScalar(baseRadius - upperLength * Math.cos(angle))
            .add(new Vector3(0, 0, motorHeight - upperLength * Math.sin(angle)))
            .addScaledVector(radial[index], -platformRadius);
    });
    const u = centers[1].clone().sub(centers[0]);
    const v = centers[2].clone().sub(centers[0]);
    const uu = u.dot(u);
    const uv = u.dot(v);
    const vv = v.dot(v);
    const rightU = (centers[1].lengthSq() - centers[0].lengthSq()) / 2;
    const rightV = (centers[2].lengthSq() - centers[0].lengthSq()) / 2;
    const determinant = uu * vv - uv * uv;
    const alpha = (rightU * vv - rightV * uv) / determinant;
    const beta = (rightV * uu - rightU * uv) / determinant;
    const closest = u.clone().multiplyScalar(alpha).addScaledVector(v, beta);
    const normal = u.clone().cross(v).normalize();
    const offset = closest.clone().sub(centers[0]);
    const discriminant = offset.dot(normal) ** 2 - (offset.lengthSq() - lowerLength ** 2);
    if (discriminant < 0) throw new RangeError('A Delta robot karjai nem érik el közös platformhelyzetet.');
    const root = Math.sqrt(discriminant);
    const candidates = [closest.clone().addScaledVector(normal, -offset.dot(normal) - root), closest.clone().addScaledVector(normal, -offset.dot(normal) + root)];
    const tip = candidates.sort((first, second) => first.z - second.z)[0];
    const frames = joints.map((joint, index) => {
        const origin = radial[index].clone().multiplyScalar(baseRadius).setZ(motorHeight);
        const angle = MathUtils.degToRad(joint.value);
        const start = radial[index].clone().multiplyScalar(baseRadius - upperLength * Math.cos(angle)).setZ(motorHeight - upperLength * Math.sin(angle));
        const end = tip.clone().addScaledVector(radial[index], platformRadius);
        return { origin, axis: new Vector3(-radial[index].y, radial[index].x, 0), start, end, center: origin.clone().lerp(start, 0.5), lowerCenter: start.clone().lerp(end, 0.5), matrix: new Matrix4().makeTranslation(start.x, start.y, start.z) };
    });
    const matrix = new Matrix4().makeTranslation(tip.x, tip.y, tip.z);
    return { frames, tip, matrix, orientation: new Euler(), gantry: false, machineBase: false };
}

export function segmentHitsBox(start, end, box, padding = 0) {
    let near = 0;
    let far = 1;
    for (const axis of ['x', 'y', 'z']) {
        const lower = box.min[axis] - padding;
        const upper = box.max[axis] + padding;
        const delta = end[axis] - start[axis];
        if (Math.abs(delta) < 1e-10) {
            if (start[axis] < lower || start[axis] > upper) return false;
        } else {
            const first = (lower - start[axis]) / delta;
            const second = (upper - start[axis]) / delta;
            near = Math.max(near, Math.min(first, second));
            far = Math.min(far, Math.max(first, second));
            if (near > far) return false;
        }
    }
    return true;
}

export function collisionReason(pose, obstacle = null, heldSize = 0) {
    const base = { min: new Vector3(-0.23, -0.23, 0), max: new Vector3(0.23, 0.23, 0.12) };
    const barriers = obstacle?.walls || (obstacle ? [obstacle] : []);
    const solids = obstacle?.solids || [];
    for (const [index, frame] of pose.frames.entries()) {
        if (Math.min(frame.origin.z, frame.start.z, frame.end.z) < 0.085) return 'Talajütközés';
        for (const [start, end] of [[frame.origin, frame.start], [frame.start, frame.end]]) {
            if (!pose.gantry && segmentHitsBox(start, end, base, 0.055)) return 'Talapzatütközés';
            if (barriers.some(barrier => segmentHitsBox(start, end, barrier, obstacle?.walls ? 0.01 : 0.085))) return obstacle?.walls ? 'Cella ütközés' : 'Akadályütközés';
            if (solids.some(solid => !(pose.machineBase && index === 0 && solid.kind === 'machine') && segmentHitsBox(start, end, solid, 0.035))) return 'Géptest ütközés';
        }
    }
    const toolRear = new Vector3(-0.11, 0, 0).applyMatrix4(pose.matrix);
    const toolFront = new Vector3(0.04, 0, 0).applyMatrix4(pose.matrix);
    if (Math.min(toolRear.z, toolFront.z) < 0.045) return 'Megfogó–talaj ütközés';
    if (barriers.some(barrier => segmentHitsBox(toolRear, toolFront, barrier, obstacle?.walls ? 0.01 : 0.075))) return obstacle?.walls ? 'Megfogó–cella ütközés' : 'Megfogó–akadály ütközés';
    if (!pose.gantry && segmentHitsBox(toolRear, toolFront, base, 0.045)) return 'Megfogó–talapzat ütközés';
    if (heldSize > 0) {
        const radius = Math.sqrt(3) * heldSize / 2;
        if (pose.tip.z < radius) return 'Munkadarab–talaj ütközés';
        if (barriers.some(barrier => segmentHitsBox(pose.tip, pose.tip, barrier, radius))) return obstacle?.walls ? 'Munkadarab–cella ütközés' : 'Munkadarab–akadály ütközés';
        if (solids.some(solid => {
            if (solid.kind === 'conveyor' && pose.tip.z >= solid.surfaceZ + heldSize / 2 - 0.025) {
                const withinFootprint = pose.tip.x >= solid.min.x + radius && pose.tip.x <= solid.max.x - radius && pose.tip.y >= solid.min.y + radius && pose.tip.y <= solid.max.y - radius;
                if (withinFootprint) return false;
            }
            return segmentHitsBox(pose.tip, pose.tip, solid, radius);
        })) return 'Munkadarab–géptest ütközés';
        if (!pose.gantry && segmentHitsBox(pose.tip, pose.tip, base, radius)) return 'Munkadarab–talapzat ütközés';
    }
    return '';
}

export function safeMotion(joints, targetValues, obstacle = null, heldSize = 0) {
    const start = joints.map(joint => joint.value);
    const maximum = Math.max(...joints.map((joint, index) => Math.abs(targetValues[index] - joint.value) / (joint.type === 'R' ? 1 : 5)));
    const steps = Math.max(1, Math.ceil(maximum));
    const probe = structuredClone(joints);
    let values = start;
    for (let step = 1; step <= steps; step++) {
        probe.forEach((joint, index) => { joint.value = start[index] + (targetValues[index] - start[index]) * step / steps; });
        const reason = collisionReason(forward(probe), obstacle, heldSize);
        if (reason) return { values, reason };
        values = probe.map(joint => joint.value);
    }
    return { values, reason: '' };
}

export function calculate(joints, payload = 1, accelerations = []) {
    const pose = forward(joints);
    if (joints[0]?.delta) {
        const bodies = currentPose => currentPose.frames.flatMap(frame => [
            { position: frame.center, mass: joints[0].mass / 2 },
            { position: frame.lowerCenter, mass: joints[0].mass / 2 },
        ]).concat({ position: currentPose.tip, mass: payload });
        const potentialOf = currentPose => bodies(currentPose).reduce((sum, body) => sum + body.mass * gravity * body.position.z, 0);
        const baseBodies = bodies(pose);
        const loads = joints.map((joint, index) => {
            const step = 0.01;
            const above = structuredClone(joints);
            const below = structuredClone(joints);
            above[index].value += step;
            below[index].value -= step;
            const aboveBodies = bodies(forwardDelta(above));
            const belowBodies = bodies(forwardDelta(below));
            const radians = MathUtils.degToRad(step * 2);
            const holding = (potentialOf(forwardDelta(above)) - potentialOf(forwardDelta(below))) / radians;
            const effectiveInertia = baseBodies.reduce((sum, body, bodyIndex) => sum + body.mass * aboveBodies[bodyIndex].position.distanceTo(belowBodies[bodyIndex].position) ** 2 / radians ** 2, 0);
            const acceleration = accelerations[index] || 0;
            const inertial = effectiveInertia * acceleration;
            return { holding, effectiveInertia, inertial, total: holding + inertial, acceleration };
        });
        return { ...pose, loads, potential: potentialOf(pose), mass: payload + joints.reduce((sum, joint) => sum + joint.mass, 0) };
    }
    const loads = pose.frames.map((frame, index) => {
        let holding = 0;
        let effectiveInertia = 0;
        const bodies = pose.frames.slice(index).map((body, offset) => ({ position: body.center, mass: joints[index + offset].mass }));
        bodies.push({ position: pose.tip, mass: payload });
        for (const body of bodies) {
            const arm = body.position.clone().sub(frame.origin);
            const upward = new Vector3(0, 0, body.mass * gravity);
            if (joints[index].type === 'R') {
                holding += arm.clone().cross(upward).dot(frame.axis);
                effectiveInertia += body.mass * arm.clone().cross(frame.axis).lengthSq();
            } else {
                holding += upward.dot(frame.axis);
                effectiveInertia += body.mass;
            }
        }
        const acceleration = accelerations[index] || 0;
        const inertial = effectiveInertia * acceleration;
        return { holding, effectiveInertia, inertial, total: holding + inertial, acceleration };
    });
    const potential = pose.frames.reduce((sum, frame, index) => sum + joints[index].mass * gravity * frame.center.z, payload * gravity * pose.tip.z);
    return { ...pose, loads, potential, mass: payload + joints.reduce((sum, joint) => sum + joint.mass, 0) };
}

export function interpolateSegment(start, end, elapsed, duration) {
    const progress = Math.max(0, Math.min(1, elapsed / duration));
    const blend = 10 * progress ** 3 - 15 * progress ** 4 + 6 * progress ** 5;
    const velocity = (30 * progress ** 2 - 60 * progress ** 3 + 30 * progress ** 4) / duration;
    const acceleration = (60 * progress - 180 * progress ** 2 + 120 * progress ** 3) / duration ** 2;
    return {
        values: start.map((value, index) => value + (end[index] - value) * blend),
        velocities: start.map((value, index) => (end[index] - value) * velocity),
        accelerations: start.map((value, index) => (end[index] - value) * acceleration),
        progress,
    };
}

export function pathDuration(points, loop = false) {
    if (points.length < 2) return 0;
    const segments = loop ? points : points.slice(0, -1);
    return segments.reduce((sum, point) => sum + point.duration, 0);
}

export function pathSegmentAt(points, elapsed, loop = false) {
    const duration = pathDuration(points, loop);
    if (!duration) return null;
    let time = loop ? ((elapsed % duration) + duration) % duration : MathUtils.clamp(elapsed, 0, duration);
    const segmentCount = loop ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index++) {
        const segmentDuration = points[index].duration;
        if (time < segmentDuration || (!loop && index === segmentCount - 1)) {
            return {
                index,
                nextIndex: (index + 1) % points.length,
                elapsed: time,
                duration: segmentDuration,
            };
        }
        time -= segmentDuration;
    }
    return { index: 0, nextIndex: 1, elapsed: 0, duration: points[0].duration };
}

export function sampleWorkspace(joints, count = 2400, obstacle = null, heldSize = 0) {
    let seed = 91235;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const copy = structuredClone(joints);
    const positions = [];
    for (let sample = 0; sample < count * 6 && positions.length < count * 3; sample++) {
        copy.forEach(joint => { joint.value = joint.min + random() * (joint.max - joint.min); });
        const pose = forward(copy);
        if (!collisionReason(pose, obstacle, heldSize)) positions.push(...pose.tip.toArray());
    }
    return new Float32Array(positions);
}

export function rootJointConstraint(joints) {
    if (joints[0]?.type === 'R' && joints[0].axis !== 'Z') return 'Az R1 mindig Z tengelyű forgócsukló.';
    return '';
}
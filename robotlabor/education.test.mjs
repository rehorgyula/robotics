import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, makeJoint, preset } from './core.mjs';
import { explainJoint, robotLessons, jointRole } from './education.mjs';

test('explained contributions sum to the actual holding effort for every preset', () => {
    for (const model of Object.keys(robotLessons).filter(name => name !== 'custom')) {
        const joints = preset(model);
        const result = calculate(joints, 1.5);
        joints.forEach((joint, index) => {
            const lesson = explainJoint(joints, result, 1.5, index);
            const sum = lesson.contributions.reduce((total, body) => total + body.holding, 0);
            if (model !== 'delta') assert.ok(Math.abs(sum - result.loads[index].holding) < 1e-8);
            assert.ok(jointRole(model, index, joint).length > 15);
        });
    }
});

test('vertical rotary and horizontal prismatic zero efforts get different explanations', () => {
    const rotary = [makeJoint('R', 'Z')];
    const linear = [makeJoint('P', 'X')];
    assert.match(explainJoint(rotary, calculate(rotary), 1, 0).reason, /forgástengely függőleges/);
    assert.match(explainJoint(linear, calculate(linear), 1, 0).reason, /szán tengelye vízszintes/);
});
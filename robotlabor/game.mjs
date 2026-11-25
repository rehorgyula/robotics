const clampLevel = level => Math.max(1, Math.min(30, Math.floor(level)));
const buttonSurfaces = [
    { surface: 'padló', point: [0.62, -0.22, 0], normal: [0, 0, 1] },
    { surface: 'kanapé oldala', point: [-0.42, -0.96, 0.36], normal: [0, 1, 0] },
    { surface: 'szekrény teteje', point: [-0.72, 1.12, 1.16], normal: [0, 0, 1] },
    { surface: 'fal', point: [-1.387, -0.55, 0.82], normal: [1, 0, 0] },
    { surface: 'asztal teteje', point: [1.02, 0.48, 0.75], normal: [0, 0, 1] },
    { surface: 'fotel oldala', point: [0.93, -0.66, 0.42], normal: [0, 1, 0] },
    { surface: 'polc oldala', point: [-1.04, 0.35, 0.80], normal: [1, 0, 0] },
    { surface: 'fal', point: [0.55, 1.387, 0.70], normal: [0, -1, 0] },
    { surface: 'padló', point: [0.68, 0.12, 0], normal: [0, 0, 1] },
    { surface: 'kanapé teteje', point: [-0.42, -1.16, 0.49], normal: [0, 0, 1] },
];

export function createGameLevel(inputLevel) {
    const level = clampLevel(inputLevel);
    const placement = buttonSurfaces[(level - 1) % buttonSurfaces.length];
    const target = {
        x: Number((placement.point[0] + placement.normal[0] * 0.17).toFixed(3)),
        y: Number((placement.point[1] + placement.normal[1] * 0.17).toFixed(3)),
        z: Number((placement.point[2] + placement.normal[2] * 0.17).toFixed(3)),
        normal: placement.normal,
        surface: placement.surface,
    };
    const angle = level * 2.399963229728653;
    const obstacleCount = level < 6 ? 0 : level < 11 ? 1 : level < 16 ? 2 : level < 20 ? 3 : 2 + Math.floor((level - 20) / 4);
    const obstacles = [];
    for (let index = 0; index < obstacleCount; index++) {
        const fraction = 0.30 + index * (0.43 / Math.max(1, obstacleCount - 1));
        const perpendicular = index % 2 ? -1 : 1;
        const offset = level >= 20 ? 0.16 * perpendicular : 0;
        const x = target.x * fraction - Math.sin(angle) * offset;
        const y = target.y * fraction + Math.cos(angle) * offset;
        const width = level >= 20 ? 0.22 + Math.floor((level - 20) / 6) * 0.025 : 0.15 + Math.floor((level - 6) / 5) * 0.025;
        const height = level >= 20 ? 0.50 + Math.min(0.25, (level - 20) * 0.025) : 0.32 + (level - 6) * 0.025;
        obstacles.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), z: 0, width, depth: width, height });
    }
    return {
        level,
        target,
        obstacles,
        requiresProgram: level >= 20,
        requiredPoints: level >= 20 ? 3 : 0,
        difficulty: level < 6 ? 'Alap' : level < 11 ? 'Irányváltás' : level < 20 ? 'Bútorok között' : 'Útvonaltervezés',
    };
}

export function gameScore(degreesOfFreedom, elapsedSeconds, timeBonusSeconds = 0) {
    const seconds = Math.max(0, elapsedSeconds - timeBonusSeconds);
    return Math.max(0, Math.round(10000 - degreesOfFreedom * 400 - seconds * 10));
}

export function gameStarsFromScore(score) {
    if (score >= 8700) return 3;
    if (score >= 7000) return 2;
    return 1;
}

export function recordGameStarStreak(streak, stars, pendingBonusSeconds = 0) {
    const nextStreak = stars === 3 ? streak + 1 : 0;
    if (nextStreak >= 2) {
        return { streak: 0, pendingBonusSeconds: pendingBonusSeconds + 15, rewardEarned: true };
    }
    return { streak: nextStreak, pendingBonusSeconds, rewardEarned: false };
}
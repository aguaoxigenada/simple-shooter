import * as THREE from 'three';
import { scene } from '../core/scene.js';

// Store collidable objects for collision detection
export const collidableObjects = [];
export const ladderVolumes = [];

// Create environment (walls, boxes, etc.)
export function createBox(x, y, z, width = 2, height = 2, depth = 2, color = 0x8B4513) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color });
    const box = new THREE.Mesh(geometry, material);
    box.position.set(x, y, z);
    box.castShadow = true;
    box.receiveShadow = true;
    box.userData.isCollidable = true;
    collidableObjects.push(box);
    return box;
}

export function createStaircase({
    x,
    z,
    stepCount = 5,
    stepWidth = 2,
    stepHeight = 0.35,
    stepDepth = 0.7,
    color = 0x999999,
    direction = 'north',
    includePlatform = true,
    platformDepth = 1.5
}) {
    const dir = direction.toLowerCase();
    const dirX = dir === 'east' ? 1 : dir === 'west' ? -1 : 0;
    const dirZ = dir === 'south' ? -1 : dir === 'north' ? 1 : 0;

    for (let i = 0; i < stepCount; i++) {
        const stepCenterX = x + dirX * (i + 0.5) * stepDepth;
        const stepCenterZ = z + dirZ * (i + 0.5) * stepDepth;
        const stepCenterY = (i + 1) * stepHeight - stepHeight / 2;
        const width = dirZ !== 0 ? stepWidth : stepDepth;
        const depth = dirZ !== 0 ? stepDepth : stepWidth;

        scene.add(
            createBox(
                stepCenterX,
                stepCenterY,
                stepCenterZ,
                width,
                stepHeight,
                depth,
                color
            )
        );
    }

    if (includePlatform) {
        const platformCenterX = x + dirX * (stepCount * stepDepth + platformDepth) / 2;
        const platformCenterZ = z + dirZ * (stepCount * stepDepth + platformDepth) / 2;
        const platformY = stepCount * stepHeight + stepHeight / 2;
        const platformWidth = dirZ !== 0 ? stepWidth : platformDepth;
        const platformDepthSize = dirZ !== 0 ? platformDepth : stepWidth;

        scene.add(
            createBox(
                platformCenterX,
                platformY,
                platformCenterZ,
                platformWidth,
                stepHeight,
                platformDepthSize,
                color
            )
        );
    }
}

export function createLadder({
    x,
    z,
    height = 3,
    width = 0.4,
    depth = 0.25,
    bottomY = 0,
    color = 0xCCCCCC,
    climbMargin = 0.35
}) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color });
    const ladder = new THREE.Mesh(geometry, material);
    ladder.position.set(x, bottomY + height / 2, z);
    ladder.castShadow = false;
    ladder.receiveShadow = false;
    ladder.userData.isCollidable = false;
    scene.add(ladder);

    ladderVolumes.push({
        minX: x - width / 2 - climbMargin,
        maxX: x + width / 2 + climbMargin,
        minZ: z - depth / 2 - climbMargin,
        maxZ: z + depth / 2 + climbMargin,
        minY: bottomY,
        maxY: bottomY + height,
        centerX: x,
        centerZ: z,
        width,
        depth
    });

    return ladder;
}

// Initialize environment
export function initEnvironment() {
    // Clear collidable objects array when reinitializing
    collidableObjects.length = 0;
    ladderVolumes.length = 0;
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.userData.isCollidable = false; // Ground is not collidable
    scene.add(ground);
    
    // Add some walls and cover objects
    scene.add(createBox(10, 1, 0, 20, 2, 1, 0x696969));
    scene.add(createBox(-10, 1, 0, 20, 2, 1, 0x696969));
    scene.add(createBox(0, 1, 10, 1, 2, 20, 0x696969));
    scene.add(createBox(0, 1, -10, 1, 2, 20, 0x696969));

    // Add some cover boxes
    scene.add(createBox(5, 1, 5, 2, 2, 2, 0x8B4513));
    scene.add(createBox(-5, 1, -5, 2, 2, 2, 0x8B4513));
    scene.add(createBox(8, 1, -7, 1.5, 2, 1.5, 0x8B4513));
    scene.add(createBox(-8, 1, 7, 1.5, 2, 1.5, 0x8B4513));

    // Add a climbable staircase structure near the center
    createStaircase({
        x: -2,
        z: 0,
        stepCount: 5,
        stepWidth: 3,
        stepHeight: 0.4,
        stepDepth: 0.7,
        color: 0x777777,
        direction: 'north',
        includePlatform: true,
        platformDepth: 2
    });

    // Add a vertical ladder for accessing elevated cover
    createLadder({
        x: 5,
        z: 4.2,
        height: 2.4,
        width: 0.45,
        depth: 0.3,
        bottomY: 0,
        color: 0xBBBBBB
    });
}

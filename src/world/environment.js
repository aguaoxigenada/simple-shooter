import * as THREE from 'three';
import { scene } from '../core/scene.js';

// Store collidable objects for collision detection
export const collidableObjects = [];

// Ground
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
ground.userData.isCollidable = false; // Ground is not collidable
scene.add(ground);

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

// Initialize environment
export function initEnvironment() {
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
}

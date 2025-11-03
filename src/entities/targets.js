import * as THREE from 'three';
import { scene } from '../core/scene.js';

// Targets (enemies)
export const targets = [];

export function createTarget(x, y, z) {
    const group = new THREE.Group();
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);
    
    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0000FF });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    
    group.position.set(x, y, z);
    group.userData = { health: 100, type: 'target' };
    scene.add(group);
    targets.push(group);
    
    return group;
}

// Initialize targets
export function initTargets() {
    // Position targets in clear areas completely outside walls
    // Walls extend: x=-20 to 20, z=-20 to 20, so place enemies at least 3 units outside
    createTarget(25, 0, 0);      // East (right)
    createTarget(-25, 0, 0);     // West (left)
    createTarget(0, 0, 25);      // North (forward)
    createTarget(0, 0, -25);     // South (back)
    createTarget(22, 0, 22);      // Northeast
    createTarget(-22, 0, -22);    // Southwest
}

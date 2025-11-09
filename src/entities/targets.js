import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { gameState } from '../core/gameState.js';

// Targets (enemies)
export const targets = [];

const TARGET_DEFINITIONS = [
    { id: 'target-east', position: [25, 0, 0] },
    { id: 'target-west', position: [-25, 0, 0] },
    { id: 'target-north', position: [0, 0, 25] },
    { id: 'target-south', position: [0, 0, -25] },
    { id: 'target-northeast', position: [22, 0, 22] },
    { id: 'target-southwest', position: [-22, 0, -22] }
];

export function createTarget(id, x, y, z) {
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
    group.userData = { id, health: 100, type: 'target', isDestroyed: false };
    scene.add(group);
    targets.push(group);
    
    return group;
}

function removeTarget(target, { awardKill = false } = {}) {
    if (!target) return false;
    
    const index = targets.indexOf(target);
    if (index !== -1) {
        targets.splice(index, 1);
    }
    
    scene.remove(target);
    target.userData.isDestroyed = true;
    target.userData.health = 0;
    
    if (awardKill) {
        gameState.kills++;
    }
    
    return true;
}

export function getTargetById(targetId) {
    return targets.find(target => target.userData?.id === targetId) || null;
}

export function removeTargetById(targetId, { awardKill = false } = {}) {
    const target = getTargetById(targetId);
    if (!target) {
        return false;
    }
    return removeTarget(target, { awardKill });
}

export function getTargetFromObject(object) {
    let current = object;
    while (current && current.userData?.type !== 'target') {
        current = current.parent;
    }
    return current && current.userData?.type === 'target' ? current : null;
}

export function damageTarget(target, damage, { awardKill = true } = {}) {
    if (!target || target.userData?.isDestroyed) {
        return false;
    }
    
    target.userData.health = Math.max(0, target.userData.health - damage);
    
    if (target.userData.health <= 0) {
        removeTarget(target, { awardKill });
        return true;
    }
    
    return false;
}

// Initialize targets
export function initTargets() {
    // Clear any existing targets before recreation (e.g., scene reload)
    for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        scene.remove(target);
        targets.splice(i, 1);
    }
    
    for (const def of TARGET_DEFINITIONS) {
        createTarget(def.id, ...def.position);
    }
}

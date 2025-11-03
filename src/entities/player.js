import * as THREE from 'three';
import { camera } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { collidableObjects } from '../world/environment.js';

// Player controls constants
export const moveSpeed = 5;
export const sprintSpeed = 10; // 2x normal speed
export const jumpVelocity = 8;
export const mouseSensitivity = 0.002;
export const staminaDepletionRate = 40; // per second
export const staminaRecoveryRate = 20; // per second

// Physics constants
export const gravity = -20;
export const playerHeight = 1.6;
export const crouchHeight = 0.8; // Half of standing height
export const playerRadius = 0.4; // Collision radius for player
export const crouchSpeedMultiplier = 0.5; // Move 50% slower when crouched

let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let canJump = false;
let isCrouched = false;
let currentPlayerHeight = playerHeight;

// Mouse controls
let pitch = 0;
let yaw = 0;

export const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    shift: false,
    ctrl: false
};

export function initPlayerControls(renderer) {
    document.addEventListener('mousemove', (e) => {
        if (!gameState.isMouseLocked) return;
        
        yaw -= e.movementX * mouseSensitivity;
        pitch -= e.movementY * mouseSensitivity;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW': keys.w = true; break;
            case 'KeyA': keys.a = true; break;
            case 'KeyS': keys.s = true; break;
            case 'KeyD': keys.d = true; break;
            case 'Space': keys.space = true; break;
            case 'ShiftLeft': keys.shift = true; break;
            case 'KeyC': 
                keys.ctrl = true; 
                isCrouched = true;
                break;
            case 'KeyK':
                // Kill player for testing purposes
                gameState.health = 0;
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW': keys.w = false; break;
            case 'KeyA': keys.a = false; break;
            case 'KeyS': keys.s = false; break;
            case 'KeyD': keys.d = false; break;
            case 'Space': keys.space = false; break;
            case 'ShiftLeft': keys.shift = false; break;
            case 'KeyC': 
                keys.ctrl = false; 
                isCrouched = false;
                break;
        }
    });
}

// Collision detection function
function checkCollision(newX, newY, newZ) {
    const playerBoundingBox = new THREE.Box3(
        new THREE.Vector3(newX - playerRadius, newY - currentPlayerHeight, newZ - playerRadius),
        new THREE.Vector3(newX + playerRadius, newY + currentPlayerHeight, newZ + playerRadius)
    );
    
    for (const obj of collidableObjects) {
        const objBox = new THREE.Box3().setFromObject(obj);
        if (playerBoundingBox.intersectsBox(objBox)) {
            return true;
        }
    }
    
    return false;
}

export function updatePlayer(deltaTime) {
    // Update camera rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    
    // Update crouch state
    isCrouched = keys.ctrl;
    
    // Update player height smoothly
    const targetHeight = isCrouched ? crouchHeight : playerHeight;
    const heightChangeSpeed = 5; // Speed of height transition
    const heightDifference = targetHeight - currentPlayerHeight;
    if (Math.abs(heightDifference) > 0.01) {
        currentPlayerHeight += heightDifference * heightChangeSpeed * deltaTime;
        // Clamp to prevent overshooting
        if ((isCrouched && currentPlayerHeight < crouchHeight) || 
            (!isCrouched && currentPlayerHeight > playerHeight)) {
            currentPlayerHeight = targetHeight;
        }
    } else {
        currentPlayerHeight = targetHeight;
    }
    
    // Movement
    direction.set(0, 0, 0);
    
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;
    
    direction.normalize();
    
    // Apply rotation to movement direction
    const euler = new THREE.Euler(0, yaw, 0, 'YXZ');
    direction.applyEuler(euler);
    
    // Determine if sprinting (can't sprint while crouched)
    const isMoving = direction.length() > 0;
    const wantsToSprint = keys.shift && isMoving && !isCrouched;
    // Require minimum stamina threshold to sprint (prevents sprinting at 0%)
    const hasEnoughStamina = gameState.stamina >= 1;
    const isSprinting = wantsToSprint && hasEnoughStamina;
    
    // Update stamina
    if (isSprinting) {
        gameState.stamina = Math.max(0, gameState.stamina - staminaDepletionRate * deltaTime);
        // If stamina depleted during sprint, ensure we stop sprinting
        if (gameState.stamina <= 0) {
            gameState.stamina = 0;
        }
    } else {
        gameState.stamina = Math.min(100, gameState.stamina + staminaRecoveryRate * deltaTime);
    }
    
    // Determine current speed - apply crouch speed reduction
    const canSprint = wantsToSprint && gameState.stamina >= 1 && !isCrouched;
    let currentSpeed = canSprint ? sprintSpeed : moveSpeed;
    
    // Apply crouch speed reduction
    if (isCrouched) {
        currentSpeed *= crouchSpeedMultiplier;
    }
    
    // Update velocity
    velocity.x = direction.x * currentSpeed;
    velocity.z = direction.z * currentSpeed;
    
    // Jumping (can't jump while crouched)
    if (keys.space && canJump && !isCrouched) {
        velocity.y = jumpVelocity;
        canJump = false;
    }
    
    // Apply gravity
    velocity.y += gravity * deltaTime;
    
    // Update position with collision detection
    // Check X axis collision separately for sliding along walls
    const newX = camera.position.x + velocity.x * deltaTime;
    const testZ = camera.position.z;
    const testY = camera.position.y;
    
    if (!checkCollision(newX, testY, testZ)) {
        camera.position.x = newX;
    }
    
    // Check Z axis collision separately
    const newZ = camera.position.z + velocity.z * deltaTime;
    const testX = camera.position.x;
    
    if (!checkCollision(testX, testY, newZ)) {
        camera.position.z = newZ;
    }
    
    // Update Y (vertical movement, no collision check needed for jumping)
    camera.position.y += velocity.y * deltaTime;
    
    // Ground collision - use current player height
    if (camera.position.y < currentPlayerHeight) {
        camera.position.y = currentPlayerHeight;
        velocity.y = 0;
        canJump = true;
    }
    
    // Simple boundaries (prevent going too far)
    camera.position.x = Math.max(-90, Math.min(90, camera.position.x));
    camera.position.z = Math.max(-90, Math.min(90, camera.position.z));
}

import * as THREE from 'three';
import { camera } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { collidableObjects } from '../world/environment.js';
import { PLAYER } from '../shared/constants.js';
import { networkClient } from '../network/client.js';

// Use shared constants
const moveSpeed = PLAYER.MOVE_SPEED;
const sprintSpeed = PLAYER.SPRINT_SPEED;
const jumpVelocity = PLAYER.JUMP_VELOCITY;
const mouseSensitivity = PLAYER.MOUSE_SENSITIVITY;
const staminaDepletionRate = PLAYER.STAMINA_DEPLETION_RATE;
const staminaRecoveryRate = PLAYER.STAMINA_RECOVERY_RATE;
const gravity = PLAYER.GRAVITY;
const playerHeight = PLAYER.PLAYER_HEIGHT;
const crouchHeight = PLAYER.CROUCH_HEIGHT;
const playerRadius = PLAYER.PLAYER_RADIUS;
const crouchSpeedMultiplier = PLAYER.CROUCH_SPEED_MULTIPLIER;

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

// Mouse movement tracking for network
let mouseDeltaX = 0;
let mouseDeltaY = 0;

export function initPlayerControls(renderer) {
    document.addEventListener('mousemove', (e) => {
        if (!gameState.isMouseLocked) return;
        
        const deltaX = e.movementX * mouseSensitivity;
        const deltaY = e.movementY * mouseSensitivity;
        
        mouseDeltaX = e.movementX;
        mouseDeltaY = e.movementY;
        
        yaw -= deltaX;
        pitch -= deltaY;
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
    // Collect input for networking
    const inputData = {
        keys: {
            w: keys.w,
            a: keys.a,
            s: keys.s,
            d: keys.d,
            space: keys.space,
            shift: keys.shift,
            ctrl: keys.ctrl
        },
        mouseX: mouseDeltaX,
        mouseY: mouseDeltaY
    };
    
    // Reset mouse deltas after capturing
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    
    // Send input to server if connected
    if (networkClient.isConnected) {
        networkClient.sendInput(inputData);
    }
    
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

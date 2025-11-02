import * as THREE from 'three';
import { camera, scene } from '../core/scene.js';
import { keys } from './player.js';
import { gameState } from '../core/gameState.js';
import { getCurrentWeapon, WEAPON_TYPES } from '../systems/weapon.js';

let weaponGroup = null;
let currentWeaponModel = null;
let weaponModels = {};
let lastWeaponType = null;

// Animation state
let bobOffset = 0;
let bobSpeed = 0;
let bobAmount = 0.02;
let recoilOffset = 0;
let recoilTarget = 0;

// Muzzle effect particles
const muzzleParticles = [];

// Base weapon position (bottom right viewmodel position)
// Note: camera looks down -Z axis, so negative Z moves weapon forward (closer to camera)
const basePosition = new THREE.Vector3(0.4, -0.3, -0.6); // Right, lower, closer
const baseRotation = new THREE.Euler(-0.1, 0.2, 0.1); // Slight downward angle

function createPistol() {
    const group = new THREE.Group();
    
    // Main body (normal size)
    const bodyGeometry = new THREE.BoxGeometry(0.15, 0.25, 0.4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0, 0);
    group.add(body);
    
    // Barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0, 0.35);
    group.add(barrel);
    
    // Grip
    const gripGeometry = new THREE.BoxGeometry(0.12, 0.2, 0.15);
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.set(0, -0.15, -0.05);
    group.add(grip);
    
    // Muzzle flash point
    group.userData.muzzlePosition = new THREE.Vector3(0, 0, 0.5);
    
    return group;
}

function createAssaultRifle() {
    const group = new THREE.Group();
    
    // Main body (normal size)
    const bodyGeometry = new THREE.BoxGeometry(0.2, 0.3, 0.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0, 0);
    group.add(body);
    
    // Barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0, 0.65);
    group.add(barrel);
    
    // Stock
    const stockGeometry = new THREE.BoxGeometry(0.15, 0.25, 0.3);
    const stockMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const stock = new THREE.Mesh(stockGeometry, stockMaterial);
    stock.position.set(0, 0, -0.35);
    group.add(stock);
    
    // Magazine
    const magGeometry = new THREE.BoxGeometry(0.12, 0.2, 0.25);
    const magMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const mag = new THREE.Mesh(magGeometry, magMaterial);
    mag.position.set(0, -0.25, 0);
    group.add(mag);
    
    // Muzzle flash point
    group.userData.muzzlePosition = new THREE.Vector3(0, 0, 0.9);
    
    return group;
}

function createRocketLauncher() {
    const group = new THREE.Group();
    
    // Main tube (normal size)
    const tubeGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
    const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x664422 });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 0, 0.3);
    group.add(tube);
    
    // Handle/grip
    const handleGeometry = new THREE.BoxGeometry(0.1, 0.15, 0.2);
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(0, -0.2, 0);
    group.add(handle);
    
    // Front sight
    const sightGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.1);
    const sightMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const sight = new THREE.Mesh(sightGeometry, sightMaterial);
    sight.position.set(0, 0.1, 0.65);
    group.add(sight);
    
    // Muzzle flash point
    group.userData.muzzlePosition = new THREE.Vector3(0, 0, 0.75);
    
    return group;
}

function createMuzzleFlash() {
    // Main bright flash
    const flashGeometry = new THREE.SphereGeometry(0.1, 12, 12);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFFFFF,
        transparent: true,
        opacity: 1.0
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.visible = false;
    
    // Outer glow
    const glowGeometry = new THREE.SphereGeometry(0.15, 12, 12);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.6
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.visible = false;
    flash.userData.glow = glow;
    
    return flash;
}

function createSparkParticle(position, direction, weaponType) {
    const sparkSize = weaponType === WEAPON_TYPES.ROCKET_LAUNCHER ? 0.08 : 0.04;
    const sparkGeometry = new THREE.SphereGeometry(sparkSize, 6, 6);
    
    // Different colors for different weapons
    const sparkColor = weaponType === WEAPON_TYPES.ROCKET_LAUNCHER ? 0xFF6600 : 0xFFAA00;
    const sparkMaterial = new THREE.MeshBasicMaterial({ 
        color: sparkColor,
        transparent: true,
        opacity: 1.0
    });
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
    
    spark.position.copy(position);
    
    // Random velocity outward from muzzle
    const spreadAngle = Math.PI / 6; // 30 degree spread
    const randomAngle = (Math.random() - 0.5) * spreadAngle;
    const randomAzimuth = Math.random() * Math.PI * 2;
    
    const velocity = direction.clone();
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngle);
    velocity.applyAxisAngle(direction, randomAzimuth);
    velocity.multiplyScalar(5 + Math.random() * 10); // Speed 5-15
    
    spark.userData.velocity = velocity;
    spark.userData.lifetime = 0.3; // 0.3 seconds
    spark.userData.age = 0;
    
    scene.add(spark);
    muzzleParticles.push(spark);
    
    return spark;
}

function createSmokeParticle(position, direction) {
    const smokeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const smokeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x444444,
        transparent: true,
        opacity: 0.7
    });
    const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
    
    smoke.position.copy(position);
    
    // Smoke rises and spreads
    const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2, // Random X
        0.5 + Math.random() * 0.5, // Upward
        (Math.random() - 0.5) * 2  // Random Z
    );
    
    smoke.userData.velocity = velocity;
    smoke.userData.lifetime = 0.5; // 0.5 seconds
    smoke.userData.age = 0;
    
    scene.add(smoke);
    muzzleParticles.push(smoke);
    
    return smoke;
}

export function initWeaponViewModel() {
    // Create weapon container group - add to SCENE instead of camera
    // We'll update position relative to camera each frame
    weaponGroup = new THREE.Group();
    weaponGroup.visible = true;
    scene.add(weaponGroup);
    
    // Create all weapon models
    weaponModels[WEAPON_TYPES.PISTOL] = createPistol();
    weaponModels[WEAPON_TYPES.ASSAULT_RIFLE] = createAssaultRifle();
    weaponModels[WEAPON_TYPES.ROCKET_LAUNCHER] = createRocketLauncher();
    
    // Hide all models initially (will show current weapon)
    Object.values(weaponModels).forEach(model => {
        model.visible = false;
        weaponGroup.add(model);
    });
    
    // Create muzzle flash (will be attached to current weapon)
    const muzzleFlash = createMuzzleFlash();
    weaponGroup.userData.muzzleFlash = muzzleFlash;
    weaponGroup.userData.flashTimer = 0;
    
    // Set initial weapon immediately (weapon system should have initialized first)
    if (gameState.currentWeapon) {
        updateWeaponModel();
        lastWeaponType = gameState.currentWeapon;
    } else {
        // If weapon not set yet, try again next frame
        setTimeout(() => {
            updateWeaponModel();
            if (gameState.currentWeapon) {
                lastWeaponType = gameState.currentWeapon;
            }
        }, 0);
    }
}

function updateWeaponModel() {
    if (!weaponGroup || !gameState.currentWeapon) return;
    
    // Hide current weapon
    if (currentWeaponModel) {
        currentWeaponModel.visible = false;
        // Remove muzzle flash from old weapon
        const oldFlash = weaponGroup.userData.muzzleFlash;
        if (oldFlash && oldFlash.parent === currentWeaponModel) {
            currentWeaponModel.remove(oldFlash);
            // Remove glow too
            if (oldFlash.userData.glow && oldFlash.userData.glow.parent === currentWeaponModel) {
                currentWeaponModel.remove(oldFlash.userData.glow);
            }
        }
    }
    
    // Show new weapon
    currentWeaponModel = weaponModels[gameState.currentWeapon];
    if (currentWeaponModel) {
        currentWeaponModel.visible = true;
        // Add muzzle flash to new weapon
        const muzzleFlash = weaponGroup.userData.muzzleFlash;
        if (muzzleFlash) {
            currentWeaponModel.add(muzzleFlash);
            // Add glow to weapon model too
            if (muzzleFlash.userData.glow) {
                currentWeaponModel.add(muzzleFlash.userData.glow);
            }
        }
    }
}

export function updateWeaponViewModel(deltaTime, isShooting) {
    if (!weaponGroup) {
        console.log('updateWeaponViewModel: weaponGroup is null');
        return;
    }
    
    // Update weapon group position relative to camera
    // Get camera world position and direction
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    const cameraRight = new THREE.Vector3();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraRight.normalize();
    
    const cameraUp = new THREE.Vector3();
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    cameraUp.normalize();
    
    // Calculate weapon position relative to camera
    const weaponOffset = basePosition.clone();
    const worldOffset = new THREE.Vector3();
    worldOffset.addScaledVector(cameraRight, weaponOffset.x);
    worldOffset.addScaledVector(cameraUp, weaponOffset.y);
    worldOffset.addScaledVector(cameraDirection, -weaponOffset.z); // Negative Z = forward
    
    weaponGroup.position.copy(cameraWorldPos).add(worldOffset);
    
    // Update weapon rotation to match camera with base rotation offset
    weaponGroup.rotation.copy(camera.rotation);
    weaponGroup.rotateX(baseRotation.x);
    weaponGroup.rotateY(baseRotation.y);
    weaponGroup.rotateZ(baseRotation.z);
    
    // Force update weapon model if not set yet
    if (!currentWeaponModel && gameState.currentWeapon) {
        updateWeaponModel();
        if (gameState.currentWeapon) {
            lastWeaponType = gameState.currentWeapon;
        }
    }
    
    if (!currentWeaponModel) {
        return;
    }
    
    // Weapon bobbing based on movement
    const isMoving = keys.w || keys.a || keys.s || keys.d;
    
    if (isMoving) {
        bobSpeed += deltaTime * 15;
        bobOffset = Math.sin(bobSpeed) * bobAmount;
    } else {
        // Return to center when not moving
        bobSpeed = 0;
        bobOffset *= 0.9; // Damping
    }
    
    // Recoil animation
    if (isShooting) {
        recoilTarget = 0.15;
    }
    
    // Smooth recoil recovery
    recoilTarget *= 0.85;
    recoilOffset += (recoilTarget - recoilOffset) * 0.3;
    
    // Apply bobbing and recoil to weapon position (modify the calculated position)
    weaponGroup.position.addScaledVector(cameraRight, bobOffset * 2);
    weaponGroup.position.addScaledVector(cameraUp, bobOffset + recoilOffset * 0.5);
    weaponGroup.position.addScaledVector(cameraDirection, -recoilOffset);
    
    // Slight rotation from recoil
    const recoilRotation = recoilOffset * 0.5;
    weaponGroup.rotateX(recoilRotation);
    
    // Update muzzle flash
    const muzzleFlash = weaponGroup.userData.muzzleFlash;
    if (muzzleFlash && muzzleFlash.visible) {
        weaponGroup.userData.flashTimer -= deltaTime;
        if (weaponGroup.userData.flashTimer <= 0) {
            muzzleFlash.visible = false;
            if (muzzleFlash.userData.glow) {
                muzzleFlash.userData.glow.visible = false;
            }
        } else {
            // Animate flash (scale and fade)
            const flashTime = weaponGroup.userData.flashTimer;
            const flashDuration = 0.1;
            const progress = flashTime / flashDuration;
            
            // Main flash scales up and fades
            const scale = 1 + (1 - progress) * 2;
            muzzleFlash.scale.set(scale, scale, scale);
            muzzleFlash.material.opacity = progress;
            
            // Glow effect - update position to match flash
            if (muzzleFlash.userData.glow) {
                muzzleFlash.userData.glow.position.copy(muzzleFlash.position);
                muzzleFlash.userData.glow.visible = true;
                const glowScale = 1 + (1 - progress) * 3;
                muzzleFlash.userData.glow.scale.set(glowScale, glowScale, glowScale);
                muzzleFlash.userData.glow.material.opacity = progress * 0.6;
            }
        }
    }
    
    // Update muzzle particles (sparks and smoke)
    for (let i = muzzleParticles.length - 1; i >= 0; i--) {
        const particle = muzzleParticles[i];
        particle.userData.age += deltaTime;
        
        if (particle.userData.age >= particle.userData.lifetime) {
            scene.remove(particle);
            muzzleParticles.splice(i, 1);
            continue;
        }
        
        // Update position
        const velocity = particle.userData.velocity;
        particle.position.add(velocity.clone().multiplyScalar(deltaTime));
        
        // Apply gravity to sparks
        if (particle.material.color.getHex() === 0xFFAA00 || particle.material.color.getHex() === 0xFF6600) {
            velocity.y -= 9.8 * deltaTime; // Gravity
        }
        
        // Fade out
        const lifeProgress = particle.userData.age / particle.userData.lifetime;
        particle.material.opacity = (1 - lifeProgress) * (particle.material.opacity || 0.7);
        
        // Scale down smoke
        if (particle.material.color.getHex() === 0x444444) {
            const smokeScale = 1 + lifeProgress * 2;
            particle.scale.set(smokeScale, smokeScale, smokeScale);
        }
    }
    
    // Check if weapon changed (only update when actually changed)
    if (gameState.currentWeapon !== lastWeaponType) {
        updateWeaponModel();
        lastWeaponType = gameState.currentWeapon;
    }
}

export function triggerMuzzleFlash() {
    if (!weaponGroup || !currentWeaponModel) return;
    
    const muzzleFlash = weaponGroup.userData.muzzleFlash;
    if (muzzleFlash && currentWeaponModel.userData.muzzlePosition) {
        // Position flash at muzzle (relative to weapon model)
        const localMuzzlePos = currentWeaponModel.userData.muzzlePosition;
        muzzleFlash.position.set(localMuzzlePos.x, localMuzzlePos.y, localMuzzlePos.z);
        muzzleFlash.visible = true;
        weaponGroup.userData.flashTimer = 0.1;
        muzzleFlash.scale.set(1, 1, 1);
        muzzleFlash.material.opacity = 1.0;
        
        // Show glow at same position
        if (muzzleFlash.userData.glow) {
            muzzleFlash.userData.glow.position.set(localMuzzlePos.x, localMuzzlePos.y, localMuzzlePos.z);
            muzzleFlash.userData.glow.visible = true;
            muzzleFlash.userData.glow.scale.set(1, 1, 1);
            muzzleFlash.userData.glow.material.opacity = 0.6;
        }
        
        // Get world position of muzzle for particles
        // We need to calculate this the same way weaponGroup position is calculated
        // Get current camera transforms (same as in updateWeaponViewModel)
        const cameraWorldPos = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPos);
        
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const cameraRight = new THREE.Vector3();
        cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
        cameraRight.normalize();
        
        const cameraUp = new THREE.Vector3();
        cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
        cameraUp.normalize();
        
        // Get weaponGroup's base offset (same calculation as in updateWeaponViewModel)
        const weaponOffset = basePosition.clone();
        const worldOffset = new THREE.Vector3();
        worldOffset.addScaledVector(cameraRight, weaponOffset.x);
        worldOffset.addScaledVector(cameraUp, weaponOffset.y);
        worldOffset.addScaledVector(cameraDirection, -weaponOffset.z);
        
        // WeaponGroup base position
        const weaponGroupBasePos = cameraWorldPos.clone().add(worldOffset);
        
        // Apply bobbing and recoil (use actual current values from module scope)
        // Final weaponGroup position (matching updateWeaponViewModel calculation)
        const finalWeaponGroupPos = weaponGroupBasePos.clone();
        finalWeaponGroupPos.addScaledVector(cameraRight, bobOffset * 2);
        finalWeaponGroupPos.addScaledVector(cameraUp, bobOffset + recoilOffset * 0.5);
        finalWeaponGroupPos.addScaledVector(cameraDirection, -recoilOffset);
        
        // Now transform local muzzle position through weaponGroup's rotation
        // First apply weaponGroup rotation (camera rotation + base rotation + recoil)
        const weaponGroupRotation = new THREE.Euler();
        weaponGroupRotation.copy(camera.rotation);
        weaponGroupRotation.x += baseRotation.x;
        weaponGroupRotation.y += baseRotation.y;
        weaponGroupRotation.z += baseRotation.z;
        weaponGroupRotation.x += recoilOffset * 0.5; // Recoil rotation
        
        // Transform local muzzle position using weaponGroup's rotation
        const rotatedMuzzlePos = localMuzzlePos.clone();
        rotatedMuzzlePos.applyEuler(weaponGroupRotation);
        
        // Final world position
        const worldMuzzlePos = finalWeaponGroupPos.clone().add(rotatedMuzzlePos);
        
        // Weapon-specific effects
        const weaponType = gameState.currentWeapon;
        const particleCount = weaponType === WEAPON_TYPES.ROCKET_LAUNCHER ? 15 : 8;
        
        // Create sparks
        for (let i = 0; i < particleCount; i++) {
            createSparkParticle(worldMuzzlePos, cameraDirection, weaponType);
        }
        
        // Create smoke (less for pistol, more for rocket launcher)
        const smokeCount = weaponType === WEAPON_TYPES.ROCKET_LAUNCHER ? 5 : 
                          weaponType === WEAPON_TYPES.ASSAULT_RIFLE ? 3 : 2;
        for (let i = 0; i < smokeCount; i++) {
            createSmokeParticle(worldMuzzlePos, cameraDirection);
        }
    }
}

export function cleanupWeaponViewModel() {
    if (weaponGroup) {
        scene.remove(weaponGroup);
        weaponGroup = null;
        currentWeaponModel = null;
        lastWeaponType = null;
    }
    
    // Clean up all muzzle particles
    muzzleParticles.forEach(particle => {
        scene.remove(particle);
    });
    muzzleParticles.length = 0;
}

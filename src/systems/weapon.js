import * as THREE from 'three';
import { scene, camera } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { getTargetFromObject, damageTarget } from '../entities/targets.js';
import { createRocket } from './projectile.js';
import { WEAPON } from '../shared/constants.js';
import { networkClient } from '../network/client.js';

// Weapon definitions
export const WEAPON_TYPES = {
    PISTOL: 'pistol',
    ASSAULT_RIFLE: 'assault_rifle',
    SHOTGUN: 'shotgun',
    ROCKET_LAUNCHER: 'rocket_launcher'
};

const weapons = {
    [WEAPON_TYPES.PISTOL]: {
        name: 'Pistol',
        ...WEAPON.PISTOL,
        ammo: WEAPON.PISTOL.AMMO_CAPACITY,
        ammoTotal: WEAPON.PISTOL.AMMO_TOTAL
    },
    [WEAPON_TYPES.ASSAULT_RIFLE]: {
        name: 'Assault Rifle',
        ...WEAPON.ASSAULT_RIFLE,
        ammo: WEAPON.ASSAULT_RIFLE.AMMO_CAPACITY,
        ammoTotal: WEAPON.ASSAULT_RIFLE.AMMO_TOTAL
    },
    [WEAPON_TYPES.SHOTGUN]: {
        name: 'Shotgun',
        ...WEAPON.SHOTGUN,
        ammo: WEAPON.SHOTGUN.AMMO_CAPACITY,
        ammoTotal: WEAPON.SHOTGUN.AMMO_TOTAL
    },
    [WEAPON_TYPES.ROCKET_LAUNCHER]: {
        name: 'Rocket Launcher',
        ...WEAPON.ROCKET_LAUNCHER,
        ammo: WEAPON.ROCKET_LAUNCHER.AMMO_CAPACITY,
        ammoTotal: WEAPON.ROCKET_LAUNCHER.AMMO_TOTAL
    }
};

// Shooting mechanics
const raycaster = new THREE.Raycaster();

let isShooting = false;
let shootCooldown = 0;
let isReloading = false;
let reloadTimer = 0;
let lastShootSentState = false;
let pendingShootFalse = false; // Track if we need to send shoot: false on next frame (for semi-auto)

// Assault rifle recoil/spread tracking
let assaultRifleFireDuration = 0; // Time spent firing continuously
let assaultRifleConsecutiveShots = 0; // Number of consecutive shots
const ASSAULT_RIFLE_TIGHT_SHOTS = 5; // First 5 shots are tight
const ASSAULT_RIFLE_MAX_SPREAD = 6 * Math.PI / 180; // Max 6 degrees spread
const ASSAULT_RIFLE_SPREAD_RECOVERY_RATE = 2.0; // Spread recovery per second
const ASSAULT_RIFLE_SPREAD_INCREASE_RATE = 0.5; // Spread increase per shot after tight shots

// Crosshair firing indicator
let lastFireTime = 0; // Track when weapon last fired (for crosshair)
const FIRE_INDICATOR_DURATION = 0.15; // How long to show firing expansion (seconds)

export function initWeapon(renderer) {
    // Initialize current weapon - use selected weapon if available (multiplayer), otherwise default to assault rifle (test range)
    gameState.currentWeapon = gameState.selectedWeapon || WEAPON_TYPES.ASSAULT_RIFLE;
    
    // Reset weapon ammo pools whenever the weapon system is initialized
    for (const weaponDef of Object.values(weapons)) {
        weaponDef.ammo = weaponDef.AMMO_CAPACITY;
        weaponDef.ammoTotal = weaponDef.AMMO_TOTAL;
    }
    isShooting = false;
    shootCooldown = 0;
    isReloading = false;
    reloadTimer = 0;
    lastShootSentState = false;
    pendingShootFalse = false;
    
    renderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button === 0 && gameState.isMouseLocked && !isReloading) { // Left click
            isShooting = true;
        }
    });

    renderer.domElement.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isShooting = false;
            if (networkClient.isConnected && lastShootSentState) {
                networkClient.sendInput({
                    shoot: false,
                    weaponType: gameState.currentWeapon
                });
                lastShootSentState = false;
            }
        }
    });

    // Weapon switching - enabled for test range, disabled for multiplayer
    window.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'Digit1':
                // Only allow switching if not in multiplayer (no selectedWeapon)
                if (!gameState.selectedWeapon) {
                    switchWeapon(WEAPON_TYPES.PISTOL);
                }
                break;
            case 'Digit2':
                if (!gameState.selectedWeapon) {
                    switchWeapon(WEAPON_TYPES.ASSAULT_RIFLE);
                }
                break;
            case 'Digit3':
                if (!gameState.selectedWeapon) {
                    switchWeapon(WEAPON_TYPES.SHOTGUN);
                }
                break;
            case 'Digit4':
                if (!gameState.selectedWeapon) {
                    switchWeapon(WEAPON_TYPES.ROCKET_LAUNCHER);
                }
                break;
            case 'KeyR':
                if (!isReloading) {
                    reload();
                }
                break;
        }
    });

    window.addEventListener('blur', () => {
        if (isShooting) {
            isShooting = false;
        }
        if (networkClient.isConnected && lastShootSentState) {
            networkClient.sendInput({
                shoot: false,
                weaponType: gameState.currentWeapon
            });
            lastShootSentState = false;
        }
    });
}

function switchWeapon(weaponType) {
    // Weapon switching is disabled in multiplayer (when selectedWeapon is set)
    // Only allow switching in test range (when selectedWeapon is not set)
    if (gameState.selectedWeapon && gameState.currentWeapon && gameState.currentWeapon !== weaponType) {
        console.log('Weapon switching disabled in multiplayer - using selected weapon only');
        return;
    }
    
    if (gameState.currentWeapon === weaponType) return;
    if (isReloading) return; // Can't switch while reloading
    
    gameState.currentWeapon = weaponType;
    isShooting = false; // Stop shooting when switching
    shootCooldown = 0;
    
    // Reset assault rifle recoil when switching away
    if (gameState.currentWeapon !== WEAPON_TYPES.ASSAULT_RIFLE) {
        assaultRifleFireDuration = 0;
        assaultRifleConsecutiveShots = 0;
    }
    
    // Always send weapon type to server when switching weapons
    if (networkClient.isConnected) {
        networkClient.sendInput({
            shoot: false,
            weaponType
        });
        if (lastShootSentState) {
            lastShootSentState = false;
        }
    }
}

export function getCurrentWeapon() {
    return weapons[gameState.currentWeapon];
}

function reload() {
    const weapon = getCurrentWeapon();
    const ammoNeeded = weapon.AMMO_CAPACITY - weapon.ammo;
    
    if (ammoNeeded <= 0) return; // Already full
    if (weapon.ammoTotal <= 0) return; // No ammo available
    
    isReloading = true;
    reloadTimer = weapon.RELOAD_TIME;
    
    // Reload happens after delay (handled in updateWeapon)
}

function shootRaycast(weapon) {
    const maxDistance = weapon.DISTANCE || Infinity;
    
    // Check weapon type for spread and pellet count
    const isShotgun = gameState.currentWeapon === WEAPON_TYPES.SHOTGUN;
    const isPistol = gameState.currentWeapon === WEAPON_TYPES.PISTOL;
    const isAssaultRifle = gameState.currentWeapon === WEAPON_TYPES.ASSAULT_RIFLE;
    
    const pelletCount = isShotgun ? 8 : 1;
    const damagePerPellet = isShotgun ? weapon.DAMAGE / pelletCount : weapon.DAMAGE;
    
    // Spread angles: pistol has minimal spread (1-2 degrees), shotgun has 8 degrees
    // Assault rifle has dynamic spread based on sustained fire
    let spreadAngle = 0;
    if (isShotgun) {
        spreadAngle = 8 * Math.PI / 180; // 8 degrees
    } else if (isPistol) {
        spreadAngle = (1 + Math.random()) * Math.PI / 180; // 1-2 degrees random
    } else if (isAssaultRifle) {
        // Calculate spread based on consecutive shots
        if (assaultRifleConsecutiveShots < ASSAULT_RIFLE_TIGHT_SHOTS) {
            // First few shots are tight (1 degree)
            spreadAngle = 1 * Math.PI / 180;
        } else {
            // Spread increases with each shot after tight shots
            const extraShots = assaultRifleConsecutiveShots - ASSAULT_RIFLE_TIGHT_SHOTS;
            const currentSpread = Math.min(
                ASSAULT_RIFLE_MAX_SPREAD,
                1 * Math.PI / 180 + (extraShots * ASSAULT_RIFLE_SPREAD_INCREASE_RATE * Math.PI / 180)
            );
            spreadAngle = currentSpread;
        }
    }
    
    // Fire each pellet
    for (let i = 0; i < pelletCount; i++) {
        let rayDirection = new THREE.Vector2(0, 0);
        
        // Apply spread for shotgun, pistol, and assault rifle
        if ((isShotgun && i > 0) || (isPistol && spreadAngle > 0) || (isAssaultRifle && spreadAngle > 0)) {
            // Generate spread pattern
            let angle, radius;
            if (isShotgun) {
                angle = (i / pelletCount) * Math.PI * 2;
                radius = Math.random() * spreadAngle;
            } else if (isAssaultRifle) {
                // Assault rifle: slight upward bias, then horizontal spread
                const upwardBias = assaultRifleConsecutiveShots < ASSAULT_RIFLE_TIGHT_SHOTS ? 0.3 : 0.1;
                angle = Math.random() * Math.PI * 2;
                // Add slight upward bias
                if (Math.random() < upwardBias) {
                    angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 4; // Slight upward
                }
                radius = Math.random() * spreadAngle;
            } else {
                // Pistol
                angle = Math.random() * Math.PI * 2;
                radius = Math.random() * spreadAngle;
            }
            rayDirection.x = Math.cos(angle) * radius;
            rayDirection.y = Math.sin(angle) * radius;
        }
        
        // Raycast from camera with spread offset
        raycaster.setFromCamera(rayDirection, camera);
        raycaster.far = maxDistance;
        
        // Use filter function to exclude spark particles and muzzle effects from raycast
        raycaster.layers.set(0); // Use default layer
        const intersects = raycaster.intersectObjects(scene.children, true).filter(hit => {
            // Exclude muzzle particles, flash, and glow from hits
            const obj = hit.object;
            return !obj.userData?.isMuzzleParticle && 
                   !obj.userData?.isMuzzleFlash &&
                   !obj.userData?.isMuzzleGlow;
        });
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            
            // Check if hit is within weapon range
            if (hit.distance > maxDistance) {
                continue; // Out of range, skip this pellet
            }
            
            const hitObject = hit.object;
            const targetGroup = getTargetFromObject(hitObject);
            
            if (targetGroup) {
                // Check for headshot (pistol only, 2x damage)
                const isHeadshot = isPistol && hitObject.userData?.isHead === true;
                const finalDamage = isHeadshot ? damagePerPellet * 2 : damagePerPellet;
                
                const targetId = targetGroup.userData.id;
                const destroyed = damageTarget(targetGroup, finalDamage, { awardKill: true });
                
                if (destroyed && networkClient.isConnected) {
                    networkClient.sendTargetDestroyed(targetId);
                }
            }
            
            // Visual feedback (spark effect) for each pellet hit
            // Different colors for headshots and weapons
            let sparkColor = 0xFFFF00;
            let sparkSize = 0.05;
            
            if (isPistol && hitObject.userData?.isHead === true) {
                sparkColor = 0xFF0000; // Red for headshot
                sparkSize = 0.04;
            } else if (isPistol) {
                sparkColor = 0xFFFFFF; // White for pistol
                sparkSize = 0.04;
            } else if (isAssaultRifle) {
                sparkColor = 0xFFAA00; // Orange for assault rifle
                sparkSize = 0.04;
            } else if (isShotgun) {
                sparkColor = 0xFF8800; // Orange-red for shotgun
                sparkSize = 0.05;
            }
            
            const sparkGeometry = new THREE.SphereGeometry(sparkSize, 8, 8);
            const sparkMaterial = new THREE.MeshBasicMaterial({ color: sparkColor });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            spark.position.copy(hit.point);
            scene.add(spark);
            
            setTimeout(() => scene.remove(spark), 50);
        }
    }
    
    // Camera shake for all weapons (weapon-specific intensity)
    if (isPistol) {
        applyCameraShake(0.008, 0.05); // Small shake, quick recovery (increased significantly)
    } else if (isAssaultRifle) {
        // Assault rifle shake increases with sustained fire
        const baseShake = 0.006; // Increased significantly
        const durationShake = Math.min(assaultRifleFireDuration * 0.002, 0.010); // Increased max
        applyCameraShake(baseShake + durationShake, 0.1);
    } else if (isShotgun) {
        applyCameraShake(0.015, 0.15); // Strong kick for shotgun (increased)
    }
    // Note: Rocket launcher shake is handled in shootProjectile()
}

// Camera shake effect
let cameraShakeOffset = { x: 0, y: 0 };
let cameraShakeDecay = 0.88; // Slower decay for more noticeable shake

function applyCameraShake(intensity, duration) {
    // Apply shake with more pronounced effect
    const shakeX = (Math.random() - 0.5) * intensity * 2; // Doubled for more noticeable effect
    const shakeY = (Math.random() - 0.5) * intensity * 2; // Doubled for more noticeable effect
    cameraShakeOffset.x += shakeX;
    cameraShakeOffset.y += shakeY;
}

// Export camera shake offset for use in player update
export function getCameraShakeOffset() {
    return cameraShakeOffset;
}

// Export assault rifle spread for crosshair visualization
export function getAssaultRifleSpread() {
    if (gameState.currentWeapon !== WEAPON_TYPES.ASSAULT_RIFLE) {
        return 0;
    }
    
    // Calculate current spread (same logic as in shootRaycast)
    if (assaultRifleConsecutiveShots < ASSAULT_RIFLE_TIGHT_SHOTS) {
        return 1 * Math.PI / 180; // 1 degree
    } else {
        const extraShots = assaultRifleConsecutiveShots - ASSAULT_RIFLE_TIGHT_SHOTS;
        return Math.min(
            ASSAULT_RIFLE_MAX_SPREAD,
            1 * Math.PI / 180 + (extraShots * ASSAULT_RIFLE_SPREAD_INCREASE_RATE * Math.PI / 180)
        );
    }
}

// Check if weapon just fired (for crosshair expansion)
export function isWeaponFiring() {
    if (!gameState.currentWeapon) return false;
    
    // For instant detection, check if currently shooting (mouse button held down)
    // This is especially important for automatic weapons like assault rifle
    // Don't check shootCooldown - we want instant expansion as soon as mouse is pressed
    if (isShooting && !isReloading) {
        return true;
    }
    
    // Also check if weapon fired very recently (for single-shot weapons)
    const currentTime = performance.now() / 1000;
    return (currentTime - lastFireTime) < FIRE_INDICATOR_DURATION;
}

// Update camera shake decay (called from updateWeapon)
export function updateCameraShake(deltaTime) {
    cameraShakeOffset.x *= Math.pow(cameraShakeDecay, deltaTime * 60); // Normalize to 60fps
    cameraShakeOffset.y *= Math.pow(cameraShakeDecay, deltaTime * 60);
    
    // Clamp to zero when very small
    if (Math.abs(cameraShakeOffset.x) < 0.0001) cameraShakeOffset.x = 0;
    if (Math.abs(cameraShakeOffset.y) < 0.0001) cameraShakeOffset.y = 0;
}

function shootProjectile(weapon) {
    // Get camera direction
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // Spawn position slightly in front of camera
    const spawnOffset = direction.clone().multiplyScalar(0.5);
    const spawnPosition = camera.position.clone().add(spawnOffset);
    
    // Create rocket
    createRocket(spawnPosition, direction);
    
    // Camera shake for rocket launcher (heavy recoil)
    if (gameState.currentWeapon === WEAPON_TYPES.ROCKET_LAUNCHER) {
        applyCameraShake(0.015, 0.2); // Heavy recoil for rocket launcher
    }
}

export function shoot() {
    const weapon = getCurrentWeapon();
    
    if (!weapon) {
        return false;
    }
    
    if (weapon.ammo <= 0) {
        // Try to auto-reload if possible
        if (weapon.ammoTotal > 0 && !isReloading) {
            reload();
        }
        return false;
    }
    
    if (shootCooldown > 0) return false;
    if (isReloading) return false;
    
    weapon.ammo--;
    shootCooldown = weapon.FIRE_RATE;
    lastFireTime = performance.now() / 1000; // Track fire time in seconds
    
    // Increment consecutive shots for assault rifle
    if (gameState.currentWeapon === WEAPON_TYPES.ASSAULT_RIFLE) {
        assaultRifleConsecutiveShots++;
    }
    
    if (weapon.PROJECTILE_TYPE === 'raycast') {
        shootRaycast(weapon);
    } else if (weapon.PROJECTILE_TYPE === 'projectile') {
        shootProjectile(weapon);
    }
    
    return true; // Return true if shot was fired
}

export function updateWeapon(deltaTime) {
    const weapon = getCurrentWeapon();
    if (!weapon) {
        return false;
    }
    
    // Auto-fire for automatic weapons when mouse is held down
    if (isShooting && weapon.FIRE_MODE === 'auto' && shootCooldown <= 0 && !isReloading) {
        shoot();
    }
    
    // Update camera shake decay
    updateCameraShake(deltaTime);
    
    // Update assault rifle recoil/spread tracking
    const isAssaultRifle = gameState.currentWeapon === WEAPON_TYPES.ASSAULT_RIFLE;
    if (isAssaultRifle) {
        if (isShooting) {
            // Increase fire duration while shooting
            assaultRifleFireDuration += deltaTime;
        } else {
            // Recover spread when not shooting
            assaultRifleFireDuration = Math.max(0, assaultRifleFireDuration - deltaTime * ASSAULT_RIFLE_SPREAD_RECOVERY_RATE);
            // Reset consecutive shots after brief pause (0.2 seconds)
            if (assaultRifleConsecutiveShots > 0) {
                setTimeout(() => {
                    if (!isShooting && gameState.currentWeapon === WEAPON_TYPES.ASSAULT_RIFLE) {
                        assaultRifleConsecutiveShots = 0;
                    }
                }, 200);
            }
        }
    } else {
        // Reset when not using assault rifle
        assaultRifleFireDuration = 0;
        assaultRifleConsecutiveShots = 0;
    }
    
    // Handle reloading
    if (isReloading) {
        reloadTimer -= deltaTime;
        if (reloadTimer <= 0) {
            // Complete reload
            const ammoNeeded = weapon.AMMO_CAPACITY - weapon.ammo;
            const reloadAmount = Math.min(ammoNeeded, weapon.ammoTotal);
            weapon.ammo += reloadAmount;
            weapon.ammoTotal -= reloadAmount;
            
            isReloading = false;
            reloadTimer = 0;
        }
    }
    
    // Handle shooting
    if (shootCooldown > 0) {
        shootCooldown -= deltaTime;
        if (shootCooldown < 0) shootCooldown = 0;
    }
    
    // Handle firing
    let shotFired = false;
    if (isShooting && !isReloading && shootCooldown <= 0) {
        shotFired = shoot();

        if (shotFired && networkClient.isConnected) {
            // Send shoot: true immediately when shot fires
            networkClient.sendInput({
                shoot: true,
                weaponType: gameState.currentWeapon
            });
            lastShootSentState = true;
            
            // For semi-auto, stop shooting and schedule shoot: false for next frame
            if (weapon.FIRE_MODE === 'semi-auto') {
                isShooting = false;
                pendingShootFalse = true; // Will send shoot: false on next frame
            }
        }
    }

    // Send shoot: false when not shooting
    // For semi-auto, delay by one frame to ensure shoot: true is processed first
    if (pendingShootFalse && networkClient.isConnected) {
        // Send shoot: false on the frame after shoot: true was sent
        networkClient.sendInput({
            shoot: false,
            weaponType: gameState.currentWeapon
        });
        lastShootSentState = false;
        pendingShootFalse = false;
    } else if ((!isShooting || isReloading) && networkClient.isConnected && lastShootSentState && !pendingShootFalse) {
        // For non-semi-auto or when not pending, send shoot: false immediately
        networkClient.sendInput({
            shoot: false,
            weaponType: gameState.currentWeapon
        });
        lastShootSentState = false;
    }
    
    // Return whether a shot was fired (for viewmodel animation)
    return shotFired;
}

export function forceEquipWeapon(weaponType) {
    if (!weaponType) return false;
    // Use switchWeapon which will send weapon type to server
    switchWeapon(weaponType);
    return true;
}

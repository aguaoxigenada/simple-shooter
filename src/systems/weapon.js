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

export function initWeapon(renderer) {
    // Initialize current weapon
    gameState.currentWeapon = WEAPON_TYPES.ASSAULT_RIFLE;
    
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

    // Weapon switching
    window.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'Digit1':
                switchWeapon(WEAPON_TYPES.PISTOL);
                break;
            case 'Digit2':
                switchWeapon(WEAPON_TYPES.ASSAULT_RIFLE);
                break;
            case 'Digit3':
                switchWeapon(WEAPON_TYPES.ROCKET_LAUNCHER);
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
    if (gameState.currentWeapon === weaponType) return;
    if (isReloading) return; // Can't switch while reloading
    
    gameState.currentWeapon = weaponType;
    isShooting = false; // Stop shooting when switching
    shootCooldown = 0;
    if (networkClient.isConnected && lastShootSentState) {
        networkClient.sendInput({
            shoot: false,
            weaponType
        });
        lastShootSentState = false;
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
    // Raycast from camera
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;
        const targetGroup = getTargetFromObject(hitObject);
        
        if (targetGroup) {
            const targetId = targetGroup.userData.id;
            const destroyed = damageTarget(targetGroup, weapon.DAMAGE, { awardKill: true });
            
            if (destroyed && networkClient.isConnected) {
                networkClient.sendTargetDestroyed(targetId);
            }
        }
        
        // Visual feedback (spark effect)
        const sparkGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
        const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
        spark.position.copy(hit.point);
        scene.add(spark);
        
        setTimeout(() => scene.remove(spark), 50);
    }
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

        if (shotFired && weapon.FIRE_MODE === 'semi-auto') {
            // For semi-auto, shoot once and then stop shooting until mouse is released and pressed again
            isShooting = false;
        }

        if (shotFired && networkClient.isConnected) {
            networkClient.sendInput({
                shoot: true,
                weaponType: gameState.currentWeapon
            });
            lastShootSentState = true;
        }
    }

    if ((!isShooting || isReloading) && networkClient.isConnected && lastShootSentState) {
        networkClient.sendInput({
            shoot: false,
            weaponType: gameState.currentWeapon
        });
        lastShootSentState = false;
    }
    
    // Return whether a shot was fired (for viewmodel animation)
    return shotFired;
}

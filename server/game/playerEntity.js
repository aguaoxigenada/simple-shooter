// Server-side player entity - authoritative player state
import { PLAYER, WEAPON } from '../shared/constants.js';

import { CollisionManager } from '../world/collision.js';
import { ProjectileEntity } from './projectileEntity.js';

/**
 * Rotate a 2D vector (x, z) by yaw angle, matching Three.js coordinate system exactly
 * This replicates: new THREE.Vector3(x, 0, z).applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ'))
 * 
 * Three.js coordinate system:
 * - +X = right
 * - +Z = forward (away from camera)  
 * - -Z = backward (toward camera)
 * 
 * @param {number} x - X component of input vector (in camera-local space)
 * @param {number} z - Z component of input vector (in camera-local space) 
 * @param {number} yaw - Yaw angle in radians (camera rotation)
 * @returns {{x: number, z: number}} Rotated vector in world space
 */
function rotateVectorByYaw(x, z, yaw) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    
    // CORRECTED: This matrix matches Three.js Vector3.applyEuler() for Y-axis rotation
    // Verified to produce identical results to Three.js
    return {
        x: x * cosYaw + z * sinYaw,
        z: -x * sinYaw + z * cosYaw
    };
}

export class PlayerEntity {
    constructor(id, collisionManager) {
        this.id = id;
        this.collisionManager = collisionManager;
        this.position = { x: 3, y: PLAYER.PLAYER_HEIGHT, z: 3 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotation = { yaw: 0, pitch: 0 };
        
        // Player state
        this.health = PLAYER.MAX_HEALTH;
        this.stamina = PLAYER.MAX_STAMINA;
        this.isCrouched = false;
        this.isGrounded = true;
        this.canJump = true;
        this.isOnLadder = false;
        this.currentLadder = null;
        
        // Input state
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            crouch: false,
            mouseX: 0,
            mouseY: 0,
            shoot: false,
            weaponType: null
        };
        
        // Weapon state
        this.currentWeapon = 'assault_rifle';
        this.weaponAmmo = {
            'pistol': { ammo: WEAPON.PISTOL.AMMO_CAPACITY, ammoTotal: WEAPON.PISTOL.AMMO_TOTAL },
            'assault_rifle': { ammo: WEAPON.ASSAULT_RIFLE.AMMO_CAPACITY, ammoTotal: WEAPON.ASSAULT_RIFLE.AMMO_TOTAL },
            'rocket_launcher': { ammo: WEAPON.ROCKET_LAUNCHER.AMMO_CAPACITY, ammoTotal: WEAPON.ROCKET_LAUNCHER.AMMO_TOTAL }
        };
        this.isReloading = false;
        this.reloadTimer = 0;
        this.shootCooldown = 0;
        this.lastShootInput = false; // Track previous shoot state for semi-auto weapons
        this._debugLastShootLog = 0;
        this._debugLastRaycastLog = 0;
    }

    static spawnHeight() {
        return PLAYER.PLAYER_HEIGHT;
    }

    updateInput(inputData) {
        // Update input from client - keys are explicitly set (true/false)
        if (inputData.keys) {
            if (inputData.keys.w !== undefined) this.input.forward = inputData.keys.w;
            if (inputData.keys.s !== undefined) this.input.backward = inputData.keys.s;
            if (inputData.keys.a !== undefined) this.input.left = inputData.keys.a;
            if (inputData.keys.d !== undefined) this.input.right = inputData.keys.d;
            if (inputData.keys.space !== undefined) this.input.jump = inputData.keys.space;
            if (inputData.keys.shift !== undefined) this.input.sprint = inputData.keys.shift;
            if (inputData.keys.ctrl !== undefined) this.input.crouch = inputData.keys.ctrl;
        }
        
        // Update rotation from client
        // Prefer absolute yaw/pitch values if provided (more accurate, avoids drift)
        if (inputData.yaw !== undefined) {
            // Use the exact yaw value from client to ensure server and client use same rotation
            this.rotation.yaw = inputData.yaw;
        } else if (inputData.mouseX !== undefined && inputData.mouseX !== 0) {
            // Fallback to delta-based rotation if absolute values not provided
            this.input.mouseX = inputData.mouseX;
            // Match client: yaw -= mouseX * sensitivity
            this.rotation.yaw -= inputData.mouseX * PLAYER.MOUSE_SENSITIVITY;
        }
        
        if (inputData.pitch !== undefined) {
            this.rotation.pitch = inputData.pitch;
        } else if (inputData.mouseY !== undefined && inputData.mouseY !== 0) {
            // Fallback to delta-based rotation if absolute values not provided
            this.input.mouseY = inputData.mouseY;
            this.rotation.pitch -= inputData.mouseY * PLAYER.MOUSE_SENSITIVITY;
            this.rotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.pitch));
        }
        
        // Handle shooting input
        if (inputData.shoot !== undefined) {
            this.input.shoot = inputData.shoot;
        }
        if (inputData.weaponType !== undefined) {
            this.currentWeapon = inputData.weaponType;
        }
    }

    // Debug function to verify movement calculations
    debugMovement(moveX, moveZ, dirX, dirZ, yaw) {
        console.log('Movement Debug:');
        console.log('  Input (local):', { x: moveX, z: moveZ });
        console.log('  Yaw:', yaw, 'radians (', yaw * 180/Math.PI, 'degrees)');
        console.log('  Output (world):', { x: dirX, z: dirZ });
        
        // Test with known values to verify rotation
        const testRot = rotateVectorByYaw(0, -1, 0); // Forward with 0 yaw
        console.log('  Test Forward (0 yaw):', testRot); // Should be {x: 0, z: -1}
        
        const testRot90 = rotateVectorByYaw(0, -1, Math.PI/2); // Forward with 90? yaw  
        console.log('  Test Forward (90? yaw):', testRot90); // Should be {x: -1, z: 0}
    }

    update(deltaTime, otherPlayers = [], collisionManager = null, onShoot = null, onPlayerHit = null) {
        // Use provided collision manager or instance one
        if (collisionManager) {
            this.collisionManager = collisionManager;
        }
        
        // Update weapon state
        this.updateWeapon(deltaTime, otherPlayers, onShoot, onPlayerHit);
        
        // Update crouch state
        this.isCrouched = this.input.crouch;
        const effectiveHeight = this.isCrouched ? PLAYER.CROUCH_HEIGHT : PLAYER.PLAYER_HEIGHT;
        
        // Calculate movement direction in local space
        // Match client EXACTLY: direction.z -= 1 for forward, direction.x -= 1 for left
        let moveX = 0;
        let moveZ = 0;
        
        // IMPORTANT: These must match client input mapping exactly
        // FIX TEST: If directions are wrong, try swapping forward/backward or left/right
        // Current mapping (matches client):
        if (this.input.forward) moveZ -= 1;   // W key = forward = -Z direction
        if (this.input.backward) moveZ += 1;   // S key = backward = +Z direction
        if (this.input.left) moveX -= 1;       // A key = left = -X direction
        if (this.input.right) moveX += 1;      // D key = right = +X direction
        
        // Test: If W goes wrong direction, try inverting Z
        // if (this.input.forward) moveZ += 1;   // Inverted
        // if (this.input.backward) moveZ -= 1;   // Inverted
        
        // Normalize movement vector
        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLength > 0) {
            moveX /= moveLength;
            moveZ /= moveLength;
        }
        
        // Apply rotation to movement direction
        // CRITICAL: This MUST match client exactly - client uses applyEuler(0, yaw, 0, 'YXZ')
        // The rotation matrix now matches Three.js applyEuler behavior exactly
        const rotated = rotateVectorByYaw(moveX, moveZ, this.rotation.yaw);
        const dirX = rotated.x;
        const dirZ = rotated.z;
        
        // DEBUG: Uncomment to see movement calculations (samples 1% of frames to avoid spam)
        // if (Math.random() < 0.01) {
        //     this.debugMovement(moveX, moveZ, dirX, dirZ, this.rotation.yaw);
        // }
        
        // Determine speed
        const isMoving = moveLength > 0;
        const wantsToSprint = this.input.sprint && isMoving && !this.isCrouched;
        const hasEnoughStamina = this.stamina >= 1;
        const isSprinting = wantsToSprint && hasEnoughStamina;
        
        // Update stamina
        if (isSprinting) {
            this.stamina = Math.max(0, this.stamina - PLAYER.STAMINA_DEPLETION_RATE * deltaTime);
        } else {
            this.stamina = Math.min(PLAYER.MAX_STAMINA, this.stamina + PLAYER.STAMINA_RECOVERY_RATE * deltaTime);
        }
        
        // Calculate speed
        let speed = PLAYER.MOVE_SPEED;
        if (isSprinting) {
            speed = PLAYER.SPRINT_SPEED;
        }
        if (this.isCrouched) {
            speed *= PLAYER.CROUCH_SPEED_MULTIPLIER;
        }
        
        // Update velocity
        // Match client EXACTLY: velocity.x = direction.x * speed, velocity.z = direction.z * speed
        // CRITICAL: These assignments must match client exactly
        this.velocity.x = dirX * speed;
        this.velocity.z = dirZ * speed;
        
        // Store old position for collision resolution
        const oldX = this.position.x;
        const oldZ = this.position.z;
        
        // Calculate new position
        const newX = this.position.x + this.velocity.x * deltaTime;
        const newZ = this.position.z + this.velocity.z * deltaTime;
        
        // Check collision with geometry and other players
        if (this.collisionManager) {
            const currentHeight = effectiveHeight;
            
            // First check geometry collision
            let resolved = this.collisionManager.resolveCollision(
                oldX, oldZ, newX, newZ,
                PLAYER.PLAYER_RADIUS, currentHeight
            );
            
            // Then check player-to-player collision
            if (this.collisionManager.checkPlayerCollision(
                resolved.x, resolved.z, PLAYER.PLAYER_RADIUS, otherPlayers
            )) {
                // Don't move if colliding with another player
                resolved = { x: oldX, z: oldZ };
            }
            
            this.position.x = resolved.x;
            this.position.z = resolved.z;
        } else {
            // Fallback if no collision manager
            this.position.x = newX;
            this.position.z = newZ;
        }
        
        if (this.collisionManager) {
            this.currentLadder = this.collisionManager.findLadder(
                this.position.x,
                this.position.z,
                this.position.y,
                PLAYER.PLAYER_RADIUS,
                effectiveHeight
            );
        } else {
            this.currentLadder = null;
        }
        this.isOnLadder = !!this.currentLadder;

        if (this.isOnLadder && this.input.jump && !this.isCrouched) {
            this.velocity.y = PLAYER.JUMP_VELOCITY;
            this.canJump = false;
            this.isGrounded = false;
            this.isOnLadder = false;
            this.currentLadder = null;
        }

        if (!this.isOnLadder) {
            this.velocity.y += PLAYER.GRAVITY * deltaTime;
            this.position.y += this.velocity.y * deltaTime;
        } else {
            this.velocity.y = 0;
            const ladder = this.currentLadder;
            const climbDir = (this.input.forward ? 1 : 0) - (this.input.backward ? 1 : 0);
            if (climbDir !== 0) {
                this.position.y += climbDir * PLAYER.LADDER_CLIMB_SPEED * deltaTime;
            }
            const minClimbY = ladder.minY + effectiveHeight;
            const maxClimbY = ladder.maxY;
            this.position.y = Math.max(minClimbY, Math.min(maxClimbY, this.position.y));
            this.canJump = true;
            this.isGrounded = false;
        }
        
        // Ground collision
        const currentHeight = effectiveHeight;
        if (this.position.y < currentHeight) {
            this.position.y = currentHeight;
            this.velocity.y = 0;
            this.canJump = true;
            this.isGrounded = true;
        }
        
        // Simple boundaries
        this.position.x = Math.max(-90, Math.min(90, this.position.x));
        this.position.z = Math.max(-90, Math.min(90, this.position.z));
    }

    updateWeapon(deltaTime, otherPlayers, onShoot, onPlayerHit) {
        // Map weapon name to weapon constant key
        const weaponMap = {
            'pistol': 'PISTOL',
            'assault_rifle': 'ASSAULT_RIFLE',
            'rocket_launcher': 'ROCKET_LAUNCHER'
        };
        const weaponKey = weaponMap[this.currentWeapon] || 'ASSAULT_RIFLE';
        const weapon = WEAPON[weaponKey];
        const ammoState = this.weaponAmmo[this.currentWeapon] || { ammo: 0, ammoTotal: 0 };
        
        // Update reload timer
        if (this.isReloading) {
            this.reloadTimer -= deltaTime;
            if (this.reloadTimer <= 0) {
                // Complete reload
                const ammoNeeded = weapon.AMMO_CAPACITY - ammoState.ammo;
                const reloadAmount = Math.min(ammoNeeded, ammoState.ammoTotal);
                ammoState.ammo += reloadAmount;
                ammoState.ammoTotal -= reloadAmount;
                this.isReloading = false;
                this.reloadTimer = 0;
            }
        }
        
        // Update shoot cooldown
        if (this.shootCooldown > 0) {
            this.shootCooldown -= deltaTime;
            if (this.shootCooldown < 0) this.shootCooldown = 0;
        }
        
        // Handle shooting
        if (!this.isReloading && this.shootCooldown <= 0 && ammoState.ammo > 0) {
            const wantsToShoot = this.input.shoot;
            
            if (weapon.FIRE_MODE === 'auto') {
                // Auto-fire: shoot while button is held
                if (wantsToShoot) {
                    if (Date.now() - this._debugLastShootLog > 1000) {
                        console.log(`[Shoot] Player ${this.id} auto-fire request. Ammo: ${ammoState.ammo}`);
                        this._debugLastShootLog = Date.now();
                    }
                    this.shoot(weapon, ammoState, otherPlayers, onShoot, onPlayerHit);
                }
            } else if (weapon.FIRE_MODE === 'semi-auto') {
                // Semi-auto: shoot once per button press
                if (wantsToShoot && !this.lastShootInput) {
                    if (Date.now() - this._debugLastShootLog > 1000) {
                        console.log(`[Shoot] Player ${this.id} semi-auto trigger. Ammo: ${ammoState.ammo}`);
                        this._debugLastShootLog = Date.now();
                    }
                    this.shoot(weapon, ammoState, otherPlayers, onShoot, onPlayerHit);
                }
            }
            
            this.lastShootInput = wantsToShoot;
        }
    }

    shoot(weapon, ammoState, otherPlayers, onShoot, onPlayerHit) {
        if (ammoState.ammo <= 0 || this.shootCooldown > 0 || this.isReloading) {
            return false;
        }
        
        ammoState.ammo--;
        this.shootCooldown = weapon.FIRE_RATE;
        
        if (weapon.PROJECTILE_TYPE === 'raycast') {
            // Perform raycast hit
            this.performRaycast(weapon, otherPlayers, onPlayerHit);
        } else if (weapon.PROJECTILE_TYPE === 'projectile' && onShoot) {
            // Create projectile
            const direction = this.getShootDirection();
            const spawnPosition = {
                x: this.position.x + direction.x * 0.5,
                y: this.position.y + direction.y * 0.5,
                z: this.position.z + direction.z * 0.5
            };
            const velocity = {
                x: direction.x * 20,
                y: direction.y * 20,
                z: direction.z * 20
            };
            
            onShoot(spawnPosition, velocity, weapon.DAMAGE, this.id, this.currentWeapon);
        }
        
        return true;
    }

    getShootDirection() {
        // Calculate direction vector from rotation
        const pitch = this.rotation.pitch;
        const yaw = this.rotation.yaw;
        
        return {
            x: -Math.sin(yaw) * Math.cos(pitch),
            y: -Math.sin(pitch),
            z: -Math.cos(yaw) * Math.cos(pitch)
        };
    }

    performRaycast(weapon, otherPlayers, onPlayerHit) {
        const direction = this.getShootDirection();
        const dirLength = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
        direction.x /= dirLength;
        direction.y /= dirLength;
        direction.z /= dirLength;

        const maxDistance = 100;
        const playerRadius = PLAYER.PLAYER_RADIUS + 0.35;
        const originX = this.position.x;
        const originY = this.position.y;
        const originZ = this.position.z;
        const stepSize = 0.1;

        for (const player of otherPlayers) {
            if (player.health <= 0) continue;

            const playerHeight = player.isCrouched ? PLAYER.CROUCH_HEIGHT : PLAYER.PLAYER_HEIGHT;
            const topY = player.position.y;
            const bottomY = player.position.y - playerHeight;
            const radiusSq = playerRadius * playerRadius;

            for (let t = 0; t <= maxDistance; t += stepSize) {
                const px = originX + direction.x * t;
                const py = originY + direction.y * t;
                const pz = originZ + direction.z * t;

                if (py < bottomY - playerRadius || py > topY + playerRadius) {
                    continue;
                }

                const dx = px - player.position.x;
                const dz = pz - player.position.z;
                if (dx * dx + dz * dz <= radiusSq) {
                    const wasFatal = player.takeDamage(weapon.DAMAGE);

                    if (onPlayerHit) {
                        onPlayerHit({
                            attackerId: this.id,
                            targetId: player.id,
                            damage: weapon.DAMAGE,
                            weaponType: this.currentWeapon,
                            wasFatal
                        });
                    }

                    if (Date.now() - this._debugLastRaycastLog > 1000) {
                        console.log(`[Raycast Hit] ${this.id} -> ${player.id}, damage ${weapon.DAMAGE}, fatal: ${wasFatal}`);
                        this._debugLastRaycastLog = Date.now();
                    }
                    return;
                }
            }
        }

        if (Date.now() - this._debugLastRaycastLog > 2000) {
            console.log(`[Raycast Miss] Player ${this.id} shot but no hit detected.`);
            this._debugLastRaycastLog = Date.now();
        }
    }

    takeDamage(amount) {
        const previousHealth = this.health;
        this.health = Math.max(0, this.health - amount);
        return previousHealth > 0 && this.health === 0;
    }

    respawn() {
        this.position = { x: 3, y: PLAYER.PLAYER_HEIGHT, z: 3 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.health = PLAYER.MAX_HEALTH;
        this.stamina = PLAYER.MAX_STAMINA;
    }

    serialize() {
        return {
            id: this.id,
            position: { ...this.position },
            rotation: { ...this.rotation },
            health: this.health,
            stamina: this.stamina,
            isCrouched: this.isCrouched,
            currentWeapon: this.currentWeapon
        };
    }
}
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
            'shotgun': { ammo: WEAPON.SHOTGUN.AMMO_CAPACITY, ammoTotal: WEAPON.SHOTGUN.AMMO_TOTAL },
            'rocket_launcher': { ammo: WEAPON.ROCKET_LAUNCHER.AMMO_CAPACITY, ammoTotal: WEAPON.ROCKET_LAUNCHER.AMMO_TOTAL }
        };
        this.isReloading = false;
        this.reloadTimer = 0;
        this.shootCooldown = 0;
        this.lastShootInput = false; // Track previous shoot state for semi-auto weapons
        this._debugLastShootLog = 0;
        this._debugLastRaycastLog = 0;
        
        // Assault rifle recoil/spread tracking
        this.assaultRifleConsecutiveShots = 0;
        this.assaultRifleFireDuration = 0;
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
            const oldShootState = this.input.shoot;
            const newShootState = inputData.shoot;
            
            // For semi-auto weapons, we need to track state transitions
            // If shoot becomes false, reset lastShootInput to allow next shot
            if (newShootState === false) {
                // Button was released - always reset lastShootInput when shoot is false
                if (oldShootState === true) {
                    console.log(`[Input] Player ${this.id}: Shoot button released, resetting lastShootInput`);
                }
                this.lastShootInput = false;
            } else if (newShootState === true && oldShootState === false) {
                // Button was pressed - this is a transition from false to true
                // Reset lastShootInput to allow the shot to fire
                console.log(`[Input] Player ${this.id}: Shoot button pressed (transition), resetting lastShootInput to allow shot`);
                this.lastShootInput = false;
            }
            this.input.shoot = newShootState;
        }
        if (inputData.weaponType !== undefined) {
            const oldWeapon = this.currentWeapon;
            const newWeapon = inputData.weaponType;
            // Validate weapon type
            const validWeapons = ['pistol', 'assault_rifle', 'shotgun', 'rocket_launcher'];
            if (validWeapons.includes(newWeapon)) {
                this.currentWeapon = newWeapon;
                if (oldWeapon !== this.currentWeapon) {
                    console.log(`[Weapon Change] Player ${this.id}: "${oldWeapon}" -> "${this.currentWeapon}"`);
                    // Reset lastShootInput when weapon changes to allow immediate shooting
                    this.lastShootInput = false;
                }
            } else {
                console.warn(`[Weapon Error] Player ${this.id}: Invalid weapon type "${newWeapon}", keeping "${this.currentWeapon}"`);
            }
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
            'shotgun': 'SHOTGUN',
            'rocket_launcher': 'ROCKET_LAUNCHER'
        };
        const weaponKey = weaponMap[this.currentWeapon] || 'ASSAULT_RIFLE';
        const weapon = WEAPON[weaponKey];
        
        // Debug: Log weapon info
        if (Date.now() - (this._debugLastWeaponLog || 0) > 2000) {
            console.log(`[Weapon] Player ${this.id}: currentWeapon="${this.currentWeapon}", weaponKey="${weaponKey}", weapon exists=${!!weapon}, damage=${weapon?.DAMAGE}`);
            this._debugLastWeaponLog = Date.now();
        }
        
        if (!weapon) {
            console.error(`[Weapon Error] Player ${this.id}: Weapon not found! currentWeapon="${this.currentWeapon}", weaponKey="${weaponKey}"`);
            return; // Don't proceed if weapon is invalid
        }
        
        const ammoState = this.weaponAmmo[this.currentWeapon] || { ammo: 0, ammoTotal: 0 };
        
        // Update assault rifle recoil/spread tracking
        const isAssaultRifle = this.currentWeapon === 'assault_rifle';
        if (isAssaultRifle) {
            if (this.input.shoot) {
                // Increase fire duration while shooting
                this.assaultRifleFireDuration += deltaTime;
            } else {
                // Recover spread when not shooting
                this.assaultRifleFireDuration = Math.max(0, this.assaultRifleFireDuration - deltaTime * 2.0);
                // Reset consecutive shots after brief pause (0.2 seconds)
                if (this.assaultRifleConsecutiveShots > 0 && !this.input.shoot) {
                    setTimeout(() => {
                        if (!this.input.shoot && this.currentWeapon === 'assault_rifle') {
                            this.assaultRifleConsecutiveShots = 0;
                        }
                    }, 200);
                }
            }
        } else {
            // Reset when not using assault rifle
            this.assaultRifleFireDuration = 0;
            this.assaultRifleConsecutiveShots = 0;
        }
        
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
            
            // Debug: log shoot state for semi-auto weapons
            if (weapon.FIRE_MODE === 'semi-auto' && wantsToShoot) {
                if (Date.now() - (this._debugLastShootStateLog || 0) > 500) {
                    console.log(`[Shoot State] Player ${this.id}: wantsToShoot=${wantsToShoot}, lastShootInput=${this.lastShootInput}, weapon=${this.currentWeapon}`);
                    this._debugLastShootStateLog = Date.now();
                }
            }
            
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
                // Fire when shoot is true and lastShootInput is false
                // The lastShootInput should have been reset in updateInput when shoot transitions
                if (wantsToShoot && !this.lastShootInput) {
                    console.log(`[Shoot] Player ${this.id} semi-auto trigger. Weapon: ${this.currentWeapon}, Ammo: ${ammoState.ammo}, Damage: ${weapon.DAMAGE}`);
                    this.shoot(weapon, ammoState, otherPlayers, onShoot, onPlayerHit);
                    // Immediately set lastShootInput to true to prevent multiple shots from same press
                    this.lastShootInput = true;
                } else if (!wantsToShoot) {
                    // Button is not pressed - ensure lastShootInput is false for next press
                    if (this.lastShootInput) {
                        console.log(`[Shoot] Player ${this.id}: Button not pressed, resetting lastShootInput`);
                        this.lastShootInput = false;
                    }
                } else if (wantsToShoot && this.lastShootInput) {
                    // Debug: why didn't it fire?
                    if (Date.now() - (this._debugLastSemiAutoLog || 0) > 500) {
                        console.log(`[Shoot Debug] Player ${this.id}: wantsToShoot=${wantsToShoot}, lastShootInput=${this.lastShootInput}, weapon=${this.currentWeapon}, ammo=${ammoState.ammo}, cooldown=${this.shootCooldown}`);
                        this._debugLastSemiAutoLog = Date.now();
                    }
                }
            } else {
                // For auto weapons, just update the state
                this.lastShootInput = wantsToShoot;
            }
        }
    }

    shoot(weapon, ammoState, otherPlayers, onShoot, onPlayerHit) {
        if (ammoState.ammo <= 0 || this.shootCooldown > 0 || this.isReloading) {
            console.log(`[Shoot Blocked] Player ${this.id}: ammo=${ammoState.ammo}, cooldown=${this.shootCooldown}, reloading=${this.isReloading}`);
            return false;
        }
        
        console.log(`[Shoot Fired] Player ${this.id}: weapon="${this.currentWeapon}", damage=${weapon.DAMAGE}, projectileType=${weapon.PROJECTILE_TYPE}`);
        
        ammoState.ammo--;
        this.shootCooldown = weapon.FIRE_RATE;
        
        // Increment consecutive shots for assault rifle
        if (this.currentWeapon === 'assault_rifle') {
            this.assaultRifleConsecutiveShots++;
        }
        
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
        const baseDirection = this.getShootDirection();
        const dirLength = Math.sqrt(baseDirection.x * baseDirection.x + baseDirection.y * baseDirection.y + baseDirection.z * baseDirection.z) || 1;
        baseDirection.x /= dirLength;
        baseDirection.y /= dirLength;
        baseDirection.z /= dirLength;

        // Use weapon DISTANCE if available, otherwise default to 100
        const maxDistance = weapon.DISTANCE || 100;
        
        // Check weapon type for spread and pellet count
        const isShotgun = this.currentWeapon === 'shotgun';
        const isPistol = this.currentWeapon === 'pistol';
        const isAssaultRifle = this.currentWeapon === 'assault_rifle';
        
        const pelletCount = isShotgun ? 8 : 1;
        const damagePerPellet = isShotgun ? weapon.DAMAGE / pelletCount : weapon.DAMAGE;
        
        // Track if any pellet hits
        let anyPelletHit = false;
        
        // Debug logging for weapon damage (throttled)
        if (Date.now() - (this._debugLastRaycastWeaponLog || 0) > 2000) {
            console.log(`[Raycast] Player ${this.id}: weapon="${this.currentWeapon}", damage=${weapon.DAMAGE}, maxDistance=${maxDistance}, otherPlayers=${otherPlayers.length}`);
            this._debugLastRaycastWeaponLog = Date.now();
        }
        
        // Spread angles: pistol has minimal spread (1-2 degrees), shotgun has 8 degrees
        // Assault rifle has dynamic spread based on sustained fire
        const ASSAULT_RIFLE_TIGHT_SHOTS = 5;
        const ASSAULT_RIFLE_MAX_SPREAD = 6 * Math.PI / 180;
        const ASSAULT_RIFLE_SPREAD_INCREASE_RATE = 0.5;
        
        let spreadAngle = 0;
        if (isShotgun) {
            spreadAngle = 8 * Math.PI / 180; // 8 degrees
        } else if (isPistol) {
            spreadAngle = (1 + Math.random()) * Math.PI / 180; // 1-2 degrees random
        } else if (isAssaultRifle) {
            // Calculate spread based on consecutive shots
            if (this.assaultRifleConsecutiveShots < ASSAULT_RIFLE_TIGHT_SHOTS) {
                // First few shots are tight (1 degree)
                spreadAngle = 1 * Math.PI / 180;
            } else {
                // Spread increases with each shot after tight shots
                const extraShots = this.assaultRifleConsecutiveShots - ASSAULT_RIFLE_TIGHT_SHOTS;
                const currentSpread = Math.min(
                    ASSAULT_RIFLE_MAX_SPREAD,
                    1 * Math.PI / 180 + (extraShots * ASSAULT_RIFLE_SPREAD_INCREASE_RATE * Math.PI / 180)
                );
                spreadAngle = currentSpread;
            }
        }
        
        const playerRadius = PLAYER.PLAYER_RADIUS + 0.35;
        const originX = this.position.x;
        const originY = this.position.y;
        const originZ = this.position.z;
        const stepSize = 0.1;

        // Fire each pellet
        for (let pelletIndex = 0; pelletIndex < pelletCount; pelletIndex++) {
            let direction = { x: baseDirection.x, y: baseDirection.y, z: baseDirection.z };
            
            // Apply spread for shotgun, pistol, and assault rifle pellets
            // For shotgun: first pellet (index 0) fires straight, others get spread
            // For pistol and assault rifle: all pellets get spread if spreadAngle > 0
            if ((isShotgun && pelletIndex > 0) || ((isPistol || isAssaultRifle) && spreadAngle > 0)) {
                // Generate spread pattern
                let angle, radius;
                if (isShotgun) {
                    angle = (pelletIndex / pelletCount) * Math.PI * 2;
                    radius = Math.random() * spreadAngle;
                } else if (isAssaultRifle) {
                    // Assault rifle: slight upward bias, then horizontal spread
                    const upwardBias = this.assaultRifleConsecutiveShots < ASSAULT_RIFLE_TIGHT_SHOTS ? 0.3 : 0.1;
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
                
                // Calculate perpendicular vectors for spread
                // Use right and up vectors relative to base direction
                const right = {
                    x: -baseDirection.z,
                    y: 0,
                    z: baseDirection.x
                };
                const rightLen = Math.sqrt(right.x * right.x + right.z * right.z) || 1;
                right.x /= rightLen;
                right.z /= rightLen;
                
                const up = {
                    x: baseDirection.y * right.z - baseDirection.z * right.y,
                    y: baseDirection.z * right.x - baseDirection.x * right.z,
                    z: baseDirection.x * right.y - baseDirection.y * right.x
                };
                const upLen = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z) || 1;
                up.x /= upLen;
                up.y /= upLen;
                up.z /= upLen;
                
                // Apply spread offset
                const spreadX = Math.cos(angle) * radius;
                const spreadY = Math.sin(angle) * radius;
                
                direction.x = baseDirection.x + right.x * spreadX + up.x * spreadY;
                direction.y = baseDirection.y + right.y * spreadX + up.y * spreadY;
                direction.z = baseDirection.z + right.z * spreadX + up.z * spreadY;
                
                // Normalize
                const newLen = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
                direction.x /= newLen;
                direction.y /= newLen;
                direction.z /= newLen;
            }

            // Ray march for this pellet
            let pelletHit = false;
            for (const player of otherPlayers) {
                if (player.health <= 0) continue;

                const playerHeight = player.isCrouched ? PLAYER.CROUCH_HEIGHT : PLAYER.PLAYER_HEIGHT;
                const topY = player.position.y;
                const bottomY = player.position.y - playerHeight;
                const radiusSq = playerRadius * playerRadius;
                
                // Calculate distance to player for range check
                const dxToPlayer = player.position.x - originX;
                const dyToPlayer = player.position.y - originY;
                const dzToPlayer = player.position.z - originZ;
                const distanceToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer + dzToPlayer * dzToPlayer);
                
                // Check if player is within weapon range before ray marching
                if (distanceToPlayer > maxDistance + playerRadius) {
                    // Player is too far away, skip this pellet
                    continue;
                }

                for (let t = 0; t <= maxDistance; t += stepSize) {
                    const px = originX + direction.x * t;
                    const py = originY + direction.y * t;
                    const pz = originZ + direction.z * t;
                    
                    // Check if we've gone past max distance
                    const traveledDistance = Math.sqrt((px - originX) * (px - originX) + (py - originY) * (py - originY) + (pz - originZ) * (pz - originZ));
                    if (traveledDistance > maxDistance) {
                        break; // Stop ray marching if we've exceeded max distance
                    }

                    if (py < bottomY - playerRadius || py > topY + playerRadius) {
                        continue;
                    }

                    const dx = px - player.position.x;
                    const dz = pz - player.position.z;
                    const distance2D = Math.sqrt(dx * dx + dz * dz);
                    if (dx * dx + dz * dz <= radiusSq) {
                        // Check for headshot (pistol only, 2x damage)
                        // Head is approximately at player.position.y (top of player)
                        // Body is at player.position.y - playerHeight/2 (center of body)
                        const headY = player.position.y;
                        const headRadius = 0.3; // Approximate head radius
                        const isHeadshot = isPistol && py >= headY - headRadius && py <= headY + headRadius;
                        const finalDamage = isHeadshot ? damagePerPellet * 2 : damagePerPellet;
                        
                        const wasFatal = player.takeDamage(finalDamage);
                        
                        const headshotText = isHeadshot ? ' [HEADSHOT]' : '';
                        console.log(`[Raycast Hit] Player ${this.id} -> ${player.id}: distance2D=${distance2D.toFixed(2)}, maxDistance=${maxDistance}, damage=${finalDamage}${headshotText}, weapon=${this.currentWeapon}, fatal=${wasFatal}`);

                        if (onPlayerHit) {
                            onPlayerHit({
                                attackerId: this.id,
                                targetId: player.id,
                                damage: finalDamage,
                                weaponType: this.currentWeapon,
                                wasFatal,
                                isHeadshot: isHeadshot || false
                            });
                        }
                        pelletHit = true;
                        anyPelletHit = true;
                        break; // Hit found for this pellet, move to next pellet
                    }
                }
                if (pelletHit) break; // Move to next pellet
            }
        }
        
        // Only log miss if NO pellets hit at all (for shotguns, some pellets might miss even if others hit)
        if (!anyPelletHit && Date.now() - (this._debugLastMissLog || 0) > 2000) {
            console.log(`[Raycast Miss] Player ${this.id} shot but no pellets hit. Weapon: ${this.currentWeapon}, maxDistance: ${maxDistance}, otherPlayers: ${otherPlayers.length}`);
            this._debugLastMissLog = Date.now();
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
// Server-side player entity - authoritative player state
// Note: In production, you'd copy constants or use a shared package
// For now, we'll duplicate the essential constants here or import from src
// Since Node.js can't directly import ES modules from client, we'll define them here
const PLAYER = {
    MOVE_SPEED: 5,
    SPRINT_SPEED: 10,
    JUMP_VELOCITY: 8,
    GRAVITY: -20,
    PLAYER_HEIGHT: 1.6,
    CROUCH_HEIGHT: 0.8,
    PLAYER_RADIUS: 0.4,
    CROUCH_SPEED_MULTIPLIER: 0.5,
    STAMINA_DEPLETION_RATE: 40,
    STAMINA_RECOVERY_RATE: 20,
    MOUSE_SENSITIVITY: 0.002,
    MAX_HEALTH: 100,
    MAX_STAMINA: 100
};

import { CollisionManager } from '../world/collision.js';

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
            mouseY: 0
        };
        
        // Weapon state
        this.currentWeapon = 'assault_rifle';
        this.weaponAmmo = {};
        this.isReloading = false;
    }

    updateInput(inputData) {
        // Update input from client
        this.input = {
            forward: inputData.keys?.w || false,
            backward: inputData.keys?.s || false,
            left: inputData.keys?.a || false,
            right: inputData.keys?.d || false,
            jump: inputData.keys?.space || false,
            sprint: inputData.keys?.shift || false,
            crouch: inputData.keys?.ctrl || false,
            mouseX: inputData.mouseX || 0,
            mouseY: inputData.mouseY || 0
        };
        
        // Update rotation from mouse input
        if (inputData.mouseX !== undefined) {
            this.rotation.yaw -= inputData.mouseX * PLAYER.MOUSE_SENSITIVITY;
        }
        if (inputData.mouseY !== undefined) {
            this.rotation.pitch -= inputData.mouseY * PLAYER.MOUSE_SENSITIVITY;
            this.rotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.pitch));
        }
    }

    update(deltaTime, otherPlayers = [], collisionManager = null) {
        // Use provided collision manager or instance one
        if (collisionManager) {
            this.collisionManager = collisionManager;
        }
        // Update crouch state
        this.isCrouched = this.input.crouch;
        
        // Calculate movement direction
        let moveX = 0;
        let moveZ = 0;
        
        if (this.input.forward) moveZ -= 1;
        if (this.input.backward) moveZ += 1;
        if (this.input.left) moveX -= 1;
        if (this.input.right) moveX += 1;
        
        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLength > 0) {
            moveX /= moveLength;
            moveZ /= moveLength;
        }
        
        // Apply rotation to movement
        const cosYaw = Math.cos(this.rotation.yaw);
        const sinYaw = Math.sin(this.rotation.yaw);
        const dirX = moveX * cosYaw - moveZ * sinYaw;
        const dirZ = moveX * sinYaw + moveZ * cosYaw;
        
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
        this.velocity.x = dirX * speed;
        this.velocity.z = dirZ * speed;
        
        // Jumping
        if (this.input.jump && this.canJump && !this.isCrouched && this.isGrounded) {
            this.velocity.y = PLAYER.JUMP_VELOCITY;
            this.canJump = false;
            this.isGrounded = false;
        }
        
        // Apply gravity
        this.velocity.y += PLAYER.GRAVITY * deltaTime;
        
        // Store old position for collision resolution
        const oldX = this.position.x;
        const oldZ = this.position.z;
        
        // Calculate new position
        const newX = this.position.x + this.velocity.x * deltaTime;
        const newZ = this.position.z + this.velocity.z * deltaTime;
        
        // Check collision with geometry and other players
        if (this.collisionManager) {
            const currentHeight = this.isCrouched ? PLAYER.CROUCH_HEIGHT : PLAYER.PLAYER_HEIGHT;
            
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
        
        this.position.y += this.velocity.y * deltaTime;
        
        // Ground collision
        const currentHeight = this.isCrouched ? PLAYER.CROUCH_HEIGHT : PLAYER.PLAYER_HEIGHT;
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

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
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
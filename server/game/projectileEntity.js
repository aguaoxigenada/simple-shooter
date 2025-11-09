// Server-side projectile entity
import { PROJECTILE } from '../shared/constants.js';

export class ProjectileEntity {
    constructor(id, position, velocity, damage, ownerId) {
        this.id = id;
        this.position = { ...position };
        this.velocity = { ...velocity };
        this.damage = damage;
        this.ownerId = ownerId;
        this.age = 0;
        this.lifetime = PROJECTILE.ROCKET_LIFETIME;
        this.isHit = false;
    }

    update(deltaTime) {
        if (this.isHit) return;
        
        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
        
        // Apply gravity
        this.velocity.y += PROJECTILE.GRAVITY * deltaTime;
        
        // Update age
        this.age += deltaTime;
    }

    isExpired() {
        return this.age >= this.lifetime || this.isHit;
    }

    hitsPlayer(player) {
        if (this.isHit || this.ownerId === player.id) return false;
        
        // Simple distance check (can be improved with proper collision)
        const dx = this.position.x - player.position.x;
        const dy = this.position.y - player.position.y;
        const dz = this.position.z - player.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return distance < 1.0; // Hit radius
    }

    markHit() {
        this.isHit = true;
    }

    serialize() {
        return {
            id: this.id,
            position: { ...this.position },
            velocity: { ...this.velocity }
        };
    }
}
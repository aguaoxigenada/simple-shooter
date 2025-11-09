// Server-side collision detection
// This must match client collision geometry

export class CollisionManager {
    constructor() {
        // Define collision boxes (walls and obstacles)
        // These should match the client environment
        this.collidableObjects = [];
        this.initCollisionGeometry();
    }

    initCollisionGeometry() {
        // Match the walls from client environment.js
        // createBox(x, y, z, width, height, depth)
        // Walls
        this.addBox(10, 1, 0, 20, 2, 1);   // East wall
        this.addBox(-10, 1, 0, 20, 2, 1);  // West wall
        this.addBox(0, 1, 10, 1, 2, 20);    // North wall
        this.addBox(0, 1, -10, 1, 2, 20);  // South wall
        
        // Cover boxes
        this.addBox(5, 1, 5, 2, 2, 2);
        this.addBox(-5, 1, -5, 2, 2, 2);
        this.addBox(8, 1, -7, 1.5, 2, 1.5);
        this.addBox(-8, 1, 7, 1.5, 2, 1.5);
    }

    addBox(x, y, z, width, height, depth) {
        // Box is centered at (x, y, z) with given dimensions
        const minX = x - width / 2;
        const maxX = x + width / 2;
        const minY = y - height / 2;
        const maxY = y + height / 2;
        const minZ = z - depth / 2;
        const maxZ = z + depth / 2;
        
        this.collidableObjects.push({
            minX, maxX, minY, maxY, minZ, maxZ
        });
    }

    checkCollision(x, y, z, radius, height) {
        // Check if a capsule (cylinder) collides with any geometry
        const minY = y;
        const maxY = y + height;
        const minX = x - radius;
        const maxX = x + radius;
        const minZ = z - radius;
        const maxZ = z + radius;
        
        for (const box of this.collidableObjects) {
            // AABB collision check
            if (minX < box.maxX && maxX > box.minX &&
                minY < box.maxY && maxY > box.minY &&
                minZ < box.maxZ && maxZ > box.minZ) {
                return true;
            }
        }
        
        return false;
    }

    checkPlayerCollision(playerX, playerZ, playerRadius, otherPlayers) {
        // Check collision with other players
        for (const otherPlayer of otherPlayers) {
            if (otherPlayer.position.x === undefined) continue;
            
            const dx = playerX - otherPlayer.position.x;
            const dz = playerZ - otherPlayer.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const minDistance = playerRadius * 2; // Two player radii
            
            if (distance < minDistance && distance > 0.001) {
                return true;
            }
        }
        return false;
    }

    resolveCollision(oldX, oldZ, newX, newZ, radius, height) {
        // Try to slide along walls
        const baseY = height / 2;
        let resolvedX = oldX;
        let resolvedZ = oldZ;

        if (!this.checkCollision(newX, baseY, oldZ, radius, height)) {
            resolvedX = newX;
        }

        if (!this.checkCollision(resolvedX, baseY, newZ, radius, height)) {
            resolvedZ = newZ;
        }

        return { x: resolvedX, z: resolvedZ };
    }
}
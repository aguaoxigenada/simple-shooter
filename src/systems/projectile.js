import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { targets } from '../entities/targets.js';
import { collidableObjects } from '../world/environment.js';

// Active projectiles
export const projectiles = [];

const rocketGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
const rocketMaterial = new THREE.MeshStandardMaterial({ color: 0xFF6600 });

// Rocket trail
function createRocketTrail() {
    const trailGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    const trailMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFAA00,
        transparent: true,
        opacity: 0.6
    });
    return new THREE.Mesh(trailGeometry, trailMaterial);
}

export function createRocket(position, direction) {
    const rocket = new THREE.Mesh(rocketGeometry, rocketMaterial);
    rocket.position.copy(position);
    rocket.rotation.z = Math.PI / 2; // Orient rocket forward
    
    // Create trail
    const trail = createRocketTrail();
    rocket.userData.trail = trail;
    rocket.add(trail);
    
    scene.add(rocket);
    
    const speed = 20; // Rocket speed
    const velocity = direction.normalize().multiplyScalar(speed);
    
    rocket.userData.velocity = velocity;
    rocket.userData.lifetime = 5; // Max lifetime in seconds
    rocket.userData.age = 0;
    
    projectiles.push(rocket);
    return rocket;
}

function checkRocketCollision(rocket) {
    const rocketBox = new THREE.Box3().setFromObject(rocket);
    
    // Check collision with targets
    for (const target of targets) {
        const targetBox = new THREE.Box3().setFromObject(target);
        if (rocketBox.intersectsBox(targetBox)) {
            return { hit: true, target };
        }
    }
    
    // Check collision with collidable objects (walls, boxes)
    for (const obj of collidableObjects) {
        const objBox = new THREE.Box3().setFromObject(obj);
        if (rocketBox.intersectsBox(objBox)) {
            return { hit: true, target: null };
        }
    }
    
    // Check collision with ground
    if (rocket.position.y < 0.5) {
        return { hit: true, target: null };
    }
    
    return { hit: false };
}

function createExplosion(position) {
    // Visual explosion effect
    const explosionGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFF4500,
        transparent: true,
        opacity: 0.8
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);
    
    // Remove explosion after animation
    let scale = 0.3;
    let opacity = 0.8;
    const expandExplosion = () => {
        scale += 0.1;
        opacity -= 0.05;
        if (opacity > 0) {
            explosion.scale.set(scale / 0.3, scale / 0.3, scale / 0.3);
            explosionMaterial.opacity = opacity;
            requestAnimationFrame(expandExplosion);
        } else {
            scene.remove(explosion);
        }
    };
    expandExplosion();
    
    // Area damage
    const explosionRadius = 3;
    for (const target of targets) {
        const distance = target.position.distanceTo(position);
        if (distance <= explosionRadius) {
            // Damage decreases with distance
            const damageMultiplier = 1 - (distance / explosionRadius) * 0.5;
            const damage = Math.floor(100 * damageMultiplier);
            target.userData.health -= damage;
            
            if (target.userData.health <= 0) {
                scene.remove(target);
                const index = targets.indexOf(target);
                if (index > -1) targets.splice(index, 1);
                gameState.kills++;
            }
        }
    }
}

export function updateProjectiles(deltaTime) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const rocket = projectiles[i];
        rocket.userData.age += deltaTime;
        
        // Remove old rockets
        if (rocket.userData.age > rocket.userData.lifetime) {
            scene.remove(rocket);
            projectiles.splice(i, 1);
            continue;
        }
        
        // Update position
        const velocity = rocket.userData.velocity;
        rocket.position.add(velocity.clone().multiplyScalar(deltaTime));
        
        // Apply gravity to rockets
        velocity.y -= 9.8 * deltaTime; // Gravity
        
        // Update trail position
        if (rocket.userData.trail) {
            rocket.userData.trail.position.set(0, -0.15, 0);
        }
        
        // Check collision
        const collision = checkRocketCollision(rocket);
        if (collision.hit) {
            // Create explosion
            createExplosion(rocket.position);
            
            // Remove rocket
            scene.remove(rocket);
            projectiles.splice(i, 1);
        }
    }
}

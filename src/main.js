import * as THREE from 'three';
import { scene, camera, renderer } from './core/scene.js';
import { initEnvironment } from './world/environment.js';
import { initTargets } from './entities/targets.js';
import { initPlayerControls, updatePlayer } from './entities/player.js';
import { initWeapon, updateWeapon } from './systems/weapon.js';
import { updateProjectiles } from './systems/projectile.js';
import { updateUI } from './systems/ui.js';

// Initialize game
initEnvironment();
initTargets();
initPlayerControls(renderer);
initWeapon(renderer);

// Animation loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Update player
    updatePlayer(deltaTime);
    
    // Update weapon
    updateWeapon(deltaTime);
    
    // Update projectiles (rockets)
    updateProjectiles(deltaTime);
    
    // Update UI
    updateUI();
    
    // Render
    renderer.render(scene, camera);
}

animate();

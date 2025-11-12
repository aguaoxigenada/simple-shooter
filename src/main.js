import * as THREE from 'three';
import { scene, camera, renderer } from './core/scene.js';
import { SCENES, registerScene, switchScene, updateScene, renderScene } from './core/sceneManager.js';
import * as mainMenuScene from './scenes/mainMenu.js';
import * as gameScene from './scenes/game.js';
import * as playgroundScene from './scenes/playground.js';
import * as lobbyScene from './scenes/lobby.js';
import * as gameOverScene from './scenes/gameOver.js';
import * as victoryScene from './scenes/victory.js';
import * as weaponSelectionScene from './scenes/weaponSelection.js';

// Register all scenes
registerScene(SCENES.MAIN_MENU, mainMenuScene);
registerScene(SCENES.GAME, gameScene);
registerScene(SCENES.PLAYGROUND, playgroundScene);
registerScene(SCENES.LOBBY, lobbyScene);
registerScene(SCENES.GAME_OVER, gameOverScene);
registerScene(SCENES.VICTORY, victoryScene);
registerScene(SCENES.WEAPON_SELECTION, weaponSelectionScene);

// Start with main menu
switchScene(SCENES.MAIN_MENU);

// Animation loop
const clock = new THREE.Clock();

// Performance settings
const TARGET_FPS = 60;
const MAX_DELTA_TIME = 0.1; // Cap at 100ms to prevent physics explosions
const MIN_DELTA_TIME = 1 / 120; // Cap at 120 FPS max (prevents running too fast)

let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;
let lastFpsUpdate = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const rawDeltaTime = clock.getDelta();
    
    // Clamp deltaTime to prevent physics issues
    const deltaTime = Math.max(MIN_DELTA_TIME, Math.min(rawDeltaTime, MAX_DELTA_TIME));
    
    // Optional: FPS limiting (uncomment if needed for consistent frame timing)
    // const targetFrameTime = 1000 / TARGET_FPS;
    // const elapsed = now - lastFrameTime;
    // if (elapsed < targetFrameTime) {
    //     return; // Skip frame to maintain target FPS
    // }
    // lastFrameTime = now;
    
    // FPS calculation (for debugging - uncomment to see FPS in console)
    frameCount++;
    if (now - lastFpsUpdate >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        // Uncomment to see FPS in console:
        // console.log(`FPS: ${fps}`);
    }
    
    // Update current scene
    updateScene(deltaTime);
    
    // Render current scene
    renderScene(renderer, camera, scene);
}

animate();

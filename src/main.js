import * as THREE from 'three';
import { scene, camera, renderer } from './core/scene.js';
import { SCENES, registerScene, switchScene, updateScene, renderScene } from './core/sceneManager.js';
import * as mainMenuScene from './scenes/mainMenu.js';
import * as gameScene from './scenes/game.js';
import * as gameOverScene from './scenes/gameOver.js';
import * as victoryScene from './scenes/victory.js';

// Register all scenes
registerScene(SCENES.MAIN_MENU, mainMenuScene);
registerScene(SCENES.GAME, gameScene);
registerScene(SCENES.GAME_OVER, gameOverScene);
registerScene(SCENES.VICTORY, victoryScene);

// Start with main menu
switchScene(SCENES.MAIN_MENU);

// Animation loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Update current scene
    updateScene(deltaTime);
    
    // Render current scene
    renderScene(renderer, camera, scene);
}

animate();

import * as THREE from 'three';
import { SCENES, switchScene } from '../core/sceneManager.js';
import { scene, camera, renderer } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { initEnvironment } from '../world/environment.js';
import { initTargets, targets } from '../entities/targets.js';
import { initPlayerControls, updatePlayer } from '../entities/player.js';
import { initWeapon, updateWeapon } from '../systems/weapon.js';
import { updateProjectiles } from '../systems/projectile.js';
import { updateUI } from '../systems/ui.js';
import { initWeaponViewModel, updateWeaponViewModel, triggerMuzzleFlash, cleanupWeaponViewModel } from '../entities/weaponViewModel.js';
import { networkClient } from '../network/client.js';
import { playerManager } from '../network/playerManager.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

let isInitialized = false;
let victoryTriggered = false;

function setupNetworkCallbacks() {
    // Game state updates from server
    networkClient.onGameStateUpdate = (serverGameState) => {
        // Update all players from server state
        if (serverGameState.players) {
            for (const [playerId, playerState] of Object.entries(serverGameState.players)) {
                const isLocal = playerId === playerManager.localPlayerId;
                
                // Update or create player entity
                let player = playerManager.players.get(playerId);
                if (!player) {
                    player = playerManager.addPlayer(playerId, isLocal);
                }
                
                playerManager.updatePlayerFromServer(playerId, playerState);
                
                // If this is the local player, sync camera position
                if (isLocal) {
                    const pos = playerState.position;
                    camera.position.set(pos.x, pos.y, pos.z);
                }
            }
            
            // Remove players that are no longer in the game
            const serverPlayerIds = new Set(Object.keys(serverGameState.players));
            for (const [playerId] of playerManager.players.entries()) {
                if (!serverPlayerIds.has(playerId) && playerId !== playerManager.localPlayerId) {
                    playerManager.removePlayer(playerId);
                }
            }
        }
    };
    
    // Player joined
    networkClient.onPlayerJoined = (data) => {
        console.log('Player joined:', data.playerId);
        playerManager.addPlayer(data.playerId, false);
    };
    
    // Player spawned (local player)
    networkClient.onPlayerSpawned = (data) => {
        console.log('Local player spawned:', data.playerId);
        playerManager.setLocalPlayerId(data.playerId);
        playerManager.addPlayer(data.playerId, true);
    };
    
    // Player left
    networkClient.onPlayerLeft = (data) => {
        console.log('Player left:', data.playerId);
        playerManager.removePlayer(data.playerId);
    };
    
    // Connection status change
    networkClient.onConnectionChange = (isConnected) => {
        if (isConnected) {
            console.log('Connected to multiplayer server');
        } else {
            console.log('Disconnected from multiplayer server');
        }
    };
}

export function init() {
    console.log('Game scene init called');
    
    // Reset game state
    gameState.health = 100;
    gameState.kills = 0;
    gameState.isMouseLocked = false;
    gameState.stamina = 100;
    gameState.currentWeapon = null;
    victoryTriggered = false;
    
    // Clear scene (but keep background and fog settings)
    // Remove all objects but preserve scene properties
    const objectsToRemove = [];
    scene.traverse((object) => {
        if (object !== scene) {
            objectsToRemove.push(object);
        }
    });
    objectsToRemove.forEach(object => scene.remove(object));
    
    // Reinitialize scene (lights, fog, etc.)
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 500);
    
    // Re-add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Reset camera position
    camera.position.set(3, 1.6, 3);
    
    // Initialize game systems (environment creates the ground)
    initEnvironment();
    initTargets();
    initPlayerControls(renderer);
    initWeapon(renderer); // This sets gameState.currentWeapon
    initWeaponViewModel(); // This needs currentWeapon to be set
    
    // Setup network callbacks
    setupNetworkCallbacks();
    
    // Connect to multiplayer server (optional - can be disabled for single player)
    // Uncomment to enable multiplayer:
    // networkClient.connect('Player');
    
    isInitialized = true;
    
    // Hide all other scene UIs
    const menuContainer = document.getElementById('menu-container');
    if (menuContainer) {
        menuContainer.style.display = 'none';
    }
    
    const gameOverContainer = document.getElementById('gameover-container');
    if (gameOverContainer) {
        gameOverContainer.style.display = 'none';
    }
    
    const victoryContainer = document.getElementById('victory-container');
    if (victoryContainer) {
        victoryContainer.style.display = 'none';
    }
    
    // Show game UI (crosshair, HUD, etc.)
    const gameUI = document.getElementById('ui');
    if (gameUI) {
        gameUI.style.display = 'block';
    }
}

export function update(deltaTime) {
    if (!isInitialized) return;
    
    // Update player
    updatePlayer(deltaTime);
    
    // Update weapon (returns true if shot was fired)
    const shotFired = updateWeapon(deltaTime);
    
    // Trigger muzzle flash if shot was fired
    if (shotFired) {
        triggerMuzzleFlash();
    }
    
    // Update weapon viewmodel
    updateWeaponViewModel(deltaTime, shotFired);
    
    // Update projectiles (rockets)
    updateProjectiles(deltaTime);
    
    // Update network players
    playerManager.updateAll(deltaTime);
    
    // Update UI
    updateUI();
    
    // Check for game over (health = 0)
    if (gameState.health <= 0) {
        switchScene(SCENES.GAME_OVER);
        return;
    }
    
    // Check for victory (all targets destroyed)
    // Only check if we've started with targets (prevent immediate victory on init)
    if (targets.length === 0 && isInitialized && gameState.kills > 0 && !victoryTriggered) {
        victoryTriggered = true;
        // Switch to victory scene immediately (no delay needed since UI update happens after this)
        switchScene(SCENES.VICTORY);
        return;
    }
}

export function render(rendererInstance, cameraInstance, sceneInstance) {
    if (!isInitialized) return;
    
    rendererInstance.render(sceneInstance, cameraInstance);
}

export function cleanup() {
    isInitialized = false;
    
    // Disconnect from server
    networkClient.disconnect();
    
    // Cleanup weapon viewmodel
    cleanupWeaponViewModel();
    
    // Hide game UI
    const gameUI = document.getElementById('ui');
    if (gameUI) {
        gameUI.style.display = 'none';
    }
    
    // Unlock pointer if locked
    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }
}
import * as THREE from 'three';
import { SCENES, switchScene } from '../core/sceneManager.js';
import { scene, camera, renderer } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { initEnvironment } from '../world/environment.js';
import { initTargets, targets, removeTargetById } from '../entities/targets.js';
import { initPlayerControls, updatePlayer } from '../entities/player.js';
import { initWeapon, updateWeapon } from '../systems/weapon.js';
import { updateProjectiles, cleanupProjectiles } from '../systems/projectile.js';
import { updateUI } from '../systems/ui.js';
import { initWeaponViewModel, updateWeaponViewModel, triggerMuzzleFlash, cleanupWeaponViewModel } from '../entities/weaponViewModel.js';
import { networkClient } from '../network/client.js';
import { playerManager } from '../network/playerManager.js';
import { MESSAGE_TYPES, PLAYER } from '../shared/constants.js';

let isInitialized = false;
let victoryTriggered = false;
let ambientLight = null;
let directionalLight = null;

function setupNetworkCallbacks() {
    // Error handling
    networkClient.onError = (message, error) => {
        console.error(`Network error: ${message}`, error);
        // Could show UI notification here
    };
    
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
        const player = playerManager.addPlayer(data.playerId, true);
        
        // Initialize player position from spawn data
        if (data.position) {
            player.setPosition(data.position.x, data.position.y, data.position.z);
        }
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

    networkClient.onTargetState = (data) => {
        if (!data || !Array.isArray(data.destroyedTargets)) {
            return;
        }

        for (const targetId of data.destroyedTargets) {
            removeTargetById(targetId, { awardKill: false });
        }
    };

    networkClient.onTargetDestroyed = (data) => {
        if (!data || typeof data.targetId !== 'string') {
            return;
        }

        removeTargetById(data.targetId, { awardKill: false });
    };

    networkClient.onMatchResult = (data) => {
        if (!data || typeof data !== 'object') {
            return;
        }

        gameState.matchResult = data;
        gameState.matchKillerId = data.killerId || null;

        const localId = playerManager.localPlayerId;
        if (!localId) {
            return;
        }

        if (data.winnerId === localId) {
            gameState.matchOutcome = 'victory';
            gameState.matchOpponentId = data.loserId || null;
            switchScene(SCENES.VICTORY);
        } else if (data.loserId === localId) {
            gameState.matchOutcome = 'defeat';
            gameState.matchOpponentId = data.winnerId || null;
            switchScene(SCENES.GAME_OVER);
        } else {
            gameState.matchOutcome = null;
            gameState.matchOpponentId = null;
        }
    };

    networkClient.onPlayerHit = (data) => {
        if (!data || typeof data !== 'object') {
            return;
        }

        const { targetId, remainingHealth } = data;
        if (!targetId || typeof remainingHealth !== 'number') {
            return;
        }

        const player = playerManager.players.get(targetId);
        if (player) {
            player.health = remainingHealth;
            if (player.isLocalPlayer) {
                gameState.health = Math.max(0, remainingHealth);
            }
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
    gameState.matchOutcome = null;
    gameState.matchResult = null;
    gameState.matchOpponentId = null;
    gameState.matchKillerId = null;
    playerManager.players.clear();
    playerManager.renderers.forEach(renderer => renderer.dispose());
    playerManager.renderers.clear();
    playerManager.localPlayerId = null;
    victoryTriggered = false;
    
    // Clear scene (but keep background and fog settings)
    // Remove all objects but preserve scene properties and lights
    const objectsToRemove = [];
    scene.traverse((object) => {
        if (object !== scene && object !== ambientLight && object !== directionalLight) {
            objectsToRemove.push(object);
        }
    });
    objectsToRemove.forEach(object => scene.remove(object));
    
    // Reinitialize scene (lights, fog, etc.)
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 500);
    
    // Ensure lighting exists (reuse if exists, otherwise create new)
    if (!ambientLight) {
        ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
    } else if (!scene.children.includes(ambientLight)) {
        scene.add(ambientLight);
    }
    
    if (!directionalLight) {
        directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        directionalLight.shadow.mapSize.width = 1024; // Reduced from 2048 for better performance
        directionalLight.shadow.mapSize.height = 1024; // Reduced from 2048 for better performance
        directionalLight.shadow.bias = -0.0001; // Reduce shadow acne
        scene.add(directionalLight);
    } else if (!scene.children.includes(directionalLight)) {
        scene.add(directionalLight);
    }
    
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
    networkClient.connect('Player');
    
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
    
    // Update player (handles input and client-side prediction)
    updatePlayer(deltaTime);
    
    // Update network players (this handles interpolation)
    playerManager.updateAll(deltaTime);
    
    // Camera position is fully handled in updatePlayer() for both single and multiplayer
    // No need to override it here - doing so would cause conflicts with client-side prediction
    
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
    victoryTriggered = false;
    
    // Disconnect from server
    networkClient.disconnect();
    
    // Cleanup network players
    const allPlayerIds = Array.from(playerManager.players.keys());
    for (const playerId of allPlayerIds) {
        playerManager.removePlayer(playerId);
    }

    networkClient.onGameStateUpdate = null;
    networkClient.onPlayerJoined = null;
    networkClient.onPlayerLeft = null;
    networkClient.onPlayerSpawned = null;
    networkClient.onTargetDestroyed = null;
    networkClient.onTargetState = null;
    networkClient.onMatchResult = null;
    networkClient.onPlayerHit = null;
    
    // Cleanup weapon viewmodel
    cleanupWeaponViewModel();
    
    // Cleanup projectiles
    cleanupProjectiles();
    
    // Cleanup targets (if any remain)
    // Note: Targets are managed in targets.js, but they're already removed when destroyed
    
    // Remove event listeners from renderer
    // Note: We should store references to listeners to remove them properly
    
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
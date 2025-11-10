import { scene, camera } from '../core/scene.js';
import * as THREE from 'three';
import { gameState } from '../core/gameState.js';
import { networkClient } from '../network/client.js';
import { playerManager } from '../network/playerManager.js';
import { SCENES, switchScene } from '../core/sceneManager.js';
import { resetSpawnTracking } from '../entities/player.js';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const COUNTDOWN_SECONDS = 20;
const NEXT_SCENE = SCENES.PLAYGROUND;

let isInitialized = false;
let lobbyContainer = null;
let readyButton = null;
let playerList = null;
let statusLabel = null;
let countdownLabel = null;
let infoLabel = null;

let readyStates = new Map();
let localReady = false;
let countdownEndTime = null;
let matchStarting = false;

let lobbyGroup = null;

function cleanupUI() {
    if (readyButton) {
        readyButton.removeEventListener('click', onReadyClicked);
        readyButton = null;
    }
    if (lobbyContainer) {
        document.body.removeChild(lobbyContainer);
        lobbyContainer = null;
        statusLabel = null;
        playerList = null;
        countdownLabel = null;
        infoLabel = null;
    }
}

function disposeLobbyEnvironment() {
    if (lobbyGroup) {
        scene.remove(lobbyGroup);
        lobbyGroup.traverse((object) => {
            if (object.isMesh) {
                object.geometry?.dispose?.();
                object.material?.dispose?.();
            }
        });
        lobbyGroup = null;
    }
}

function onReadyClicked() {
    localReady = !localReady;
    const localId = playerManager.localPlayerId;
    if (localId) {
        readyStates.set(localId, localReady);
        networkClient.sendReadyState(localReady);
    }
    updateReadyButton();
    refreshPlayerList();
    recalcStartConditions();
    // TODO: Send ready state to server once backend supports it
}

function updateReadyButton() {
    if (!readyButton) return;
    readyButton.textContent = localReady ? 'Cancel Ready' : 'Ready';
    readyButton.style.backgroundColor = localReady ? '#2ecc71' : '';
}

function refreshPlayerList() {
    if (!playerList || !statusLabel) return;

    const players = playerManager.getAllPlayers();

    // Ensure readyStates contains all current players
    const presentIds = new Set();
    players.forEach((player) => {
        presentIds.add(player.id);
        if (!readyStates.has(player.id)) {
            readyStates.set(player.id, false);
        }
    });
    // Remove stale entries
    for (const id of Array.from(readyStates.keys())) {
        if (!presentIds.has(id)) {
            readyStates.delete(id);
        }
    }

    playerList.innerHTML = '';
    const spawnPoints = [
        'Plat 1',
        'Plat 2',
        'Podium 1',
        'Podium 2',
        'North Stand',
        'South Stand'
    ];

    players.forEach((player, index) => {
        const entry = document.createElement('div');
        const shortId = player.id.slice(0, 8);
        const ready = readyStates.get(player.id);
        const positionLabel = spawnPoints[index % spawnPoints.length];
        entry.textContent = `${shortId}${player.isLocalPlayer ? ' (You)' : ''} ? ${ready ? 'Ready' : 'Not Ready'} ? ${positionLabel}`;
        entry.style.color = ready ? '#2ecc71' : '#e74c3c';
        entry.style.marginBottom = '4px';
        playerList.appendChild(entry);
    });

    const readyCount = players.filter((p) => readyStates.get(p.id)).length;
    statusLabel.textContent = `Players Ready: ${readyCount}/${players.length} (min ${MIN_PLAYERS})`;

    if (infoLabel) {
        if (players.length < MIN_PLAYERS) {
            const needed = MIN_PLAYERS - players.length;
            infoLabel.textContent = `Waiting for ${needed} more player${needed === 1 ? '' : 's'} to start the countdown.`;
        } else {
            infoLabel.textContent = 'Countdown will start automatically. Ready up to skip the wait.';
        }
    }
}

function recalcStartConditions() {
    const players = playerManager.getAllPlayers();
    const playerCount = players.length;
    const readyCount = players.filter((p) => readyStates.get(p.id)).length;
    const allReady = playerCount > 0 && readyCount === playerCount;

    if (allReady && playerCount >= MIN_PLAYERS) {
        beginMatch();
        return;
    }

    if (playerCount >= MIN_PLAYERS && !countdownEndTime) {
        startCountdown(COUNTDOWN_SECONDS);
    } else if (playerCount < MIN_PLAYERS) {
        stopCountdown();
    }
}

function startCountdown(seconds) {
    countdownEndTime = performance.now() + seconds * 1000;
}

function stopCountdown() {
    countdownEndTime = null;
    if (countdownLabel) {
        countdownLabel.textContent = '';
    }
}

function beginMatch() {
    if (matchStarting) return;
    matchStarting = true;
    stopCountdown();
    if (countdownLabel) {
        countdownLabel.textContent = 'Match starting!';
    }
    setTimeout(() => {
        switchScene(NEXT_SCENE);
    }, 1000);
}

function updateCountdownDisplay() {
    if (!countdownLabel) return;

    if (countdownEndTime) {
        const remainingMs = countdownEndTime - performance.now();
        if (remainingMs <= 0) {
            countdownLabel.textContent = 'Match starting!';
            beginMatch();
        } else {
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            countdownLabel.textContent = `Match begins in ${remainingSeconds}s`;
        }
    } else {
        countdownLabel.textContent = '';
    }
}

function setupLobbyEnvironment() {
    disposeLobbyEnvironment();
    lobbyGroup = new THREE.Group();

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0x1e1e2f })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    lobbyGroup.add(floor);

    const podiumGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 32);
    const podiumMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, emissive: 0x111144, emissiveIntensity: 0.2 });
    const podium = new THREE.Mesh(podiumGeometry, podiumMaterial);
    podium.position.set(0, 0.25, 0);
    podium.castShadow = true;
    lobbyGroup.add(podium);

    const light = new THREE.PointLight(0x66aaff, 1, 25);
    light.position.set(0, 5, 0);
    lobbyGroup.add(light);

    scene.add(lobbyGroup);
}

function setupNetworkCallbacks() {
    networkClient.onError = (message, error) => {
        console.error(`Network error: ${message}`, error);
    };

    networkClient.onGameStateUpdate = (serverGameState) => {
        if (serverGameState.players) {
            for (const [playerId, playerState] of Object.entries(serverGameState.players)) {
                const isLocal = playerId === playerManager.localPlayerId;
                let player = playerManager.players.get(playerId);
                if (!player) {
                    player = playerManager.addPlayer(playerId, isLocal);
                }
                playerManager.updatePlayerFromServer(playerId, playerState);
            }

            const serverIds = new Set(Object.keys(serverGameState.players));
            for (const [playerId] of playerManager.players.entries()) {
                if (!serverIds.has(playerId) && playerId !== playerManager.localPlayerId) {
                    playerManager.removePlayer(playerId);
                }
            }
        }
        refreshPlayerList();
        recalcStartConditions();
    };

    networkClient.onPlayerJoined = (data) => {
        console.log('Player joined:', data.playerId);
        playerManager.addPlayer(data.playerId, false);
        refreshPlayerList();
        recalcStartConditions();
    };

    networkClient.onPlayerSpawned = (data) => {
        console.log('Local player spawned:', data.playerId);
        playerManager.setLocalPlayerId(data.playerId);
        const player = playerManager.addPlayer(data.playerId, true);
        if (data.position) {
            player.setPosition(data.position.x, data.position.y, data.position.z);
            gameState.applySpawn(
                { x: data.position.x, y: data.position.y, z: data.position.z },
                data.rotation?.yaw || 0
            );
        }
        readyStates.set(data.playerId, localReady);
        refreshPlayerList();
        recalcStartConditions();
    };

    networkClient.onPlayerLeft = (data) => {
        console.log('Player left:', data.playerId);
        playerManager.removePlayer(data.playerId);
        readyStates.delete(data.playerId);
        refreshPlayerList();
        recalcStartConditions();
    };

    networkClient.onConnectionChange = (isConnected) => {
        console.log(`[Lobby] Connection change: ${isConnected ? 'connected' : 'disconnected'}`);
        if (!isConnected) {
            stopCountdown();
        }
    };

    networkClient.onPlayerReadyUpdate = (data) => {
        if (!data || typeof data !== 'object') return;
        const { playerId, isReady } = data;
        if (!playerId) return;
        readyStates.set(playerId, !!isReady);
        if (playerId === playerManager.localPlayerId) {
            localReady = !!isReady;
            updateReadyButton();
        }
        refreshPlayerList();
        recalcStartConditions();
    };

    // Ignore other callbacks (match result, target updates, etc.) for lobby
    networkClient.onTargetState = null;
    networkClient.onTargetDestroyed = null;
    networkClient.onMatchResult = null;
    networkClient.onPlayerHit = null;
}

export function init() {
    if (isInitialized) return;
    console.log('Lobby scene init');

    gameState.reset();
    resetSpawnTracking();
    localReady = false;
    readyStates.clear();
    countdownEndTime = null;
    matchStarting = false;

    setupLobbyEnvironment();

    // Reset camera for lobby
    camera.position.set(0, 6, 14);
    camera.lookAt(0, 0, 0);

    lobbyContainer = document.createElement('div');
    lobbyContainer.id = 'lobby-container';
    lobbyContainer.style.position = 'fixed';
    lobbyContainer.style.top = '0';
    lobbyContainer.style.left = '0';
    lobbyContainer.style.width = '100%';
    lobbyContainer.style.height = '100%';
    lobbyContainer.style.display = 'flex';
    lobbyContainer.style.flexDirection = 'column';
    lobbyContainer.style.alignItems = 'center';
    lobbyContainer.style.justifyContent = 'center';
    lobbyContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    lobbyContainer.style.color = '#fff';
    lobbyContainer.style.fontFamily = 'monospace';
    lobbyContainer.style.zIndex = '1000';
    lobbyContainer.style.padding = '20px';

    const title = document.createElement('h1');
    title.textContent = 'MATCH LOBBY';
    title.style.marginBottom = '10px';
    lobbyContainer.appendChild(title);

    statusLabel = document.createElement('div');
    statusLabel.textContent = 'Gathering players...';
    statusLabel.style.marginBottom = '5px';
    lobbyContainer.appendChild(statusLabel);

    countdownLabel = document.createElement('div');
    countdownLabel.style.marginBottom = '10px';
    countdownLabel.style.fontSize = '18px';
    countdownLabel.style.color = '#f1c40f';
    lobbyContainer.appendChild(countdownLabel);

    infoLabel = document.createElement('div');
    infoLabel.style.marginBottom = '20px';
    infoLabel.style.fontSize = '14px';
    infoLabel.style.color = '#cccccc';
    lobbyContainer.appendChild(infoLabel);

    playerList = document.createElement('div');
    playerList.style.marginBottom = '20px';
    playerList.style.minWidth = '260px';
    playerList.style.textAlign = 'left';
    lobbyContainer.appendChild(playerList);

    readyButton = document.createElement('button');
    readyButton.textContent = 'Ready';
    readyButton.style.padding = '12px 24px';
    readyButton.style.fontSize = '16px';
    readyButton.style.cursor = 'pointer';
    readyButton.style.border = 'none';
    readyButton.style.borderRadius = '6px';
    readyButton.style.backgroundColor = '#3498db';
    readyButton.style.color = '#fff';
    readyButton.style.transition = 'background-color 0.2s ease, transform 0.2s ease';
    readyButton.addEventListener('mouseenter', () => {
        readyButton.style.transform = 'scale(1.05)';
    });
    readyButton.addEventListener('mouseleave', () => {
        readyButton.style.transform = 'scale(1)';
    });
    readyButton.addEventListener('click', onReadyClicked);
    lobbyContainer.appendChild(readyButton);

    document.body.appendChild(lobbyContainer);

    setupNetworkCallbacks();
    playerManager.onPlayersUpdated = () => {
        refreshPlayerList();
        recalcStartConditions();
    };

    networkClient.connect('Player');

    updateReadyButton();
    refreshPlayerList();
    recalcStartConditions();

    isInitialized = true;
}

export function update(deltaTime) {
    if (!isInitialized) return;
    updateCountdownDisplay();
}

export function render() {
    // Lobby is primarily UI. Render handled by main loop if needed.
}

export function cleanup() {
    cleanupUI();
    disposeLobbyEnvironment();
    playerManager.onPlayersUpdated = null;
    countdownEndTime = null;
    matchStarting = false;

    readyStates.clear();
    localReady = false;
    isInitialized = false;
}

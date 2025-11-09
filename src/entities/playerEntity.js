// Client-side player entity representation
// This is what gets rendered on screen, synced with server state
import * as THREE from 'three';
import { PLAYER } from '../shared/constants.js';

export class ClientPlayerEntity {
    constructor(playerId, isLocalPlayer = false) {
        this.id = playerId;
        this.isLocalPlayer = isLocalPlayer;
        
        // Current state (from server)
        this.position = new THREE.Vector3();
        this.rotation = { yaw: 0, pitch: 0 };
        this.health = PLAYER.MAX_HEALTH;
        this.stamina = PLAYER.MAX_STAMINA;
        this.isCrouched = false;
        this.currentWeapon = 'assault_rifle';
        
        // Interpolation state
        this.targetPosition = new THREE.Vector3();
        this.previousPosition = new THREE.Vector3();
        this.updateTime = 0;
        this.lastUpdateTime = 0;
        
        // Visual representation (3D model - will be added later)
        this.mesh = null;
        
        // Client-side prediction (only for local player)
        this.predictedPosition = new THREE.Vector3();
        this.serverPosition = new THREE.Vector3();
        this.usePrediction = isLocalPlayer;
    }

    updateFromServer(serverState, currentTime) {
        // Store previous state for interpolation
        this.previousPosition.copy(this.position);
        this.lastUpdateTime = this.updateTime;
        
        // Update target state from server
        if (serverState.position) {
            this.targetPosition.set(
                serverState.position.x,
                serverState.position.y,
                serverState.position.z
            );
            
            // For local player, update predicted position for client-side prediction
            if (this.usePrediction) {
                // Store server position as correction
                // Only update if we have a valid position (not first frame)
                if (this.serverPosition.lengthSq() === 0 || 
                    this.targetPosition.distanceTo(this.serverPosition) > 0.01) {
                    // Only update server position if it actually changed (avoid micro-updates)
                    this.serverPosition = this.targetPosition.clone();
                }
                
                // Only snap for very large desyncs (anti-cheat/desync correction)
                // The client will smoothly correct smaller differences
                const positionDiff = this.predictedPosition.distanceTo(this.serverPosition);
                if (positionDiff > 3.0) { // If more than 3 units difference, snap (increased threshold)
                    // Large desync detected - snap to server position
                    this.predictedPosition.copy(this.serverPosition);
                    this.position.copy(this.serverPosition);
                }
            } else {
                // For remote players, just update target for interpolation
                if (this.position.lengthSq() === 0 || this.updateTime === 0) {
                    this.position.copy(this.targetPosition);
                }
            }
        }
        
        if (serverState.rotation) {
            // Only update rotation if we're not the local player
            if (!this.isLocalPlayer) {
                this.rotation.yaw = serverState.rotation.yaw;
                this.rotation.pitch = serverState.rotation.pitch;
            }
        }
        
        if (typeof serverState.health === 'number') {
            this.health = serverState.health;
        }
        if (typeof serverState.stamina === 'number') {
            this.stamina = serverState.stamina;
        }
        this.isCrouched = !!serverState.isCrouched;
        if (serverState.currentWeapon) {
            this.currentWeapon = serverState.currentWeapon;
        }
        
        this.updateTime = currentTime;
    }

    update(deltaTime, currentTime) {
        if (!this.usePrediction) {
            // Interpolate position for remote players
            const timeSinceUpdate = currentTime - this.updateTime;
            const interpolationWindow = 100; // 100ms interpolation window
            const interpolateFactor = Math.min(timeSinceUpdate / interpolationWindow, 1);
            
            // Smooth interpolation
            this.position.lerp(this.targetPosition, 0.2 + interpolateFactor * 0.3);
        } else {
            // For local player with prediction, we use predicted position
            // The server correction will happen in updateFromServer
            this.position.copy(this.predictedPosition);
        }
        
        // Update visual representation if it exists
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.rotation.yaw;
        }
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.targetPosition.set(x, y, z);
        if (this.usePrediction) {
            // Initialize predicted position to spawn position
            this.predictedPosition.set(x, y, z);
            // Initialize server position to same value (will be updated by first server state)
            this.serverPosition.set(x, y, z);
        }
    }

    serialize() {
        return {
            id: this.id,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            rotation: { ...this.rotation },
            health: this.health,
            stamina: this.stamina,
            isCrouched: this.isCrouched,
            currentWeapon: this.currentWeapon
        };
    }
}
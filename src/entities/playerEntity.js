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
        this.usePrediction = isLocalPlayer;
    }

    updateFromServer(serverState, currentTime) {
        // Store previous state for interpolation
        this.previousPosition.copy(this.position);
        this.lastUpdateTime = this.updateTime;
        
        // Update target state
        if (serverState.position) {
            this.targetPosition.set(
                serverState.position.x,
                serverState.position.y,
                serverState.position.z
            );
        }
        
        if (serverState.rotation) {
            this.rotation.yaw = serverState.rotation.yaw;
            this.rotation.pitch = serverState.rotation.pitch;
        }
        
        this.health = serverState.health || this.health;
        this.stamina = serverState.stamina || this.stamina;
        this.isCrouched = serverState.isCrouched || false;
        this.currentWeapon = serverState.currentWeapon || this.currentWeapon;
        
        this.updateTime = currentTime;
        
        // For local player with prediction, blend server correction
        if (this.usePrediction) {
            const error = this.targetPosition.distanceTo(this.predictedPosition);
            // If server position is very different, snap to server (lag spike or desync)
            if (error > 2.0) {
                this.position.copy(this.targetPosition);
                this.predictedPosition.copy(this.targetPosition);
            } else {
                // Smoothly correct prediction
                this.predictedPosition.lerp(this.targetPosition, 0.1);
                this.position.copy(this.predictedPosition);
            }
        }
    }

    update(deltaTime, currentTime) {
        if (!this.usePrediction) {
            // Interpolate position for remote players
            const timeSinceUpdate = currentTime - this.updateTime;
            const interpolateTime = Math.min(timeSinceUpdate / 100, 1); // 100ms interpolation window
            
            this.position.lerp(this.targetPosition, 0.1); // Smooth interpolation
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
            this.predictedPosition.set(x, y, z);
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
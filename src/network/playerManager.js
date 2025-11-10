// Manages all player entities (local + remote) for multiplayer
import { ClientPlayerEntity } from '../entities/playerEntity.js';
import { networkClient } from './client.js';
import { PlayerRenderer } from '../entities/playerRenderer.js';
import { gameState } from '../core/gameState.js';

export class PlayerManager {
    constructor() {
        this.players = new Map(); // playerId -> ClientPlayerEntity
        this.renderers = new Map(); // playerId -> PlayerRenderer
        this.localPlayerId = null;
        this.onPlayerAdded = null;
        this.onPlayerRemoved = null;
        this.onPlayersUpdated = null;
    }

    setLocalPlayerId(playerId) {
        this.localPlayerId = playerId;
    }

    getLocalPlayer() {
        if (!this.localPlayerId) return null;
        return this.players.get(this.localPlayerId);
    }

    addPlayer(playerId, isLocal = false) {
        if (this.players.has(playerId)) {
            const existing = this.players.get(playerId);
            if (isLocal && !existing.isLocalPlayer) {
                existing.isLocalPlayer = true;
                existing.usePrediction = true;
                existing.predictedPosition.copy(existing.position);
                existing.serverPosition.copy(existing.position);
                const renderer = this.renderers.get(playerId);
                if (renderer) {
                    renderer.dispose();
                    this.renderers.delete(playerId);
                }
            }
            return existing;
        }

        const player = new ClientPlayerEntity(playerId, isLocal);
        this.players.set(playerId, player);
        
        if (isLocal) {
            this.localPlayerId = playerId;
        } else {
            // Create renderer for remote players (local player uses camera)
            const renderer = new PlayerRenderer(player);
            this.renderers.set(playerId, renderer);
        }
        
        if (this.onPlayerAdded) {
            this.onPlayerAdded(player);
        }
        if (this.onPlayersUpdated) {
            this.onPlayersUpdated(this.getAllPlayers());
        }
        
        return player;
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.players.delete(playerId);
            
            // Clean up renderer
            const renderer = this.renderers.get(playerId);
            if (renderer) {
                renderer.dispose();
                this.renderers.delete(playerId);
            }
            
            if (this.onPlayerRemoved) {
                this.onPlayerRemoved(player);
            }
        }
        if (this.onPlayersUpdated) {
            this.onPlayersUpdated(this.getAllPlayers());
        }
    }

    updatePlayerFromServer(playerId, serverState) {
        let player = this.players.get(playerId);
        if (!player) {
            player = this.addPlayer(playerId, playerId === this.localPlayerId);
        }
        
        player.updateFromServer(serverState, Date.now());

        if (player.isLocalPlayer) {
            if (typeof serverState.health === 'number') {
                gameState.health = serverState.health;
            }
            if (typeof serverState.stamina === 'number') {
                gameState.stamina = Math.max(0, Math.min(serverState.stamina, 100));
            }
        }
        if (this.onPlayersUpdated) {
            this.onPlayersUpdated(this.getAllPlayers());
        }
    }

    updateAll(deltaTime) {
        const currentTime = Date.now();
        for (const player of this.players.values()) {
            player.update(deltaTime, currentTime);
            
            // Update renderer for remote players
            if (!player.isLocalPlayer) {
                const renderer = this.renderers.get(player.id);
                if (renderer) {
                    renderer.update();
                }
            }
        }
    }

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    getRemotePlayers() {
        return this.getAllPlayers().filter(p => !p.isLocalPlayer);
    }
}

export const playerManager = new PlayerManager();
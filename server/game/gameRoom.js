// Game room - manages a single game session
import { PlayerEntity } from './playerEntity.js';
import { CollisionManager } from '../world/collision.js';

// Constants - in production, use shared package
const MESSAGE_TYPES = {
    PLAYER_INPUT: 'player_input',
    PLAYER_CONNECT: 'player_connect',
    PLAYER_DISCONNECT: 'player_disconnect',
    GAME_STATE: 'game_state',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_SPAWNED: 'player_spawned',
    PLAYER_DIED: 'player_died'
};

export class GameRoom {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;
        this.players = new Map(); // socketId -> PlayerEntity
        this.projectiles = [];
        this.lastNetworkUpdate = Date.now();
        this.networkUpdateInterval = 1000 / 20; // 20 updates per second
        this.collisionManager = new CollisionManager();
    }

    addPlayer(socket) {
        // Create player entity with collision manager
        const playerEntity = new PlayerEntity(socket.id, this.collisionManager);
        this.players.set(socket.id, playerEntity);
        
        console.log(`Player ${socket.id} joined room ${this.roomId}. Total players: ${this.players.size}`);
        
        // Send spawn confirmation
        socket.emit(MESSAGE_TYPES.PLAYER_SPAWNED, {
            playerId: socket.id,
            position: playerEntity.position,
            health: playerEntity.health
        });
        
        // Notify other players
        socket.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_JOINED, {
            playerId: socket.id,
            position: playerEntity.position
        });
        
        // Send current game state to new player
        socket.emit(MESSAGE_TYPES.GAME_STATE, this.getGameState());
        
        // Setup input handler for this player
        socket.on(MESSAGE_TYPES.PLAYER_INPUT, (inputData) => {
            this.handlePlayerInput(socket.id, inputData);
        });
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
            console.log(`Player ${socketId} left room ${this.roomId}. Total players: ${this.players.size}`);
            
            // Notify other players
            this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_LEFT, {
                playerId: socketId
            });
        }
    }

    handlePlayerInput(socketId, inputData) {
        const player = this.players.get(socketId);
        if (!player) return;
        
        // Update player input state
        player.updateInput(inputData);
    }

    update(deltaTime) {
        // Update all players
        const playerArray = Array.from(this.players.values());
        for (const player of playerArray) {
            // Pass other players for player-to-player collision
            const otherPlayers = playerArray.filter(p => p.id !== player.id);
            player.update(deltaTime, otherPlayers, this.collisionManager);
        }
        
        // Update projectiles
        this.updateProjectiles(deltaTime);
        
        // Check collisions
        this.checkCollisions();
        
        // Send network updates at specified rate
        const now = Date.now();
        if (now - this.lastNetworkUpdate >= this.networkUpdateInterval) {
            this.broadcastGameState();
            this.lastNetworkUpdate = now;
        }
    }

    updateProjectiles(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.update(deltaTime);
            
            // Remove expired projectiles
            if (projectile.isExpired()) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    checkCollisions() {
        // Check projectile collisions with players
        for (const projectile of this.projectiles) {
            for (const player of this.players.values()) {
                if (projectile.hitsPlayer(player)) {
                    // Apply damage
                    player.takeDamage(projectile.damage);
                    projectile.markHit();
                    
                    if (player.health <= 0) {
                        // Handle player death
                        this.handlePlayerDeath(player);
                    }
                    
                    break; // Projectile can only hit one player
                }
            }
        }
        
        // Remove hit projectiles
        this.projectiles = this.projectiles.filter(p => !p.isHit);
    }

    handlePlayerDeath(player) {
        // Reset player
        player.respawn();
        
        // Notify clients
        this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_DIED, {
            playerId: player.id
        });
    }

    getGameState() {
        // Serialize current game state
        const players = {};
        for (const [id, player] of this.players.entries()) {
            players[id] = player.serialize();
        }
        
        const projectiles = this.projectiles.map(p => p.serialize());
        
        return {
            timestamp: Date.now(),
            players,
            projectiles
        };
    }

    broadcastGameState() {
        const gameState = this.getGameState();
        this.io.to(this.roomId).emit(MESSAGE_TYPES.GAME_STATE, gameState);
    }

    getPlayerCount() {
        return this.players.size;
    }
}
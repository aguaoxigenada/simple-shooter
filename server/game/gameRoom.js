// Game room - manages a single game session
import { PlayerEntity } from './playerEntity.js';
import { CollisionManager } from '../world/collision.js';
import { ProjectileEntity } from './projectileEntity.js';
import { MESSAGE_TYPES, GAME, INPUT_LIMITS } from '../shared/constants.js';

export class GameRoom {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;
        this.players = new Map(); // socketId -> PlayerEntity
        this.projectiles = [];
        this.lastNetworkUpdate = Date.now();
        this.networkUpdateInterval = 1000 / GAME.NETWORK_UPDATE_RATE; // Use constant from shared constants
        this.collisionManager = new CollisionManager();
        
        // Input rate limiting per player
        this.playerInputRates = new Map(); // socketId -> { count: number, resetTime: number }
    }

    addPlayer(socket) {
        // Join socket to room
        socket.join(this.roomId);
        
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
        
        // Notify other players in the room
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
            // Clean up rate limiting
            this.playerInputRates.delete(socketId);
            console.log(`Player ${socketId} left room ${this.roomId}. Total players: ${this.players.size}`);
            
            // Notify other players
            this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_LEFT, {
                playerId: socketId
            });
        }
    }

    handlePlayerInput(socketId, inputData) {
        const player = this.players.get(socketId);
        if (!player) {
            console.warn(`Received input from unknown player: ${socketId}`);
            return;
        }
        
        // Validate input data
        if (!this.validateInput(inputData)) {
            console.warn(`Invalid input from player ${socketId}`);
            return;
        }
        
        // Rate limiting
        if (!this.checkInputRate(socketId)) {
            console.warn(`Input rate limit exceeded for player ${socketId}`);
            return;
        }
        
        // Update player input state
        try {
            player.updateInput(inputData);
        } catch (error) {
            console.error(`Error processing input for player ${socketId}:`, error);
        }
    }
    
    validateInput(inputData) {
        if (!inputData || typeof inputData !== 'object') {
            return false;
        }
        
        // Validate keys object
        if (inputData.keys) {
            if (typeof inputData.keys !== 'object') {
                return false;
            }
            // Validate boolean keys
            const validKeys = ['w', 'a', 's', 'd', 'space', 'shift', 'ctrl'];
            for (const key of validKeys) {
                if (inputData.keys[key] !== undefined && typeof inputData.keys[key] !== 'boolean') {
                    return false;
                }
            }
        }
        
        // Validate mouse deltas with enhanced checks
        if (inputData.mouseX !== undefined) {
            if (typeof inputData.mouseX !== 'number' || 
                !Number.isFinite(inputData.mouseX) || // Check for NaN/Infinity
                Math.abs(inputData.mouseX) > INPUT_LIMITS.MAX_MOUSE_DELTA) {
                return false;
            }
        }
        if (inputData.mouseY !== undefined) {
            if (typeof inputData.mouseY !== 'number' || 
                !Number.isFinite(inputData.mouseY) || // Check for NaN/Infinity
                Math.abs(inputData.mouseY) > INPUT_LIMITS.MAX_MOUSE_DELTA) {
                return false;
            }
        }
        
        // Validate timestamp if present
        if (inputData.timestamp !== undefined) {
            if (typeof inputData.timestamp !== 'number' || 
                !Number.isFinite(inputData.timestamp) ||
                inputData.timestamp < 0 ||
                inputData.timestamp > Date.now() + 10000) { // Allow 10s future tolerance for clock skew
                return false;
            }
        }
        
        // Validate playerId if present
        if (inputData.playerId !== undefined) {
            if (typeof inputData.playerId !== 'string' || inputData.playerId.length === 0) {
                return false;
            }
        }
        
        // Validate shoot flag
        if (inputData.shoot !== undefined && typeof inputData.shoot !== 'boolean') {
            return false;
        }
        
        // Validate weapon type
        if (inputData.weaponType !== undefined) {
            const validWeapons = ['pistol', 'assault_rifle', 'rocket_launcher'];
            if (!validWeapons.includes(inputData.weaponType)) {
                return false;
            }
        }
        
        return true;
    }
    
    checkInputRate(socketId) {
        const now = Date.now();
        const rateInfo = this.playerInputRates.get(socketId);
        
        if (!rateInfo || now >= rateInfo.resetTime) {
            // Reset or initialize rate tracking
            this.playerInputRates.set(socketId, {
                count: 1,
                resetTime: now + 1000 // Reset every second
            });
            return true;
        }
        
        rateInfo.count++;
        if (rateInfo.count > INPUT_LIMITS.MAX_INPUT_RATE) {
            return false;
        }
        
        return true;
    }

    update(deltaTime) {
        try {
            // Update all players
            const playerArray = Array.from(this.players.values());
            for (const player of playerArray) {
                try {
                    // Pass other players for player-to-player collision
                    const otherPlayers = playerArray.filter(p => p.id !== player.id);
                    
                    // Create callback for projectile creation
                    const onShoot = (position, velocity, damage, ownerId) => {
                        const projectileId = `projectile_${Date.now()}_${Math.random()}`;
                        const projectile = new ProjectileEntity(projectileId, position, velocity, damage, ownerId);
                        this.projectiles.push(projectile);
                    };
                    
                    player.update(deltaTime, otherPlayers, this.collisionManager, onShoot);
                } catch (error) {
                    console.error(`Error updating player ${player.id}:`, error);
                }
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
        } catch (error) {
            console.error(`Error in game room update:`, error);
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
        // Broadcast to all clients in the room
        this.io.to(this.roomId).emit(MESSAGE_TYPES.GAME_STATE, gameState);
    }

    getPlayerCount() {
        return this.players.size;
    }
}
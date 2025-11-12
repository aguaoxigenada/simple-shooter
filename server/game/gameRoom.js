// Game room - manages a single game session
import { PlayerEntity } from './playerEntity.js';
import { CollisionManager } from '../world/collision.js';
import { ProjectileEntity } from './projectileEntity.js';
import { MESSAGE_TYPES, GAME, INPUT_LIMITS } from '../shared/constants.js';

const VALID_TARGET_IDS = new Set([
    'target-east',
    'target-west',
    'target-north',
    'target-south',
    'target-northeast',
    'target-southwest'
]);

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
        this.destroyedTargets = new Set();
        this.matchOver = false;
        this.spawnPoints = [
            { x: -7, y: PlayerEntity.spawnHeight(), z: -6 },
            { x: 7, y: PlayerEntity.spawnHeight(), z: -6 },
            { x: 2, y: PlayerEntity.spawnHeight(), z: 6 }
        ];
        this.spawnAssignments = new Map();
    }

    addPlayer(socket) {
        // Join socket to room
        socket.join(this.roomId);
        
        // Create player entity with collision manager
        const playerEntity = new PlayerEntity(socket.id, this.collisionManager);
        const spawnPoint = this.getNextSpawnPoint(socket.id);
        console.log(`[Spawn] Assigning player ${socket.id} to spawn (${spawnPoint.x.toFixed(2)}, ${spawnPoint.y.toFixed(2)}, ${spawnPoint.z.toFixed(2)})`);
        playerEntity.position.x = spawnPoint.x;
        playerEntity.position.y = spawnPoint.y;
        playerEntity.position.z = spawnPoint.z;
        this.players.set(socket.id, playerEntity);
        
        console.log(`Player ${socket.id} joined room ${this.roomId}. Total players: ${this.players.size}`);
        
        // Send spawn confirmation
        socket.emit(MESSAGE_TYPES.PLAYER_SPAWNED, {
            playerId: socket.id,
            position: playerEntity.position,
            rotation: { yaw: playerEntity.rotation.yaw, pitch: playerEntity.rotation.pitch },
            health: playerEntity.health
        });
        
        // Notify other players in the room
        socket.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_JOINED, {
            playerId: socket.id,
            position: playerEntity.position
        });
        
        // Send current game state to new player
        socket.emit(MESSAGE_TYPES.GAME_STATE, this.getGameState());

        // Send current target destruction state
        socket.emit(MESSAGE_TYPES.TARGET_STATE, {
            destroyedTargets: Array.from(this.destroyedTargets)
        });
        
        // Setup input handler for this player
        socket.on(MESSAGE_TYPES.PLAYER_INPUT, (inputData) => {
            this.handlePlayerInput(socket.id, inputData);
        });

        socket.on(MESSAGE_TYPES.TARGET_DESTROYED, (data) => {
            this.handleTargetDestroyed(socket.id, data);
        });

        socket.on(MESSAGE_TYPES.PLAYER_READY, (data) => {
            this.handlePlayerReady(socket.id, data);
        });
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
            // Clean up rate limiting
            this.playerInputRates.delete(socketId);
            this.spawnAssignments.delete(socketId);
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
        
        // Rate limiting - but always allow shoot inputs to go through
        const hasShootInput = inputData.shoot !== undefined || inputData.weaponType !== undefined;
        if (!hasShootInput && !this.checkInputRate(socketId)) {
            // Only rate limit non-shoot inputs to prevent spam
            // Shoot inputs are critical and should always be processed
            return;
        }
        
        // Update player input state
        try {
            if (inputData.shoot !== undefined) {
                console.log(`[Input] Shoot received from ${socketId}: shoot=${inputData.shoot}, weaponType=${inputData.weaponType || 'none'}`);
            }
            player.updateInput(inputData);
        } catch (error) {
            console.error(`Error processing input for player ${socketId}:`, error);
        }
    }

    handlePlayerReady(socketId, data) {
        if (!data || typeof data !== 'object') {
            return;
        }
        const { playerId, isReady } = data;
        const targetId = playerId || socketId;
        if (!this.players.has(targetId)) {
            console.warn(`Ready update for unknown player: ${targetId}`);
            return;
        }

        console.log(`[Lobby] Player ${targetId} ready state => ${isReady}`);
        this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_READY, {
            playerId: targetId,
            isReady: !!isReady
        });
        // Also store ready state server-side if additional logic is needed
        if (!this._readyStates) {
            this._readyStates = new Map();
        }
        this._readyStates.set(targetId, !!isReady);
    }

    getNextSpawnPoint(playerId) {
        if (this.spawnAssignments.has(playerId)) {
            const index = this.spawnAssignments.get(playerId);
            return this.spawnPoints[index];
        }

        const used = new Set(this.spawnAssignments.values());
        const available = this.spawnPoints
            .map((_, idx) => idx)
            .filter((idx) => !used.has(idx));

        let index;
        if (available.length > 0) {
            index = available[Math.floor(Math.random() * available.length)];
        } else {
            index = Math.floor(Math.random() * this.spawnPoints.length);
        }

        this.spawnAssignments.set(playerId, index);
        const point = this.spawnPoints[index];
        console.log(`[Spawn Queue] Player ${playerId} -> index ${index}, used=${Array.from(used).join(',')}`);
        return point;
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
            const validWeapons = ['pistol', 'assault_rifle', 'shotgun', 'rocket_launcher'];
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

    handleTargetDestroyed(socketId, data) {
        if (!data || typeof data !== 'object') {
            return;
        }

        const { targetId } = data;
        if (typeof targetId !== 'string' || targetId.length === 0) {
            return;
        }

        if (!VALID_TARGET_IDS.has(targetId) || this.destroyedTargets.has(targetId)) {
            return;
        }

        this.destroyedTargets.add(targetId);
        this.io.to(this.roomId).emit(MESSAGE_TYPES.TARGET_DESTROYED, { targetId });
    }

    update(deltaTime) {
        if (this.matchOver) {
            return;
        }

        try {
            // Update all players
            const playerArray = Array.from(this.players.values());
            for (const player of playerArray) {
                try {
                    // Pass other players for player-to-player collision
                    const otherPlayers = playerArray.filter(p => p.id !== player.id);
                    
                    // Create callback for projectile creation
                    const onShoot = (position, velocity, damage, ownerId, weaponType) => {
                        const projectileId = `projectile_${Date.now()}_${Math.random()}`;
                        const projectile = new ProjectileEntity(projectileId, position, velocity, damage, ownerId, weaponType);
                        this.projectiles.push(projectile);
                    };

                    const onPlayerHit = ({ attackerId, targetId, damage, weaponType, wasFatal }) => {
                        const targetPlayer = this.players.get(targetId);
                        if (!targetPlayer) {
                            return;
                        }

                        this.handlePlayerDamage(targetPlayer, attackerId, damage, weaponType, wasFatal);
                    };
                    
                    player.update(deltaTime, otherPlayers, this.collisionManager, onShoot, onPlayerHit);
                    if (this.matchOver) {
                        break;
                    }
                } catch (error) {
                    console.error(`Error updating player ${player.id}:`, error);
                }
            }
            
            // Update projectiles
            this.updateProjectiles(deltaTime);
            
            // Check collisions
            if (!this.matchOver) {
                this.checkCollisions();
            }
            
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
                    const wasFatal = player.takeDamage(projectile.damage);
                    projectile.markHit();
                    
                    this.handlePlayerDamage(player, projectile.ownerId, projectile.damage, projectile.weaponType || null, wasFatal);
                    
                    break; // Projectile can only hit one player
                }
            }
        }
        
        // Remove hit projectiles
        this.projectiles = this.projectiles.filter(p => !p.isHit);
    }

    handlePlayerDamage(targetPlayer, attackerId, damage, weaponType, wasFatal) {
        if (!targetPlayer) {
            return;
        }

        this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_HIT, {
            attackerId: attackerId || null,
            targetId: targetPlayer.id,
            damage,
            remainingHealth: targetPlayer.health,
            weaponType: weaponType || null,
            wasFatal: !!wasFatal
        });

        if (wasFatal) {
            this.handlePlayerDeath(targetPlayer, attackerId);
        }
    }

    handlePlayerDeath(player, killerId = null) {
        if (this.matchOver) {
            return;
        }

        this.matchOver = true;

        player.health = 0;
        player.isEliminated = true;
        player.velocity = { x: 0, y: 0, z: 0 };

        let winnerId = null;
        if (killerId && killerId !== player.id) {
            winnerId = killerId;
        } else {
            for (const other of this.players.values()) {
                if (other.id !== player.id && other.health > 0) {
                    winnerId = other.id;
                    break;
                }
            }
        }

        const resolvedKillerId = killerId && killerId !== player.id ? killerId : winnerId;

        this.io.to(this.roomId).emit(MESSAGE_TYPES.PLAYER_DIED, {
            playerId: player.id,
            killerId: resolvedKillerId || null
        });

        this.io.to(this.roomId).emit(MESSAGE_TYPES.MATCH_RESULT, {
            winnerId: winnerId || null,
            loserId: player.id,
            killerId: resolvedKillerId || null
        });

        // Stop any remaining projectiles
        this.projectiles = [];

        // Broadcast final state to ensure clients sync
        this.broadcastGameState();
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
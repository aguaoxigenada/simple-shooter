// Authoritative game server - runs the actual game logic
import { GameRoom } from './gameRoom.js';
import { GAME } from '../shared/constants.js';

export class GameServer {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.defaultRoom = null;
        
        // Create default game room
        this.defaultRoom = new GameRoom('default', io);
        this.rooms.set('default', this.defaultRoom);
        
        // Start game loop
        this.lastTick = Date.now();
        this.tickInterval = 1000 / GAME.TICK_RATE; // Convert ticks per second to ms
        this.startGameLoop();
        
        console.log('Game server initialized');
    }

    startGameLoop() {
        // Fixed timestep game loop for consistent physics
        const targetDeltaTime = 1 / GAME.TICK_RATE;
        let accumulatedTime = 0;
        
        const tick = () => {
            const now = Date.now();
            const realDeltaTime = Math.min((now - this.lastTick) / 1000, 0.1); // Cap at 100ms
            this.lastTick = now;
            accumulatedTime += realDeltaTime;
            
            // Update with fixed timestep
            while (accumulatedTime >= targetDeltaTime) {
                // Update all rooms with fixed delta time
                for (const room of this.rooms.values()) {
                    try {
                        room.update(targetDeltaTime);
                    } catch (error) {
                        console.error(`Error updating room ${room.roomId}:`, error);
                    }
                }
                accumulatedTime -= targetDeltaTime;
            }
            
            // Use setImmediate for better timing, fallback to setTimeout
            if (typeof setImmediate !== 'undefined') {
                setImmediate(tick);
            } else {
                setTimeout(tick, this.tickInterval);
            }
        };
        
        tick();
    }

    handlePlayerConnect(socket) {
        // Add player to default room for now
        // Later we can add room selection/matchmaking
        if (this.defaultRoom) {
            this.defaultRoom.addPlayer(socket);
        }
    }

    handlePlayerDisconnect(socketId) {
        // Remove player from all rooms
        for (const room of this.rooms.values()) {
            room.removePlayer(socketId);
        }
    }

    getPlayerCount() {
        let total = 0;
        for (const room of this.rooms.values()) {
            total += room.getPlayerCount();
        }
        return total;
    }
}
// Authoritative game server - runs the actual game logic
import { GameRoom } from './gameRoom.js';

// Constants - in production, use shared package
const GAME = {
    TICK_RATE: 30,
    NETWORK_UPDATE_RATE: 20,
    INTERPOLATION_BUFFER: 0.1,
    MAX_LAG_COMPENSATION: 0.2
};

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
        const tick = () => {
            const now = Date.now();
            const deltaTime = Math.min((now - this.lastTick) / 1000, 0.1); // Cap at 100ms
            this.lastTick = now;
            
            // Update all rooms
            for (const room of this.rooms.values()) {
                room.update(deltaTime);
            }
            
            setTimeout(tick, this.tickInterval);
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
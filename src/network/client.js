// Client-side networking layer
import io from 'socket.io-client';
import { MESSAGE_TYPES } from '../shared/constants.js';

class NetworkClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.playerId = null;
        this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
        
        // Callbacks
        this.onGameStateUpdate = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onConnectionChange = null;
        this.onPlayerSpawned = null;
    }

    connect(playerName = 'Player') {
        if (this.socket && this.isConnected) {
            console.log('Already connected');
            return;
        }

        console.log(`Connecting to server at ${this.serverUrl}...`);
        
        this.socket = io(this.serverUrl, {
            transports: ['websocket'],
            autoConnect: true
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            if (this.onConnectionChange) {
                this.onConnectionChange(true);
            }
            // Send player info on connect
            this.socket.emit(MESSAGE_TYPES.PLAYER_CONNECT, { name: playerName });
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.playerId = null;
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });

        // Game state updates
        this.socket.on(MESSAGE_TYPES.GAME_STATE, (gameState) => {
            if (this.onGameStateUpdate) {
                this.onGameStateUpdate(gameState);
            }
        });

        // Player events
        this.socket.on(MESSAGE_TYPES.PLAYER_JOINED, (data) => {
            if (this.onPlayerJoined) {
                this.onPlayerJoined(data);
            }
        });

        this.socket.on(MESSAGE_TYPES.PLAYER_LEFT, (data) => {
            if (this.onPlayerLeft) {
                this.onPlayerLeft(data);
            }
        });

        // Receive player ID
        this.socket.on(MESSAGE_TYPES.PLAYER_SPAWNED, (data) => {
            this.playerId = data.playerId;
            console.log('Player ID assigned:', this.playerId);
            // Trigger callback if set
            if (this.onPlayerSpawned) {
                this.onPlayerSpawned(data);
            }
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.playerId = null;
        }
    }

    sendInput(inputData) {
        if (!this.isConnected || !this.socket) {
            return;
        }

        // Add timestamp to input for server-side lag compensation
        this.socket.emit(MESSAGE_TYPES.PLAYER_INPUT, {
            ...inputData,
            timestamp: Date.now(),
            playerId: this.playerId
        });
    }

    // Helper to get current connection state
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            playerId: this.playerId,
            socketId: this.socket?.id
        };
    }
}

// Export singleton instance
export const networkClient = new NetworkClient();
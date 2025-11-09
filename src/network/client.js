// Client-side networking layer
import io from 'socket.io-client';
import { MESSAGE_TYPES } from '../shared/constants.js';

class NetworkClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.playerId = null;
        this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
        
        // Retry configuration
        this.retryAttempts = 0;
        this.maxRetryAttempts = 5;
        this.retryDelay = 1000; // Start with 1 second
        this.maxRetryDelay = 10000; // Max 10 seconds
        this.retryTimeout = null;
        this.shouldAutoReconnect = false;
        this.playerName = 'Player';
        
        // Callbacks
        this.onGameStateUpdate = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onConnectionChange = null;
        this.onPlayerSpawned = null;
        this.onError = null;
    }

    connect(playerName = 'Player', autoReconnect = true) {
        if (this.socket && this.isConnected) {
            console.log('Already connected');
            return;
        }

        // Clear any existing retry timeout
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }

        this.playerName = playerName;
        this.shouldAutoReconnect = autoReconnect;
        this.retryAttempts = 0;

        this._attemptConnection();
    }

    _attemptConnection() {
        console.log(`Connecting to server at ${this.serverUrl}... (attempt ${this.retryAttempts + 1}/${this.maxRetryAttempts})`);
        
        // Clean up existing socket if any
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.socket = io(this.serverUrl, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: false, // We handle reconnection manually
            timeout: 5000
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.retryAttempts = 0; // Reset on successful connection
            this.retryDelay = 1000; // Reset retry delay
            
            if (this.onConnectionChange) {
                this.onConnectionChange(true);
            }
            
            // Send player info on connect
            try {
                this.socket.emit(MESSAGE_TYPES.PLAYER_CONNECT, { name: this.playerName });
            } catch (error) {
                console.error('Error sending player connect:', error);
                if (this.onError) {
                    this.onError('Failed to send player info', error);
                }
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.isConnected = false;
            this.playerId = null;
            
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
            
            // Attempt reconnection if auto-reconnect is enabled
            if (this.shouldAutoReconnect && reason !== 'io client disconnect') {
                this._scheduleReconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error.message);
            
            if (this.onError) {
                this.onError('Connection failed', error);
            }
            
            // Attempt reconnection if auto-reconnect is enabled
            if (this.shouldAutoReconnect) {
                this._scheduleReconnect();
            }
        });

        // Game state updates
        this.socket.on(MESSAGE_TYPES.GAME_STATE, (gameState) => {
            try {
                if (this.onGameStateUpdate) {
                    this.onGameStateUpdate(gameState);
                }
            } catch (error) {
                console.error('Error handling game state update:', error);
                if (this.onError) {
                    this.onError('Failed to process game state', error);
                }
            }
        });

        // Player events
        this.socket.on(MESSAGE_TYPES.PLAYER_JOINED, (data) => {
            try {
                if (this.onPlayerJoined) {
                    this.onPlayerJoined(data);
                }
            } catch (error) {
                console.error('Error handling player joined:', error);
            }
        });

        this.socket.on(MESSAGE_TYPES.PLAYER_LEFT, (data) => {
            try {
                if (this.onPlayerLeft) {
                    this.onPlayerLeft(data);
                }
            } catch (error) {
                console.error('Error handling player left:', error);
            }
        });

        // Receive player ID
        this.socket.on(MESSAGE_TYPES.PLAYER_SPAWNED, (data) => {
            try {
                if (!data || !data.playerId) {
                    throw new Error('Invalid spawn data received');
                }
                this.playerId = data.playerId;
                console.log('Player ID assigned:', this.playerId);
                // Trigger callback if set
                if (this.onPlayerSpawned) {
                    this.onPlayerSpawned(data);
                }
            } catch (error) {
                console.error('Error handling player spawned:', error);
                if (this.onError) {
                    this.onError('Failed to process player spawn', error);
                }
            }
        });
    }

    _scheduleReconnect() {
        if (this.retryAttempts >= this.maxRetryAttempts) {
            console.error('Max reconnection attempts reached. Giving up.');
            if (this.onError) {
                this.onError('Connection failed after multiple attempts', new Error('Max retries exceeded'));
            }
            return;
        }

        this.retryAttempts++;
        const delay = Math.min(this.retryDelay * Math.pow(2, this.retryAttempts - 1), this.maxRetryDelay);
        
        console.log(`Scheduling reconnection attempt in ${delay}ms...`);
        
        this.retryTimeout = setTimeout(() => {
            this._attemptConnection();
        }, delay);
    }

    disconnect() {
        // Disable auto-reconnect
        this.shouldAutoReconnect = false;
        
        // Clear retry timeout
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isConnected = false;
        this.playerId = null;
        this.retryAttempts = 0;
    }

    sendInput(inputData) {
        if (!this.isConnected || !this.socket) {
            return;
        }

        try {
            // Merge with any existing input state (for shooting events)
            const currentInput = this.lastInput || {};
            const mergedInput = { ...currentInput, ...inputData };
            this.lastInput = mergedInput;
            
            // Add timestamp to input for server-side lag compensation
            this.socket.emit(MESSAGE_TYPES.PLAYER_INPUT, {
                ...mergedInput,
                timestamp: Date.now(),
                playerId: this.playerId
            });
            
            // Clear one-time events like shoot after sending
            if (inputData.shoot) {
                delete this.lastInput.shoot;
            }
        } catch (error) {
            console.error('Error sending input:', error);
            if (this.onError) {
                this.onError('Failed to send input', error);
            }
        }
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
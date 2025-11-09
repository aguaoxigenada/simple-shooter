// Shared constants for server - should match client constants
// In production, these would come from a shared npm package
// 
// ?? WARNING: This file must stay synchronized with src/shared/constants.js
// When modifying constants, update BOTH files to ensure consistency.
// Consider using a shared package or build-time sync in the future.

// Player constants
export const PLAYER = {
    MOVE_SPEED: 5,
    SPRINT_SPEED: 10,
    JUMP_VELOCITY: 8,
    GRAVITY: -20,
    PLAYER_HEIGHT: 1.6,
    CROUCH_HEIGHT: 0.8,
    PLAYER_RADIUS: 0.4,
    CROUCH_SPEED_MULTIPLIER: 0.5,
    STAMINA_DEPLETION_RATE: 40,
    STAMINA_RECOVERY_RATE: 20,
    MOUSE_SENSITIVITY: 0.002,
    MAX_HEALTH: 100,
    MAX_STAMINA: 100
};

// Weapon constants
export const WEAPON = {
    PISTOL: {
        DAMAGE: 40,
        FIRE_RATE: 0.5,
        AMMO_CAPACITY: 6,
        AMMO_TOTAL: 24,
        FIRE_MODE: 'semi-auto',
        PROJECTILE_TYPE: 'raycast',
        RELOAD_TIME: 1.5
    },
    ASSAULT_RIFLE: {
        DAMAGE: 50,
        FIRE_RATE: 0.1,
        AMMO_CAPACITY: 30,
        AMMO_TOTAL: 90,
        FIRE_MODE: 'auto',
        PROJECTILE_TYPE: 'raycast',
        RELOAD_TIME: 2.0
    },
    ROCKET_LAUNCHER: {
        DAMAGE: 100,
        FIRE_RATE: 1.5,
        AMMO_CAPACITY: 1,
        AMMO_TOTAL: 5,
        FIRE_MODE: 'semi-auto',
        PROJECTILE_TYPE: 'projectile',
        RELOAD_TIME: 2.5
    }
};

// Projectile constants
export const PROJECTILE = {
    ROCKET_SPEED: 20,
    ROCKET_LIFETIME: 5,
    EXPLOSION_RADIUS: 3,
    GRAVITY: -9.8
};

// Game constants
export const GAME = {
    TICK_RATE: 30, // Server ticks per second
    NETWORK_UPDATE_RATE: 30, // Network updates per second (increased from 20 for better responsiveness)
    INTERPOLATION_BUFFER: 0.1,
    MAX_LAG_COMPENSATION: 0.2
};

// Network message types
export const MESSAGE_TYPES = {
    // Client to Server
    PLAYER_INPUT: 'player_input',
    PLAYER_CONNECT: 'player_connect',
    PLAYER_DISCONNECT: 'player_disconnect',
    TARGET_DESTROYED: 'target_destroyed',
    
    // Server to Client
    GAME_STATE: 'game_state',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_SPAWNED: 'player_spawned',
    PLAYER_DIED: 'player_died',
    TARGET_STATE: 'target_state'
};

// Input validation limits
export const INPUT_LIMITS = {
    MAX_MOUSE_DELTA: 1000, // Maximum mouse movement per frame
    MAX_INPUT_RATE: 60, // Maximum inputs per second
    MAX_NAME_LENGTH: 32,
    MIN_NAME_LENGTH: 1
};


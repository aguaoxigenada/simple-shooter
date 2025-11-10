// Game state management
class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.health = 100;
        this.kills = 0;
        this.isMouseLocked = false;
        this.stamina = 100;
        this.currentWeapon = null;
        this.tokens = 0;
        this.isInBuyPhase = false;
        this.matchOutcome = null;
        this.matchResult = null;
        this.matchOpponentId = null;
        this.matchKillerId = null;
        this.loadout = {
            primary: null,
            secondary: null,
            utility: []
        };
        this.spawnInfo = {
            lastSpawnPosition: { x: 0, y: 0, z: 0 },
            lastSpawnYaw: 0
        };
    }

    applySpawn(position, yaw = 0) {
        this.spawnInfo.lastSpawnPosition = { x: position.x, y: position.y, z: position.z };
        this.spawnInfo.lastSpawnYaw = yaw;
    }
}

export const gameState = new GameState();

// Game state management
export const gameState = {
    health: 100,
    kills: 0,
    isMouseLocked: false,
    stamina: 100,
    currentWeapon: null, // Will be set in weapon initialization
    matchOutcome: null,
    matchResult: null,
    matchOpponentId: null,
    matchKillerId: null
};

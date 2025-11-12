import { gameState } from '../core/gameState.js';
import { getCurrentWeapon, getAssaultRifleSpread } from './weapon.js';
import { updateCrosshair } from '../ui/crosshair.js';

let lastUpdateTime = performance.now();

// Update UI
export function updateUI() {
    document.getElementById('health').textContent = gameState.health;
    document.getElementById('kills').textContent = gameState.kills;
    
    // Update weapon info
    if (gameState.currentWeapon) {
        const weapon = getCurrentWeapon();
        document.getElementById('weapon-name').textContent = weapon.name;
        document.getElementById('ammo-count').textContent = weapon.ammo;
        document.getElementById('ammo-total').textContent = weapon.ammoTotal;
    }
    
    // Calculate deltaTime for smooth crosshair interpolation
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastUpdateTime) / 1000; // Convert to seconds
    lastUpdateTime = currentTime;
    
    // Update crosshair based on current weapon, spread, and movement
    if (gameState.currentWeapon) {
        const spreadAmount = getAssaultRifleSpread();
        updateCrosshair(gameState.currentWeapon, spreadAmount, deltaTime);
    }
    
    // Update stamina bar - only show in test range (not in multiplayer arena)
    const staminaContainer = document.getElementById('stamina-container');
    const staminaLabel = document.getElementById('stamina-label');
    const staminaBar = document.getElementById('stamina-bar');
    const staminaPercentage = document.getElementById('stamina-percentage');
    
    // Hide stamina UI in multiplayer arena (when selectedWeapon is set)
    const isMultiplayer = !!gameState.selectedWeapon;
    if (staminaContainer) {
        staminaContainer.style.display = isMultiplayer ? 'none' : 'block';
    }
    if (staminaLabel) {
        staminaLabel.style.display = isMultiplayer ? 'none' : 'block';
    }
    
    // Update stamina values (even if hidden, for test range)
    if (staminaBar) {
        staminaBar.style.width = `${gameState.stamina}%`;
        staminaBar.style.backgroundColor = gameState.stamina < 20 ? '#ff0000' : 
                                            gameState.stamina < 50 ? '#ffaa00' : '#00ff00';
    }
    if (staminaPercentage) {
        staminaPercentage.textContent = Math.round(gameState.stamina);
    }
}

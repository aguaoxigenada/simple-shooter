import { gameState } from '../core/gameState.js';
import { WEAPON_TYPES, isWeaponFiring } from '../systems/weapon.js';
import { getMovementState } from '../entities/player.js';

let crosshairElement = null;
let currentWeaponType = null;
let currentExpansion = 0; // Current expansion amount (for smooth interpolation)
let targetExpansion = 0; // Target expansion amount

// Expansion factors
const EXPANSION_FACTORS = {
    stationary: 0,
    walking: 0.5,      // 50% expansion when walking (exaggerated)
    sprinting: 1.0,    // 100% expansion when sprinting (exaggerated)
    crouching: 0.2,    // 20% expansion when crouching (exaggerated)
    firing: {
        [WEAPON_TYPES.PISTOL]: 0.3,           // 30% per shot (exaggerated)
        [WEAPON_TYPES.ASSAULT_RIFLE]: 1.2,     // 120% base, increases with sustained fire (exaggerated)
        [WEAPON_TYPES.SHOTGUN]: 0.5,          // 50% per shot (exaggerated)
        [WEAPON_TYPES.ROCKET_LAUNCHER]: 0.6   // 60% per shot (exaggerated)
    }
};

// Recovery rates (how fast crosshair contracts when conditions improve)
const RECOVERY_RATES = {
    [WEAPON_TYPES.PISTOL]: 0.15,      // Fast recovery
    [WEAPON_TYPES.ASSAULT_RIFLE]: 0.08, // Slower recovery
    [WEAPON_TYPES.SHOTGUN]: 0.12,
    [WEAPON_TYPES.ROCKET_LAUNCHER]: 0.10
};

// Weapon-specific crosshair configurations
const CROSSHAIR_CONFIGS = {
    [WEAPON_TYPES.PISTOL]: {
        style: 'classicCross', // Simple crosshair like assault rifle but smaller
        baseGap: 7.168, // Gap from center (another 60% bigger)
        baseLineLength: 12.544, // Base length of each cross line (another 60% bigger)
        baseSquareSize: 4.301, // Size of center square (another 60% bigger)
        color: '#FFFFFF',
        maxGapExpansion: 12, // Max gap expansion (reduced spread)
        maxLineExpansion: 10, // Max line length expansion (reduced spread)
        maxSquareExpansion: 1.5 // Max square size expansion (reduced spread)
    },
    [WEAPON_TYPES.ASSAULT_RIFLE]: {
        style: 'classicCross', // Classic cross with center square
        baseGap: 0.220, // Gap from center to where lines start (60% smaller)
        baseLineLength: 0.329, // Base length of each cross line (60% smaller)
        baseSquareSize: 0.110, // Size of center square (60% smaller)
        color: '#FFAA00',
        maxGapExpansion: 25.6, // Max gap expansion (kept same)
        maxLineExpansion: 22.4, // Max line length expansion (kept same)
        maxSquareExpansion: 3.2 // Max square size expansion (kept same)
    },
    [WEAPON_TYPES.SHOTGUN]: {
        style: 'circle',
        baseSize: 33.6, // 40% bigger (was 24)
        color: '#FFFF00',
        maxExpansion: 24 // Bigger expansion (was 16)
    },
    [WEAPON_TYPES.ROCKET_LAUNCHER]: {
        style: 'diamond',
        baseSize: 30.8, // 40% bigger (was 22)
        color: '#FF6600',
        maxExpansion: 22 // Bigger expansion (was 15)
    }
};

export function initCrosshair() {
    crosshairElement = document.getElementById('crosshair');
    if (!crosshairElement) {
        console.warn('Crosshair element not found');
        return;
    }
    
    currentExpansion = 0;
    targetExpansion = 0;
    
    // Initialize with default style
    updateCrosshair(WEAPON_TYPES.ASSAULT_RIFLE, 0);
}

export function updateCrosshair(weaponType, spreadAmount = 0, deltaTime = 0.016) {
    if (!crosshairElement) return;
    
    const config = CROSSHAIR_CONFIGS[weaponType] || CROSSHAIR_CONFIGS[WEAPON_TYPES.ASSAULT_RIFLE];
    
    // Reset expansion when switching weapons to avoid unit mismatches
    if (currentWeaponType !== weaponType) {
        currentExpansion = 0;
        targetExpansion = 0;
    }
    
    currentWeaponType = weaponType;
    
    // Get movement state
    const movementState = getMovementState();
    
    // Calculate movement-based expansion
    let movementExpansion = 0;
    if (movementState.isCrouching) {
        movementExpansion = EXPANSION_FACTORS.crouching;
    } else if (movementState.isSprinting) {
        movementExpansion = EXPANSION_FACTORS.sprinting;
    } else if (movementState.isWalking) {
        movementExpansion = EXPANSION_FACTORS.walking;
    }
    
    // Calculate firing-based expansion
    let firingExpansion = 0;
    const baseFiringFactor = EXPANSION_FACTORS.firing[weaponType] || 0.3;
    const isFiring = isWeaponFiring();
    
    if (weaponType === WEAPON_TYPES.ASSAULT_RIFLE) {
        // For assault rifle, spreadAmount represents sustained fire
        // Convert spread from radians to expansion factor (0-1 range)
        const maxSpreadRad = 6 * Math.PI / 180; // Max 6 degrees
        const spreadFactor = Math.min(spreadAmount / maxSpreadRad, 1.0);
        // Firing expansion: start higher (0.8) and scale up to 1.0 based on spread for faster initial response
        firingExpansion = baseFiringFactor * (0.8 + spreadFactor * 0.2); // 80-100% of base factor (faster start)
    } else if (isFiring) {
        // For other weapons, expand when firing
        firingExpansion = baseFiringFactor;
    }
    
    // Combine movement and firing expansion (both contribute)
    if (weaponType === WEAPON_TYPES.ASSAULT_RIFLE) {
        // When firing starts, set aggressive minimum expansion immediately
        if (isFiring) {
            // Instant aggressive expansion - start at 95% minimum, then scale up
            const minFiringExpansion = 0.95; // Minimum 95% expansion when firing starts (for testing)
            const calculatedExpansion = movementExpansion + firingExpansion;
            targetExpansion = Math.min(Math.max(calculatedExpansion, minFiringExpansion), 1.2); // Min 95%, cap at 120%
        } else {
            // Not firing - normal calculation
            targetExpansion = Math.min(movementExpansion + firingExpansion, 1.2);
        }
    } else if (weaponType === WEAPON_TYPES.PISTOL) {
        // Pistol uses same expansion system as AR (classicCross style) - factor based (0-1.2)
        targetExpansion = Math.min(movementExpansion + firingExpansion, 1.2);
    } else {
        // For other weapons (shotgun, rocket launcher), combine normally with exaggeration
        // These use pixel-based expansion, so multiply by maxExpansion
        const expansionFactor = Math.min(movementExpansion + firingExpansion * 0.7, 1.2);
        targetExpansion = expansionFactor * config.maxExpansion;
    }
    
    // Smooth interpolation towards target expansion
    const recoveryRate = RECOVERY_RATES[weaponType] || 0.1;
    
    // Handle expansion differently for factor-based (AR, Pistol) vs pixel-based (Shotgun, Rocket)
    const isFactorBased = (weaponType === WEAPON_TYPES.ASSAULT_RIFLE || weaponType === WEAPON_TYPES.PISTOL);
    
    // Instant expansion when firing for assault rifle
    if (weaponType === WEAPON_TYPES.ASSAULT_RIFLE && isFiring) {
        // Instant expansion - jump to target immediately, no interpolation
        // This ensures zero visual delay when firing starts
        currentExpansion = targetExpansion;
    } else {
        // For other weapons or when not firing, use interpolation
        let expansionSpeed = 0.2;
        if (isFiring) {
            expansionSpeed = 0.8; // Very fast expansion for other weapons when firing
        } else if (targetExpansion > currentExpansion) {
            expansionSpeed = 0.3; // Faster expansion for movement too
        }
        const lerpSpeed = targetExpansion > currentExpansion ? expansionSpeed : recoveryRate;
        currentExpansion += (targetExpansion - currentExpansion) * lerpSpeed * (deltaTime * 60); // Normalize to 60fps
    }
    
    // Clear existing styles
    crosshairElement.innerHTML = '';
    crosshairElement.className = `crosshair-${weaponType}`;
    
    const color = config.color;
    
    // Create crosshair based on style
    switch (config.style) {
        case 'dot':
            const size = config.baseSize + currentExpansion;
            createDotCrosshair(size, color);
            break;
        case 'classicCross':
            if (weaponType === WEAPON_TYPES.ASSAULT_RIFLE) {
                createAssaultRifleCrosshair(config, currentExpansion, color);
            } else if (weaponType === WEAPON_TYPES.PISTOL) {
                // Pistol uses same crosshair style as AR but with its own config
                createAssaultRifleCrosshair(config, currentExpansion, color);
            } else {
                createClassicCrossCrosshair(config, currentExpansion, color);
            }
            break;
        case 'circle':
            const circleSize = config.baseSize + currentExpansion;
            createCircleCrosshair(circleSize, color, currentExpansion);
            break;
        case 'diamond':
            const diamondSize = config.baseSize + currentExpansion;
            createDiamondCrosshair(diamondSize, color, currentExpansion);
            break;
    }
}

function createDotCrosshair(size, color) {
    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.top = '50%';
    dot.style.left = '50%';
    dot.style.transform = 'translate(-50%, -50%)';
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = '50%';
    dot.style.backgroundColor = color;
    dot.style.boxShadow = `0 0 ${size}px ${color}`;
    crosshairElement.appendChild(dot);
}

function createAssaultRifleCrosshair(config, expansion, color) {
    const lineThickness = 2;
    
    // Calculate expansion amounts (can exceed 1.0 for exaggeration)
    // Cap at 1.2 for visual consistency
    const expansionFactor = Math.min(expansion, 1.2);
    
    // Gap expands: base gap increases with firing
    const gap = config.baseGap + (expansionFactor * config.maxGapExpansion);
    
    // Line length extends: lines grow longer with firing
    const lineLength = config.baseLineLength + (expansionFactor * config.maxLineExpansion);
    
    // Square size: slight expansion, stays centered
    const squareSize = config.baseSquareSize + (expansionFactor * config.maxSquareExpansion);
    
    // Center square
    const centerSquare = document.createElement('div');
    centerSquare.style.position = 'absolute';
    centerSquare.style.top = '50%';
    centerSquare.style.left = '50%';
    centerSquare.style.transform = 'translate(-50%, -50%)';
    centerSquare.style.width = `${squareSize}px`;
    centerSquare.style.height = `${squareSize}px`;
    centerSquare.style.backgroundColor = color;
    centerSquare.style.boxShadow = `0 0 3px ${color}`;
    crosshairElement.appendChild(centerSquare);
    
    // Top line (extends upward from gap)
    const topLine = document.createElement('div');
    topLine.style.position = 'absolute';
    topLine.style.top = '50%';
    topLine.style.left = '50%';
    topLine.style.transform = `translate(-50%, calc(-50% - ${gap}px))`;
    topLine.style.width = `${lineThickness}px`;
    topLine.style.height = `${lineLength}px`;
    topLine.style.backgroundColor = color;
    topLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(topLine);
    
    // Bottom line (extends downward from gap)
    const bottomLine = document.createElement('div');
    bottomLine.style.position = 'absolute';
    bottomLine.style.top = '50%';
    bottomLine.style.left = '50%';
    bottomLine.style.transform = `translate(-50%, calc(-50% + ${gap}px))`;
    bottomLine.style.width = `${lineThickness}px`;
    bottomLine.style.height = `${lineLength}px`;
    bottomLine.style.backgroundColor = color;
    bottomLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(bottomLine);
    
    // Left line (extends leftward from gap)
    const leftLine = document.createElement('div');
    leftLine.style.position = 'absolute';
    leftLine.style.top = '50%';
    leftLine.style.left = '50%';
    leftLine.style.transform = `translate(calc(-50% - ${gap}px), -50%)`;
    leftLine.style.width = `${lineLength}px`;
    leftLine.style.height = `${lineThickness}px`;
    leftLine.style.backgroundColor = color;
    leftLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(leftLine);
    
    // Right line (extends rightward from gap)
    const rightLine = document.createElement('div');
    rightLine.style.position = 'absolute';
    rightLine.style.top = '50%';
    rightLine.style.left = '50%';
    rightLine.style.transform = `translate(calc(-50% + ${gap}px), -50%)`;
    rightLine.style.width = `${lineLength}px`;
    rightLine.style.height = `${lineThickness}px`;
    rightLine.style.backgroundColor = color;
    rightLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(rightLine);
}

function createClassicCrossCrosshair(config, expansion, color) {
    const gap = config.baseSize + expansion * 0.3; // Gap expands slightly
    const lineLength = config.lineLength + expansion * 0.7; // Lines extend more
    const lineThickness = 2;
    
    // Center dot
    const centerDot = document.createElement('div');
    centerDot.style.position = 'absolute';
    centerDot.style.top = '50%';
    centerDot.style.left = '50%';
    centerDot.style.transform = 'translate(-50%, -50%)';
    centerDot.style.width = '3px';
    centerDot.style.height = '3px';
    centerDot.style.borderRadius = '50%';
    centerDot.style.backgroundColor = color;
    centerDot.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(centerDot);
    
    // Top line (extends upward from gap)
    const topLine = document.createElement('div');
    topLine.style.position = 'absolute';
    topLine.style.top = '50%';
    topLine.style.left = '50%';
    topLine.style.transform = `translate(-50%, calc(-50% - ${gap}px))`;
    topLine.style.width = `${lineThickness}px`;
    topLine.style.height = `${lineLength}px`;
    topLine.style.backgroundColor = color;
    topLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(topLine);
    
    // Bottom line (extends downward from gap)
    const bottomLine = document.createElement('div');
    bottomLine.style.position = 'absolute';
    bottomLine.style.top = '50%';
    bottomLine.style.left = '50%';
    bottomLine.style.transform = `translate(-50%, calc(-50% + ${gap}px))`;
    bottomLine.style.width = `${lineThickness}px`;
    bottomLine.style.height = `${lineLength}px`;
    bottomLine.style.backgroundColor = color;
    bottomLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(bottomLine);
    
    // Left line (extends leftward from gap)
    const leftLine = document.createElement('div');
    leftLine.style.position = 'absolute';
    leftLine.style.top = '50%';
    leftLine.style.left = '50%';
    leftLine.style.transform = `translate(calc(-50% - ${gap}px), -50%)`;
    leftLine.style.width = `${lineLength}px`;
    leftLine.style.height = `${lineThickness}px`;
    leftLine.style.backgroundColor = color;
    leftLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(leftLine);
    
    // Right line (extends rightward from gap)
    const rightLine = document.createElement('div');
    rightLine.style.position = 'absolute';
    rightLine.style.top = '50%';
    rightLine.style.left = '50%';
    rightLine.style.transform = `translate(calc(-50% + ${gap}px), -50%)`;
    rightLine.style.width = `${lineLength}px`;
    rightLine.style.height = `${lineThickness}px`;
    rightLine.style.backgroundColor = color;
    rightLine.style.boxShadow = `0 0 2px ${color}`;
    crosshairElement.appendChild(rightLine);
}

function createCircleCrosshair(size, color, expansion) {
    const circleSize = size * 2 + expansion;
    const circle = document.createElement('div');
    circle.style.position = 'absolute';
    circle.style.top = '50%';
    circle.style.left = '50%';
    circle.style.transform = 'translate(-50%, -50%)';
    circle.style.width = `${circleSize}px`;
    circle.style.height = `${circleSize}px`;
    circle.style.border = `2px solid ${color}`;
    circle.style.borderRadius = '50%';
    circle.style.boxShadow = `0 0 4px ${color}`;
    crosshairElement.appendChild(circle);
    
    // Add center dot
    const center = document.createElement('div');
    center.style.position = 'absolute';
    center.style.top = '50%';
    center.style.left = '50%';
    center.style.transform = 'translate(-50%, -50%)';
    center.style.width = '3px';
    center.style.height = '3px';
    center.style.borderRadius = '50%';
    center.style.backgroundColor = color;
    crosshairElement.appendChild(center);
}

function createDiamondCrosshair(size, color, expansion) {
    const diamondSize = size + expansion;
    const diamond = document.createElement('div');
    diamond.style.position = 'absolute';
    diamond.style.top = '50%';
    diamond.style.left = '50%';
    diamond.style.transform = 'translate(-50%, -50%) rotate(45deg)';
    diamond.style.width = `${diamondSize}px`;
    diamond.style.height = `${diamondSize}px`;
    diamond.style.border = `2px solid ${color}`;
    diamond.style.boxShadow = `0 0 4px ${color}`;
    crosshairElement.appendChild(diamond);
}

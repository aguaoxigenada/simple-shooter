import * as THREE from 'three';
import { SCENES, switchScene } from '../core/sceneManager.js';
import { scene, camera, renderer } from '../core/scene.js';
import { gameState } from '../core/gameState.js';
import { WEAPON_TYPES } from '../systems/weapon.js';

let uiContainer = null;
let playerPreviewScene = null;
let playerPreviewCamera = null;
let playerPreviewRenderer = null;
let playerModel = null;
let playerHead = null;
let playerBody = null;
let leftArm = null;
let rightArm = null;
let previewContainer = null;
let selectedWeapon = null;
let isShopMode = false;
let ownedWeapons = new Set([WEAPON_TYPES.PISTOL, WEAPON_TYPES.ASSAULT_RIFLE, WEAPON_TYPES.SHOTGUN]);
let purchasedItems = new Set();
let animationFrameId = null;
let mouseX = 0;
let mouseY = 0;
let targetRotationY = 0;
let currentRotationY = 0;
let lastValidTargetRotationY = 0;

// Load owned weapons and purchases from localStorage
function loadWeaponData() {
    if (typeof window !== 'undefined' && window.localStorage) {
        const savedOwned = window.localStorage.getItem('ss_ownedWeapons');
        const savedPurchased = window.localStorage.getItem('ss_purchasedItems');
        if (savedOwned) {
            ownedWeapons = new Set(JSON.parse(savedOwned));
        }
        if (savedPurchased) {
            purchasedItems = new Set(JSON.parse(savedPurchased));
            // If rocket launcher is purchased, add it to owned weapons
            if (purchasedItems.has('rocket_launcher')) {
                ownedWeapons.add(WEAPON_TYPES.ROCKET_LAUNCHER);
            }
        }
    }
}

function saveWeaponData() {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('ss_ownedWeapons', JSON.stringify([...ownedWeapons]));
        window.localStorage.setItem('ss_purchasedItems', JSON.stringify([...purchasedItems]));
    }
}

// Initialize tokens if needed
function loadTokens() {
    if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('ss_tokens');
        if (saved) {
            gameState.tokens = parseInt(saved, 10) || 0;
        } else {
            gameState.tokens = 1000; // Starting tokens
        }
    } else {
        gameState.tokens = 1000;
    }
}

function saveTokens() {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('ss_tokens', String(gameState.tokens));
    }
}

const WEAPON_INFO = {
    [WEAPON_TYPES.PISTOL]: {
        name: 'Mk2 Pistol',
        color: '#FFFFFF',
        icon: '🔫'
    },
    [WEAPON_TYPES.ASSAULT_RIFLE]: {
        name: 'VX-90 Assault Rifle',
        color: '#FFAA00',
        icon: '⚔️'
    },
    [WEAPON_TYPES.SHOTGUN]: {
        name: 'Riot Shotgun',
        color: '#FFFF00',
        icon: '💥'
    },
    [WEAPON_TYPES.ROCKET_LAUNCHER]: {
        name: 'Thunderbolt Launcher',
        color: '#FF6600',
        icon: '🚀',
        cost: 1250
    }
};

export function init() {
    loadWeaponData();
    loadTokens();
    
    // Set default selected weapon
    selectedWeapon = WEAPON_TYPES.ASSAULT_RIFLE;
    
    // Create UI container
    uiContainer = document.createElement('div');
    uiContainer.id = 'weapon-selection-container';
    uiContainer.style.position = 'fixed';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.display = 'flex';
    uiContainer.style.flexDirection = 'column';
    uiContainer.style.alignItems = 'center';
    uiContainer.style.justifyContent = 'center';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    uiContainer.style.zIndex = '1000';
    document.body.appendChild(uiContainer);
    
    // Create player preview area with 3D renderer (at the top)
    previewContainer = document.createElement('div');
    previewContainer.id = 'player-preview-container';
    previewContainer.style.width = '400px';
    previewContainer.style.height = '400px';
    previewContainer.style.marginBottom = '40px';
    previewContainer.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    previewContainer.style.borderRadius = '10px';
    previewContainer.style.backgroundColor = 'rgba(20, 20, 20, 0.8)';
    previewContainer.style.position = 'relative';
    previewContainer.style.overflow = 'hidden';
    previewContainer.style.display = 'block';
    previewContainer.style.cursor = 'none';
    uiContainer.appendChild(previewContainer);
    
    // Track mouse position for avatar head tracking (use full window/canvas)
    const handleMouseMove = (e) => {
        // Use center of screen as reference point
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        mouseX = e.clientX - centerX;
        mouseY = e.clientY - centerY;
        
        // Add dead zone near center to prevent glitch when crossing exact middle
        const deadZone = 10; // pixels
        
        if (Math.abs(mouseX) < deadZone) {
            // When very close to center horizontally, maintain last valid angle (no updates)
            // This prevents glitch when crossing exact middle
            targetRotationY = lastValidTargetRotationY;
        } else {
            // Map horizontal mouse position to rotation
            // Left (negative mouseX) → clockwise (negative rotation)
            // Right (positive mouseX) → counter-clockwise (positive rotation)
            const maxRotation = Math.PI; // Maximum rotation angle
            const screenHalfWidth = window.innerWidth / 2;
            // Scale mouseX to rotation range: -maxRotation to +maxRotation
            const newAngle = (mouseX / screenHalfWidth) * maxRotation;
            
            // Clamp to reasonable range
            const clampedAngle = Math.max(-maxRotation, Math.min(maxRotation, newAngle));
            
            // Handle angle wrapping to prevent 360-degree jumps
            // Normalize the angle difference to find shortest path
            let angleDiff = clampedAngle - lastValidTargetRotationY;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            targetRotationY = lastValidTargetRotationY + angleDiff;
            lastValidTargetRotationY = targetRotationY;
        }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    // Store handler for cleanup
    previewContainer.userData = { mouseMoveHandler: handleMouseMove };
    
    // Create 3D scene for player preview
    playerPreviewScene = new THREE.Scene();
    playerPreviewScene.background = new THREE.Color(0x1a1a1a);
    
    // Create camera for preview
    playerPreviewCamera = new THREE.PerspectiveCamera(45, 400 / 400, 0.1, 100);
    playerPreviewCamera.position.set(0, 1.6, 3);
    playerPreviewCamera.lookAt(0, 1.6, 0);
    
    // Create renderer for preview
    playerPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    playerPreviewRenderer.setSize(400, 400);
    playerPreviewRenderer.setPixelRatio(window.devicePixelRatio);
    playerPreviewRenderer.domElement.style.display = 'block';
    playerPreviewRenderer.domElement.style.width = '100%';
    playerPreviewRenderer.domElement.style.height = '100%';
    previewContainer.appendChild(playerPreviewRenderer.domElement);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    playerPreviewScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 5, 3);
    directionalLight.castShadow = true;
    playerPreviewScene.add(directionalLight);
    
    // Create player model (similar to PlayerRenderer)
    const playerGroup = new THREE.Group();
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // Skin tone
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    playerHead = head;
    playerGroup.add(head);
    
    // Hat on head
    const hatGeometry = new THREE.CylinderGeometry(0.32, 0.35, 0.15, 16);
    const hatMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 }); // Dark blue/gray hat
    const hat = new THREE.Mesh(hatGeometry, hatMaterial);
    hat.position.y = 1.65; // On top of head
    hat.rotation.x = Math.PI / 2; // Rotate to sit on head
    playerGroup.add(hat);
    
    // Hat brim
    const brimGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16);
    const brimMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    const brim = new THREE.Mesh(brimGeometry, brimMaterial);
    brim.position.y = 1.58;
    brim.rotation.x = Math.PI / 2;
    playerGroup.add(brim);
    
    // Body
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0066CC }); // Blue body
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    playerBody = body;
    playerGroup.add(body);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x0066CC });
    
    leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 0.8, 0);
    leftArm.rotation.z = Math.PI / 6;
    playerGroup.add(leftArm);
    
    rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 0.8, 0);
    rightArm.rotation.z = -Math.PI / 6;
    playerGroup.add(rightArm);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark legs
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, -0.2, 0);
    playerGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, -0.2, 0);
    playerGroup.add(rightLeg);
    
    playerModel = playerGroup;
    playerPreviewScene.add(playerGroup);
    
    // Render immediately to show the player
    if (playerPreviewRenderer && playerPreviewScene && playerPreviewCamera) {
        playerPreviewRenderer.render(playerPreviewScene, playerPreviewCamera);
    }
    
    // Start rotation animation
    animatePlayerPreview();
    
    // Title (above weapon choices, below player avatar)
    const title = document.createElement('div');
    title.id = 'weapon-selection-title';
    title.textContent = isShopMode ? 'SHOP' : 'SELECT WEAPON';
    title.style.fontSize = '32px';
    title.style.fontWeight = 'bold';
    title.style.color = 'white';
    title.style.fontFamily = 'monospace';
    title.style.marginBottom = '30px';
    title.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
    uiContainer.appendChild(title);
    
    // Weapon/Shop items container
    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'weapon-items-container';
    itemsContainer.style.display = 'flex';
    itemsContainer.style.gap = '20px';
    itemsContainer.style.marginBottom = '30px';
    uiContainer.appendChild(itemsContainer);
    
    // Action buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '20px';
    uiContainer.appendChild(buttonsContainer);
    
    // Shop button
    const shopButton = document.createElement('button');
    shopButton.textContent = isShopMode ? 'BACK' : 'SHOP';
    shopButton.style.padding = '12px 24px';
    shopButton.style.fontSize = '18px';
    shopButton.style.fontWeight = 'bold';
    shopButton.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    shopButton.style.borderRadius = '8px';
    shopButton.style.backgroundColor = isShopMode ? 'rgba(100, 100, 100, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    shopButton.style.color = 'white';
    shopButton.style.cursor = 'pointer';
    shopButton.style.fontFamily = 'monospace';
    shopButton.addEventListener('click', toggleShop);
    buttonsContainer.appendChild(shopButton);
    
    // Ready/Start button
    const readyButton = document.createElement('button');
    readyButton.textContent = isShopMode ? '' : 'READY';
    readyButton.style.padding = '12px 40px';
    readyButton.style.fontSize = '18px';
    readyButton.style.fontWeight = 'bold';
    readyButton.style.border = '2px solid rgba(0, 255, 0, 0.8)';
    readyButton.style.borderRadius = '8px';
    readyButton.style.backgroundColor = 'rgba(0, 150, 0, 0.8)';
    readyButton.style.color = 'white';
    readyButton.style.cursor = 'pointer';
    readyButton.style.fontFamily = 'monospace';
    readyButton.style.display = isShopMode ? 'none' : 'block';
    readyButton.addEventListener('click', startMatch);
    buttonsContainer.appendChild(readyButton);
    
    // Tokens display
    const tokensDisplay = document.createElement('div');
    tokensDisplay.id = 'tokens-display';
    tokensDisplay.textContent = `Tokens: ${gameState.tokens}`;
    tokensDisplay.style.position = 'absolute';
    tokensDisplay.style.top = '20px';
    tokensDisplay.style.right = '20px';
    tokensDisplay.style.fontSize = '18px';
    tokensDisplay.style.fontWeight = 'bold';
    tokensDisplay.style.color = '#FFD700';
    tokensDisplay.style.fontFamily = 'monospace';
    uiContainer.appendChild(tokensDisplay);
    
    updateDisplay();
}

function toggleShop() {
    isShopMode = !isShopMode;
    updateDisplay();
}

function updateDisplay() {
    const itemsContainer = document.getElementById('weapon-items-container');
    const title = document.getElementById('weapon-selection-title');
    const shopButton = uiContainer.querySelector('button');
    const readyButton = Array.from(uiContainer.querySelectorAll('button'))[1];
    const tokensDisplay = document.getElementById('tokens-display');
    
    if (!itemsContainer) return;
    
    // Clear items
    itemsContainer.innerHTML = '';
    
    // Update title
    if (title) {
        title.textContent = isShopMode ? 'SHOP' : 'SELECT WEAPON';
    }
    
    // Update shop button
    if (shopButton) {
        shopButton.textContent = isShopMode ? 'BACK' : 'SHOP';
        shopButton.style.backgroundColor = isShopMode ? 'rgba(100, 100, 100, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    }
    
    // Update ready button visibility
    if (readyButton) {
        readyButton.style.display = isShopMode ? 'none' : 'block';
    }
    
    // Update tokens display
    if (tokensDisplay) {
        tokensDisplay.textContent = `Tokens: ${gameState.tokens}`;
    }
    
    if (isShopMode) {
        // Show shop items
        const rocketLauncher = WEAPON_INFO[WEAPON_TYPES.ROCKET_LAUNCHER];
        const isOwned = ownedWeapons.has(WEAPON_TYPES.ROCKET_LAUNCHER);
        
        const itemCard = createShopItemCard(rocketLauncher, isOwned);
        itemsContainer.appendChild(itemCard);
    } else {
        // Show weapon selection
        const availableWeapons = Array.from(ownedWeapons).filter(w => w !== WEAPON_TYPES.ROCKET_LAUNCHER || ownedWeapons.has(WEAPON_TYPES.ROCKET_LAUNCHER));
        
        availableWeapons.forEach(weaponType => {
            const weaponCard = createWeaponCard(weaponType);
            itemsContainer.appendChild(weaponCard);
        });
    }
}

function createWeaponCard(weaponType) {
    const info = WEAPON_INFO[weaponType];
    const isSelected = selectedWeapon === weaponType;
    
    const card = document.createElement('div');
    card.style.width = '120px';
    card.style.height = '150px';
    card.style.border = isSelected ? '3px solid #00ff00' : '2px solid rgba(255, 255, 255, 0.3)';
    card.style.borderRadius = '10px';
    card.style.backgroundColor = isSelected ? 'rgba(0, 255, 0, 0.2)' : 'rgba(50, 50, 50, 0.8)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s ease';
    card.style.padding = '10px';
    
    card.addEventListener('mouseenter', () => {
        if (!isSelected) {
            card.style.backgroundColor = 'rgba(80, 80, 80, 0.9)';
            card.style.transform = 'scale(1.05)';
        }
    });
    
    card.addEventListener('mouseleave', () => {
        if (!isSelected) {
            card.style.backgroundColor = 'rgba(50, 50, 50, 0.8)';
            card.style.transform = 'scale(1)';
        }
    });
    
    card.addEventListener('click', () => {
        selectedWeapon = weaponType;
        updateDisplay();
    });
    
    // Icon
    const icon = document.createElement('div');
    icon.textContent = info.icon;
    icon.style.fontSize = '48px';
    icon.style.marginBottom = '10px';
    card.appendChild(icon);
    
    // Name
    const name = document.createElement('div');
    name.textContent = info.name;
    name.style.fontSize = '12px';
    name.style.color = 'white';
    name.style.fontFamily = 'monospace';
    name.style.textAlign = 'center';
    name.style.fontWeight = 'bold';
    card.appendChild(name);
    
    return card;
}

function createShopItemCard(item, isOwned) {
    const card = document.createElement('div');
    card.style.width = '300px';
    card.style.height = '200px';
    card.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    card.style.borderRadius = '10px';
    card.style.backgroundColor = isOwned ? 'rgba(0, 150, 0, 0.3)' : 'rgba(50, 50, 50, 0.8)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.padding = '20px';
    card.style.gap = '15px';
    
    // Icon
    const icon = document.createElement('div');
    icon.textContent = item.icon;
    icon.style.fontSize = '64px';
    card.appendChild(icon);
    
    // Name
    const name = document.createElement('div');
    name.textContent = item.name;
    name.style.fontSize = '20px';
    name.style.color = 'white';
    name.style.fontFamily = 'monospace';
    name.style.fontWeight = 'bold';
    card.appendChild(name);
    
    // Cost or Owned
    if (isOwned) {
        const ownedLabel = document.createElement('div');
        ownedLabel.textContent = 'OWNED';
        ownedLabel.style.fontSize = '16px';
        ownedLabel.style.color = '#00ff00';
        ownedLabel.style.fontFamily = 'monospace';
        ownedLabel.style.fontWeight = 'bold';
        card.appendChild(ownedLabel);
    } else {
        const cost = document.createElement('div');
        cost.textContent = `Cost: ${item.cost} tokens`;
        cost.style.fontSize = '16px';
        cost.style.color = '#FFD700';
        cost.style.fontFamily = 'monospace';
        card.appendChild(cost);
        
        const buyButton = document.createElement('button');
        buyButton.textContent = gameState.tokens >= item.cost ? 'BUY' : 'INSUFFICIENT TOKENS';
        buyButton.style.padding = '10px 20px';
        buyButton.style.fontSize = '14px';
        buyButton.style.fontWeight = 'bold';
        buyButton.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        buyButton.style.borderRadius = '8px';
        buyButton.style.backgroundColor = gameState.tokens >= item.cost ? 'rgba(0, 200, 0, 0.8)' : 'rgba(200, 0, 0, 0.8)';
        buyButton.style.color = 'white';
        buyButton.style.cursor = gameState.tokens >= item.cost ? 'pointer' : 'not-allowed';
        buyButton.style.fontFamily = 'monospace';
        buyButton.disabled = gameState.tokens < item.cost;
        
        buyButton.addEventListener('click', () => {
            if (gameState.tokens >= item.cost) {
                gameState.tokens -= item.cost;
                purchasedItems.add('rocket_launcher');
                ownedWeapons.add(WEAPON_TYPES.ROCKET_LAUNCHER);
                saveWeaponData();
                saveTokens();
                updateDisplay();
            }
        });
        
        card.appendChild(buyButton);
    }
    
    return card;
}

function startMatch() {
    if (!selectedWeapon) {
        alert('Please select a weapon');
        return;
    }
    
    // Save selected weapon to gameState
    gameState.selectedWeapon = selectedWeapon;
    
    // Switch to lobby (which will eventually go to playground)
    switchScene(SCENES.LOBBY);
}

function animatePlayerPreview() {
    if (playerModel) {
        // Smoothly interpolate entire body rotation towards mouse direction
        const rotationSpeed = 0.12;
        
        // Normalize angle difference for smooth interpolation (handle wrapping)
        let angleDiff = targetRotationY - currentRotationY;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        currentRotationY += angleDiff * rotationSpeed;
        
        // Rotate entire player model (body, arms, legs all rotate together)
        playerModel.rotation.y = currentRotationY;
        
        // Head follows mouse more closely (faster response, independent of body)
        if (playerHead) {
            const headRotationSpeed = 0.18;
            const headTargetY = targetRotationY;
            let headCurrentY = playerHead.rotation.y + currentRotationY; // Get absolute head rotation
            // Normalize angles for smooth interpolation
            let headAngleDiff = headTargetY - headCurrentY;
            while (headAngleDiff > Math.PI) headAngleDiff -= 2 * Math.PI;
            while (headAngleDiff < -Math.PI) headAngleDiff += 2 * Math.PI;
            headCurrentY += headAngleDiff * headRotationSpeed;
            // Head rotation is relative to body, so subtract body rotation
            playerHead.rotation.y = headCurrentY - currentRotationY;
            
            // Add slight head tilt based on vertical mouse position
            const maxTilt = 0.25;
            const tiltAmount = Math.max(-maxTilt, Math.min(maxTilt, mouseY / 200));
            playerHead.rotation.x = tiltAmount * 0.3;
        }
        
        // Arms move slightly to accompany body rotation (subtle sway)
        if (leftArm && rightArm) {
            const swayAmount = Math.sin(currentRotationY) * 0.15;
            leftArm.rotation.z = Math.PI / 6 + swayAmount * 0.3;
            rightArm.rotation.z = -Math.PI / 6 + swayAmount * 0.3;
        }
    }
    
    if (playerPreviewRenderer && playerPreviewScene && playerPreviewCamera) {
        playerPreviewRenderer.render(playerPreviewScene, playerPreviewCamera);
    }
    
    animationFrameId = requestAnimationFrame(animatePlayerPreview);
}

export function update(deltaTime) {
    // Animation handled by requestAnimationFrame
}

export function render(renderer, camera, scene) {
    // UI is HTML-based, no 3D rendering needed
}

export function cleanup() {
    // Remove mouse event listener
    if (previewContainer && previewContainer.userData && previewContainer.userData.mouseMoveHandler) {
        window.removeEventListener('mousemove', previewContainer.userData.mouseMoveHandler);
    }
    
    // Stop animation
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Clean up 3D resources
    if (playerModel) {
        playerModel.traverse((object) => {
            if (object.isMesh) {
                object.geometry?.dispose?.();
                object.material?.dispose?.();
            }
        });
        if (playerPreviewScene) {
            playerPreviewScene.remove(playerModel);
        }
        playerModel = null;
    }
    
    if (playerPreviewRenderer) {
        playerPreviewRenderer.dispose();
        if (playerPreviewRenderer.domElement && playerPreviewRenderer.domElement.parentNode) {
            playerPreviewRenderer.domElement.parentNode.removeChild(playerPreviewRenderer.domElement);
        }
        playerPreviewRenderer = null;
    }
    
    playerPreviewScene = null;
    playerPreviewCamera = null;
    previewContainer = null;
    
    if (uiContainer) {
        document.body.removeChild(uiContainer);
        uiContainer = null;
    }
    selectedWeapon = null;
    isShopMode = false;
}

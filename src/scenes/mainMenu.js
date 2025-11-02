import { SCENES, switchScene } from '../core/sceneManager.js';
import { createButton } from '../ui/button.js';

let uiContainer = null;
let buttons = [];

export function init() {
    // Create UI container for menu
    uiContainer = document.createElement('div');
    uiContainer.id = 'menu-container';
    uiContainer.style.position = 'fixed';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.display = 'flex';
    uiContainer.style.flexDirection = 'column';
    uiContainer.style.alignItems = 'center';
    uiContainer.style.justifyContent = 'center';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    uiContainer.style.zIndex = '1000';
    document.body.appendChild(uiContainer);
    
    // Title
    const title = document.createElement('div');
    title.textContent = 'SIMPLE SHOOTER';
    title.style.fontSize = '64px';
    title.style.fontWeight = 'bold';
    title.style.color = 'white';
    title.style.fontFamily = 'monospace';
    title.style.marginBottom = '60px';
    title.style.textShadow = '4px 4px 8px rgba(0, 0, 0, 0.8)';
    uiContainer.appendChild(title);
    
    // Play button (use flex positioning instead of absolute)
    const playButton = document.createElement('div');
    playButton.textContent = 'PLAY';
    playButton.style.width = '300px';
    playButton.style.height = '60px';
    playButton.style.backgroundColor = 'rgba(50, 50, 50, 0.8)';
    playButton.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    playButton.style.borderRadius = '8px';
    playButton.style.color = 'white';
    playButton.style.fontSize = '24px';
    playButton.style.fontWeight = 'bold';
    playButton.style.fontFamily = 'monospace';
    playButton.style.cursor = 'pointer';
    playButton.style.display = 'flex';
    playButton.style.alignItems = 'center';
    playButton.style.justifyContent = 'center';
    playButton.style.textAlign = 'center';
    playButton.style.transition = 'all 0.2s ease';
    playButton.style.userSelect = 'none';
    
    // Hover effects
    playButton.addEventListener('mouseenter', () => {
        playButton.style.backgroundColor = 'rgba(80, 80, 80, 0.9)';
        playButton.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        playButton.style.transform = 'scale(1.05)';
    });
    
    playButton.addEventListener('mouseleave', () => {
        playButton.style.backgroundColor = 'rgba(50, 50, 50, 0.8)';
        playButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        playButton.style.transform = 'scale(1)';
    });
    
    // Click handler
    playButton.addEventListener('click', () => {
        console.log('Play button clicked, switching to game scene');
        switchScene(SCENES.GAME);
    });
    
    uiContainer.appendChild(playButton);
    buttons.push(playButton);
}

export function update(deltaTime) {
    // Menu doesn't need update logic
}

export function render(renderer, camera, scene) {
    // Menu is HTML-based, no 3D rendering needed
}

export function cleanup() {
    if (uiContainer) {
        document.body.removeChild(uiContainer);
        uiContainer = null;
        buttons = [];
    }
}

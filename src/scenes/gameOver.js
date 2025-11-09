import { SCENES, switchScene } from '../core/sceneManager.js';
import { createButton } from '../ui/button.js';
import { gameState } from '../core/gameState.js';

let uiContainer = null;
let buttons = [];

export function init() {
    // Create UI container
    uiContainer = document.createElement('div');
    uiContainer.id = 'gameover-container';
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
    
    // Game Over title
    const title = document.createElement('div');
    title.textContent = 'GAME OVER';
    title.style.fontSize = '72px';
    title.style.fontWeight = 'bold';
    title.style.color = '#ff0000';
    title.style.fontFamily = 'monospace';
    title.style.marginBottom = '30px';
    title.style.textShadow = '4px 4px 8px rgba(0, 0, 0, 0.8)';
    uiContainer.appendChild(title);
    
    // Stats
    const stats = document.createElement('div');
    stats.style.fontSize = '24px';
    stats.style.color = 'white';
    stats.style.fontFamily = 'monospace';
    stats.style.marginBottom = '60px';
    stats.style.textAlign = 'center';
    const defeatedBy = gameState.matchKillerId
        ? `Eliminated by ${gameState.matchKillerId}`
        : 'Try again soon!';

    stats.innerHTML = `
        <div>${defeatedBy}</div>
        <div style="margin-top: 10px;">Kills: ${gameState.kills}</div>
    `;
    uiContainer.appendChild(stats);
    
    // Main Menu button
    const menuButton = createButton(
        'MAIN MENU',
        window.innerWidth / 2 - 150,
        window.innerHeight / 2 + 90,
        300,
        60,
        () => {
            switchScene(SCENES.MAIN_MENU);
        }
    );
    uiContainer.appendChild(menuButton);
    buttons.push(menuButton);
}

export function update(deltaTime) {
    // Game Over screen doesn't need update logic
}

export function render(renderer, camera, scene) {
    // Game Over is HTML-based, no 3D rendering needed
}

export function cleanup() {
    if (uiContainer) {
        document.body.removeChild(uiContainer);
        uiContainer = null;
        buttons = [];
    }
}

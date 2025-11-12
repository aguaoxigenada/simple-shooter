import { SCENES, switchScene } from '../core/sceneManager.js';

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
    
    const buttonStack = document.createElement('div');
    buttonStack.style.display = 'flex';
    buttonStack.style.flexDirection = 'column';
    buttonStack.style.alignItems = 'center';
    buttonStack.style.gap = '24px';
    uiContainer.appendChild(buttonStack);

    function createMenuButton(label, subtitle, onClick) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';

        const button = document.createElement('div');
        button.textContent = label;
        button.style.width = '320px';
        button.style.height = '60px';
        button.style.backgroundColor = 'rgba(50, 50, 50, 0.85)';
        button.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        button.style.borderRadius = '10px';
        button.style.color = 'white';
        button.style.fontSize = '24px';
        button.style.fontWeight = 'bold';
        button.style.fontFamily = 'monospace';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.textAlign = 'center';
        button.style.transition = 'all 0.2s ease';
        button.style.userSelect = 'none';

        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = 'rgba(80, 80, 80, 0.95)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.8)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = 'rgba(50, 50, 50, 0.85)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            button.style.transform = 'scale(1)';
        });

        button.addEventListener('click', onClick);

        const description = document.createElement('div');
        description.textContent = subtitle;
        description.style.color = 'rgba(255, 255, 255, 0.8)';
        description.style.fontSize = '16px';
        description.style.fontFamily = 'monospace';

        wrapper.appendChild(button);
        wrapper.appendChild(description);
        buttonStack.appendChild(wrapper);
        buttons.push(button);
        return button;
    }

    createMenuButton(
        'ARENA (MULTIPLAYER)',
        'Join the lobby and battle other players online.',
        () => {
            console.log('Arena button clicked, switching to weapon selection scene');
            switchScene(SCENES.WEAPON_SELECTION);
        }
    );

    createMenuButton(
        'TEST RANGE',
        'Jump straight into the sandbox environment.',
        () => {
            console.log('Test range button clicked, switching to playground scene');
            switchScene(SCENES.PLAYGROUND);
        }
    );
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

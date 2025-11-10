// Scene manager for handling scene transitions
export const SCENES = {
    MAIN_MENU: 'mainMenu',
    GAME: 'game',
    GAME_OVER: 'gameOver',
    VICTORY: 'victory',
    PLAYGROUND: 'playground',
    LOBBY: 'lobby'
};

let currentScene = null;
let sceneInstances = {};

export function registerScene(sceneName, sceneInstance) {
    sceneInstances[sceneName] = sceneInstance;
}

export function switchScene(sceneName) {
    if (!sceneInstances[sceneName]) {
        console.error(`Scene ${sceneName} not registered`);
        return;
    }
    
    // Clean up current scene
    if (currentScene && currentScene.cleanup) {
        currentScene.cleanup();
    }
    
    // Switch to new scene
    currentScene = sceneInstances[sceneName];
    
    // Initialize new scene
    if (currentScene && currentScene.init) {
        currentScene.init();
    }
}

export function getCurrentScene() {
    return currentScene;
}

export function updateScene(deltaTime) {
    if (currentScene && currentScene.update) {
        currentScene.update(deltaTime);
    }
}

export function renderScene(renderer, camera, scene) {
    if (currentScene && currentScene.render) {
        currentScene.render(renderer, camera, scene);
    }
}

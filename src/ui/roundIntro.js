let overlay = null;
let loadoutLabel = null;
let countdownLabel = null;

function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0, 0, 0, 0.65)';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = 'monospace';
    overlay.style.zIndex = '1900';
    overlay.style.pointerEvents = 'none';

    const title = document.createElement('div');
    title.textContent = 'Loadout Locked';
    title.style.fontSize = '32px';
    title.style.letterSpacing = '4px';
    title.style.marginBottom = '16px';
    overlay.appendChild(title);

    loadoutLabel = document.createElement('div');
    loadoutLabel.style.fontSize = '20px';
    loadoutLabel.style.marginBottom = '10px';
    overlay.appendChild(loadoutLabel);

    countdownLabel = document.createElement('div');
    countdownLabel.style.fontSize = '26px';
    countdownLabel.style.color = '#f1c40f';
    overlay.appendChild(countdownLabel);

    document.body.appendChild(overlay);
}

export function showRoundIntro({ primaryWeaponName, utilityItems = [], countdown = 3 }) {
    ensureOverlay();
    overlay.style.display = 'flex';
    const utilities = utilityItems.length ? `Utility: ${utilityItems.map((u) => u.name).join(', ')}` : 'Utility: None';
    loadoutLabel.textContent = `Primary: ${primaryWeaponName || 'Default'} | ${utilities}`;
    countdownLabel.textContent = `Round begins in ${Math.ceil(countdown)}s`;
}

export function updateRoundIntroCountdown(seconds) {
    if (!overlay || overlay.style.display === 'none') return;
    const remaining = Math.max(0, Math.ceil(seconds));
    countdownLabel.textContent = `Round begins in ${remaining}s`;
}

export function hideRoundIntro() {
    if (overlay) {
        overlay.style.display = 'none';
    }
}

let overlay = null;
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
    title.textContent = 'Round Starting';
    title.style.fontSize = '32px';
    title.style.letterSpacing = '4px';
    title.style.marginBottom = '16px';
    overlay.appendChild(title);

    countdownLabel = document.createElement('div');
    countdownLabel.style.fontSize = '26px';
    countdownLabel.style.color = '#f1c40f';
    overlay.appendChild(countdownLabel);

    document.body.appendChild(overlay);
}

export function showRoundIntro({ countdown = 3 }) {
    ensureOverlay();
    overlay.style.display = 'flex';
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

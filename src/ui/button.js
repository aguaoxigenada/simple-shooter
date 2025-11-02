// Simple button component for UI
export function createButton(text, x, y, width, height, onClick) {
    const button = document.createElement('div');
    button.textContent = text;
    button.style.position = 'absolute';
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.width = `${width}px`;
    button.style.height = `${height}px`;
    button.style.backgroundColor = 'rgba(50, 50, 50, 0.8)';
    button.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    button.style.borderRadius = '8px';
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
    
    // Hover effects
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'rgba(80, 80, 80, 0.9)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        button.style.transform = 'scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'rgba(50, 50, 50, 0.8)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        button.style.transform = 'scale(1)';
    });
    
    // Click handler
    button.addEventListener('click', onClick);
    
    return button;
}

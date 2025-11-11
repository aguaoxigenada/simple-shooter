import { gameState } from '../core/gameState.js';

const SHOP_CATEGORIES = [
    {
        id: 'primary',
        label: 'Primary',
        items: [
            {
                id: 'assault_rifle',
                name: 'VX-90 Assault Rifle',
                cost: 900,
                description: 'Balanced automatic rifle. Medium recoil, high DPS.',
                weaponType: 'assault_rifle',
                stats: 'Damage 50 | ROF 0.1s | Capacity 30'
            },
            {
                id: 'shotgun',
                name: 'Riot Shotgun',
                cost: 750,
                description: 'Close-range powerhouse. High damage, short range.',
                weaponType: 'shotgun',
                stats: 'Damage 80 | ROF 0.8s | Capacity 8 | Range 15m'
            },
            {
                id: 'rocket_launcher',
                name: 'Thunderbolt Launcher',
                cost: 1250,
                description: 'Single-shot explosive launcher. Massive splash damage.',
                weaponType: 'rocket_launcher',
                stats: 'Damage 100 | ROF 1.5s | Capacity 1'
            }
        ]
    },
    {
        id: 'secondary',
        label: 'Secondary',
        items: [
            {
                id: 'pistol',
                name: 'Mk2 Pistol',
                cost: 300,
                description: 'Semi-auto sidearm. Reliable backup weapon.',
                weaponType: 'pistol',
                stats: 'Damage 40 | ROF 0.5s | Capacity 6'
            }
        ]
    },
    {
        id: 'utility',
        label: 'Utility',
        items: [
            {
                id: 'light_armor',
                name: 'Light Armor',
                cost: 400,
                description: 'Reduces incoming damage by 15%. (Placeholder effect)',
                weaponType: null,
                stats: 'Durability 50'
            },
            {
                id: 'stim',
                name: 'Stim Pack',
                cost: 250,
                description: 'Regenerates stamina faster. (Placeholder effect)',
                weaponType: null,
                stats: 'Stamina Regen +25%'
            }
        ]
    }
];

const ITEM_LOOKUP = SHOP_CATEGORIES.flatMap((category) => category.items).reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
}, {});

let container = null;
let overlay = null;
let categoryColumn = null;
let itemsColumn = null;
let detailsPanel = null;
let countdownLabel = null;
let tokensLabel = null;
let buyButton = null;
let closeButton = null;
let favoritesContainer = null;
let favoriteButtons = [];
let feedbackLabel = null;

let currentTokens = 0;
let onPurchaseCallback = null;
let onCloseCallback = null;
let selectedItem = null;
let isOpen = false;
let favorites = null;
let audioCtx = null;

const FAVORITE_SLOTS = 2;

function playTone(frequency = 440, duration = 0.15, volume = 0.2) {
    if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new Ctx();
        }
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    } catch {
        // Ignore audio initialization failures (e.g., user gesture not yet received)
    }
}

function loadFavorites() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { slot1: null, slot2: null };
    }
    try {
        const raw = window.localStorage.getItem('ss_favorite_items');
        if (!raw) return { slot1: null, slot2: null };
        const parsed = JSON.parse(raw);
        return {
            slot1: parsed.slot1 || null,
            slot2: parsed.slot2 || null
        };
    } catch {
        return { slot1: null, slot2: null };
    }
}

function saveFavorites() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem('ss_favorite_items', JSON.stringify(favorites));
}

function ensureContainer() {
    if (container) return;

    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';

    container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '220px 340px 280px';
    container.style.gap = '20px';
    container.style.padding = '24px 28px';
    container.style.background = 'rgba(20, 24, 32, 0.95)';
    container.style.borderRadius = '16px';
    container.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    container.style.boxShadow = '0 30px 80px rgba(0,0,0,0.5)';
    container.style.fontFamily = 'monospace';
    container.style.color = '#e0e6ff';

    const header = document.createElement('div');
    header.style.gridColumn = '1 / span 3';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '12px';

    const title = document.createElement('div');
    title.textContent = 'BUY PHASE';
    title.style.fontSize = '28px';
    title.style.letterSpacing = '3px';
    title.style.fontWeight = 'bold';

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '16px';

    countdownLabel = document.createElement('div');
    countdownLabel.textContent = '';
    countdownLabel.style.fontSize = '16px';
    countdownLabel.style.color = '#f1c40f';

    tokensLabel = document.createElement('div');
    tokensLabel.textContent = 'Credits: 0';
    tokensLabel.style.fontSize = '18px';
    tokensLabel.style.color = '#74d99f';

    closeButton = document.createElement('button');
    closeButton.textContent = 'Lock In';
    closeButton.style.padding = '10px 18px';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '6px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.background = '#3d7cff';
    closeButton.style.color = '#fff';
    closeButton.style.fontSize = '14px';
    closeButton.style.fontWeight = 'bold';
    closeButton.addEventListener('click', () => closeBuyMenu(true));

    headerRight.appendChild(countdownLabel);
    headerRight.appendChild(tokensLabel);
    headerRight.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(headerRight);

    favoritesContainer = document.createElement('div');
    favoritesContainer.style.gridColumn = '1 / span 3';
    favoritesContainer.style.display = 'flex';
    favoritesContainer.style.alignItems = 'center';
    favoritesContainer.style.gap = '12px';
    favoritesContainer.style.marginBottom = '6px';

    const favoritesLabel = document.createElement('div');
    favoritesLabel.textContent = 'Quick Buy';
    favoritesLabel.style.fontWeight = 'bold';
    favoritesLabel.style.color = '#ffffff';
    favoritesContainer.appendChild(favoritesLabel);

    categoryColumn = document.createElement('div');
    categoryColumn.style.display = 'flex';
    categoryColumn.style.flexDirection = 'column';
    categoryColumn.style.gap = '10px';

    itemsColumn = document.createElement('div');
    itemsColumn.style.display = 'flex';
    itemsColumn.style.flexDirection = 'column';
    itemsColumn.style.gap = '10px';
    itemsColumn.style.maxHeight = '360px';
    itemsColumn.style.overflowY = 'auto';
    itemsColumn.style.paddingRight = '6px';

    detailsPanel = document.createElement('div');
    detailsPanel.style.display = 'flex';
    detailsPanel.style.flexDirection = 'column';
    detailsPanel.style.gap = '12px';
    detailsPanel.style.background = 'rgba(10, 12, 20, 0.75)';
    detailsPanel.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    detailsPanel.style.borderRadius = '12px';
    detailsPanel.style.padding = '18px';

    const noSelection = document.createElement('div');
    noSelection.textContent = 'Select a weapon or utility on the left.';
    noSelection.style.opacity = '0.7';
    detailsPanel.appendChild(noSelection);

    buyButton = document.createElement('button');
    buyButton.textContent = 'Purchase';
    buyButton.style.padding = '12px 16px';
    buyButton.style.fontSize = '16px';
    buyButton.style.border = 'none';
    buyButton.style.borderRadius = '8px';
    buyButton.style.cursor = 'pointer';
    buyButton.style.background = '#2ecc71';
    buyButton.style.color = '#0d151f';
    buyButton.style.fontWeight = 'bold';
    buyButton.disabled = true;
    buyButton.style.opacity = '0.5';
    buyButton.addEventListener('click', handleBuyClick);

    detailsPanel.appendChild(buyButton);

    container.appendChild(header);
    container.appendChild(favoritesContainer);
    container.appendChild(categoryColumn);
    container.appendChild(itemsColumn);
    container.appendChild(detailsPanel);

    overlay.appendChild(container);
    document.body.appendChild(overlay);
}

function renderFavorites() {
    favoriteButtons.forEach((btn) => btn.remove());
    favoriteButtons = [];
    const slotKeys = ['slot1', 'slot2'];

    slotKeys.forEach((slotKey, index) => {
        const button = document.createElement('button');
        button.dataset.slot = slotKey;
        button.style.padding = '10px 12px';
        button.style.borderRadius = '8px';
        button.style.border = '1px solid rgba(255,255,255,0.12)';
        button.style.background = 'rgba(32, 38, 56, 0.8)';
        button.style.color = '#dbe2ff';
        button.style.fontSize = '13px';
        button.style.cursor = 'pointer';
        button.style.minWidth = '160px';
        button.addEventListener('click', () => handleQuickBuy(slotKey));
        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            favorites[slotKey] = null;
            saveFavorites();
            renderFavorites();
            displayFeedback(`Favorite ${index + 1} cleared`, 'info');
        });
        favoriteButtons.push(button);
        favoritesContainer.appendChild(button);
    });

    favoriteButtons.forEach((btn, index) => {
        const slotKey = btn.dataset.slot;
        const itemId = favorites[slotKey];
        if (itemId && ITEM_LOOKUP[itemId]) {
            const item = ITEM_LOOKUP[itemId];
            btn.textContent = `Fav ${index + 1}: ${item.name} (${item.cost})`;
            btn.style.opacity = '1';
        } else {
            btn.textContent = `Fav ${index + 1}: Empty`;
            btn.style.opacity = '0.5';
        }
    });
}

function clearSelectionHighlight() {
    const active = itemsColumn.querySelector('.buy-menu-item.active');
    if (active) {
        active.classList.remove('active');
        active.style.borderColor = 'rgba(255,255,255,0.08)';
        active.style.background = 'rgba(36, 42, 61, 0.6)';
        active.style.boxShadow = 'none';
    }
}

function renderCategories() {
    categoryColumn.innerHTML = '';
    SHOP_CATEGORIES.forEach((category, index) => {
        const button = document.createElement('button');
        button.textContent = category.label;
        button.style.padding = '12px 14px';
        button.style.borderRadius = '8px';
        button.style.border = 'none';
        button.style.background = index === 0 ? '#3d7cff' : 'rgba(40, 48, 68, 0.9)';
        button.style.color = index === 0 ? '#ffffff' : '#cfd7ff';
        button.style.fontSize = '15px';
        button.style.cursor = 'pointer';
        button.style.textAlign = 'left';
        button.style.fontWeight = 'bold';
        button.style.transition = 'background 0.2s ease, transform 0.2s ease';
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateX(4px)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateX(0)';
        });
        button.addEventListener('click', () => selectCategory(category.id));
        button.dataset.categoryId = category.id;
        categoryColumn.appendChild(button);
    });
}

function selectCategory(categoryId) {
    const buttons = categoryColumn.querySelectorAll('button');
    buttons.forEach((btn) => {
        if (btn.dataset.categoryId === categoryId) {
            btn.style.background = '#3d7cff';
            btn.style.color = '#ffffff';
        } else {
            btn.style.background = 'rgba(40, 48, 68, 0.9)';
            btn.style.color = '#cfd7ff';
        }
    });

    const category = SHOP_CATEGORIES.find((cat) => cat.id === categoryId);
    renderItems(category);
}

function renderItems(category) {
    itemsColumn.innerHTML = '';
    if (!category) return;

    category.items.forEach((item) => {
        const card = document.createElement('div');
        card.classList.add('buy-menu-item');
        card.style.padding = '14px';
        card.style.borderRadius = '10px';
        card.style.border = '1px solid rgba(255,255,255,0.08)';
        card.style.background = 'rgba(36, 42, 61, 0.6)';
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.15s ease, border 0.15s ease, box-shadow 0.15s ease';
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.borderColor = 'rgba(255,255,255,0.2)';
        });
        card.addEventListener('mouseleave', () => {
            if (selectedItem !== item) {
                card.style.transform = 'translateY(0)';
                card.style.borderColor = 'rgba(255,255,255,0.08)';
            }
        });
        card.addEventListener('click', () => {
            selectItem(card, item);
        });

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.justifyContent = 'space-between';
        nameRow.style.marginBottom = '6px';

        const name = document.createElement('div');
        name.textContent = item.name;
        name.style.fontWeight = 'bold';
        name.style.fontSize = '16px';

        const cost = document.createElement('div');
        cost.textContent = `${item.cost} Credits`;
        cost.style.color = '#74d99f';

        const desc = document.createElement('div');
        desc.textContent = item.description;
        desc.style.fontSize = '13px';
        desc.style.opacity = '0.75';

        nameRow.appendChild(name);
        nameRow.appendChild(cost);
        card.appendChild(nameRow);
        card.appendChild(desc);

        itemsColumn.appendChild(card);
    });
}

function selectItem(card, item) {
    clearSelectionHighlight();
    selectedItem = item;
    card.classList.add('active');
    card.style.borderColor = '#3d7cff';
    card.style.background = 'rgba(61, 124, 255, 0.15)';
    card.style.boxShadow = '0 0 12px rgba(61, 124, 255, 0.35)';

    renderDetails(item);
    updateBuyButtonState();
}

function renderDetails(item) {
    detailsPanel.innerHTML = '';
    if (!item) {
        const msg = document.createElement('div');
        msg.textContent = 'Select a weapon or utility on the left.';
        msg.style.opacity = '0.7';
        detailsPanel.appendChild(msg);
        detailsPanel.appendChild(buyButton);
        feedbackLabel = null;
        updateBuyButtonState();
        return;
    }

    const name = document.createElement('div');
    name.textContent = item.name;
    name.style.fontSize = '22px';
    name.style.fontWeight = 'bold';

    const cost = document.createElement('div');
    cost.textContent = `${item.cost} Credits`;
    cost.style.color = '#74d99f';
    cost.style.fontSize = '18px';

    const stats = document.createElement('div');
    stats.textContent = item.stats;
    stats.style.fontSize = '14px';
    stats.style.opacity = '0.8';

    const description = document.createElement('div');
    description.textContent = item.description;
    description.style.fontSize = '14px';
    description.style.opacity = '0.75';

    const favoriteActions = document.createElement('div');
    favoriteActions.style.display = 'flex';
    favoriteActions.style.gap = '10px';
    favoriteActions.style.alignItems = 'center';

    const favLabel = document.createElement('div');
    favLabel.textContent = 'Save to Favorites:';
    favLabel.style.fontSize = '12px';
    favLabel.style.opacity = '0.7';

    const favButtonsRow = document.createElement('div');
    favButtonsRow.style.display = 'flex';
    favButtonsRow.style.gap = '8px';

    for (let i = 0; i < FAVORITE_SLOTS; i++) {
        const slotBtn = document.createElement('button');
        slotBtn.textContent = `Slot ${i + 1}`;
        slotBtn.style.padding = '6px 10px';
        slotBtn.style.borderRadius = '6px';
        slotBtn.style.border = '1px solid rgba(255,255,255,0.15)';
        slotBtn.style.background = 'rgba(52, 152, 219, 0.15)';
        slotBtn.style.color = '#cfd7ff';
        slotBtn.style.cursor = 'pointer';
        slotBtn.style.fontSize = '12px';
        slotBtn.addEventListener('click', () => saveFavoriteSlot(i));
        favButtonsRow.appendChild(slotBtn);
    }

    favoriteActions.appendChild(favLabel);
    favoriteActions.appendChild(favButtonsRow);

    feedbackLabel = document.createElement('div');
    feedbackLabel.style.fontSize = '13px';
    feedbackLabel.style.opacity = '0.8';
    feedbackLabel.style.minHeight = '18px';

    detailsPanel.appendChild(name);
    detailsPanel.appendChild(cost);
    detailsPanel.appendChild(stats);
    detailsPanel.appendChild(description);
    detailsPanel.appendChild(favoriteActions);
    detailsPanel.appendChild(feedbackLabel);
    detailsPanel.appendChild(buyButton);

    updateBuyButtonState();
}

function updateBuyButtonState() {
    if (!buyButton) return;
    if (!selectedItem || selectedItem.weaponType === null) {
        buyButton.disabled = !selectedItem;
        buyButton.style.opacity = selectedItem ? '1' : '0.5';
        buyButton.textContent = selectedItem ? 'Purchase Utility' : 'Purchase';
        return;
    }

    const affordable = currentTokens >= selectedItem.cost;
    buyButton.disabled = !affordable;
    buyButton.style.opacity = affordable ? '1' : '0.4';
    buyButton.textContent = affordable ? 'Purchase Weapon' : 'Insufficient Credits';
}

function handleBuyClick() {
    if (!selectedItem || !onPurchaseCallback) return;
    const result = onPurchaseCallback(selectedItem);
    if (!result || result.success === false) {
        displayFeedback('Not enough credits.', 'error');
        playTone(220, 0.2, 0.15);
        return;
    }

    if (typeof result.tokens === 'number') {
        currentTokens = result.tokens;
        tokensLabel.textContent = `Credits: ${currentTokens}`;
    }

    displayFeedback(`${selectedItem.name} purchased!`, 'success');
    playTone(880, 0.12, 0.22);
    renderFavorites();
    updateBuyButtonState();
}

function handleQuickBuy(slotKey) {
    if (!onPurchaseCallback) return;
    const itemId = favorites[slotKey];
    if (!itemId || !ITEM_LOOKUP[itemId]) {
        displayFeedback('Favorite slot empty.', 'error');
        playTone(220, 0.2, 0.12);
        return;
    }
    const item = ITEM_LOOKUP[itemId];
    const result = onPurchaseCallback(item);
    if (!result || result.success === false) {
        displayFeedback(`Need ${item.cost} credits for ${item.name}.`, 'error');
        playTone(220, 0.2, 0.12);
        return;
    }
    currentTokens = result.tokens;
    tokensLabel.textContent = `Credits: ${currentTokens}`;
    displayFeedback(`${item.name} purchased via favorite!`, 'success');
    playTone(920, 0.12, 0.24);
    renderFavorites();
}

function saveFavoriteSlot(index) {
    if (!selectedItem || !ITEM_LOOKUP[selectedItem.id]) {
        displayFeedback('Select an item to favorite.', 'info');
        return;
    }
    const slotKey = index === 0 ? 'slot1' : 'slot2';
    favorites[slotKey] = selectedItem.id;
    saveFavorites();
    renderFavorites();
    displayFeedback(`${selectedItem.name} saved to favorite ${index + 1}.`, 'success');
    playTone(660, 0.1, 0.18);
}

function displayFeedback(message, type = 'info') {
    if (!feedbackLabel) return;
    feedbackLabel.textContent = message;
    switch (type) {
        case 'success':
            feedbackLabel.style.color = '#74d99f';
            break;
        case 'error':
            feedbackLabel.style.color = '#ff7675';
            break;
        default:
            feedbackLabel.style.color = '#cfd7ff';
    }
}

export function openBuyMenu({ tokens = 0, duration = 20, onPurchase, onClose }) {
    ensureContainer();
    favorites = loadFavorites();
    renderFavorites();
    currentTokens = tokens;
    onPurchaseCallback = onPurchase;
    onCloseCallback = onClose;
    selectedItem = null;
    isOpen = true;

    overlay.style.display = 'flex';
    tokensLabel.textContent = `Credits: ${currentTokens}`;
    countdownLabel.textContent = `Match begins in ${Math.ceil(duration)}s`;
    renderCategories();
    selectCategory(SHOP_CATEGORIES[0].id);
    renderDetails(null);

    // Trap pointer focus
    document.body.style.pointerEvents = 'auto';
    playTone(520, 0.18, 0.18);
}

export function updateBuyMenuCountdown(remainingSeconds) {
    if (!isOpen || !countdownLabel) return;
    const seconds = Math.max(0, Math.ceil(remainingSeconds));
    countdownLabel.textContent = `Match begins in ${seconds}s`;
}

export function closeBuyMenu(triggerCallback = false) {
    if (!overlay || !isOpen) return;
    overlay.style.display = 'none';
    isOpen = false;
    selectedItem = null;
    favorites = loadFavorites();

    if (triggerCallback && typeof onCloseCallback === 'function') {
        onCloseCallback();
    }
    playTone(340, 0.16, 0.18);
}

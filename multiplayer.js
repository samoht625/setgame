import { GameLogic } from './gameLogic.js';
export class MultiplayerSetGame {
    constructor() {
        this.players = new Map();
        this.currentPlayerId = null;
        this.actionMessages = [];
        this.startTime = 0;
        this.gameTimer = null;
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameEnded = false;
        this.imageCache = new Map();
        this.updateTimeout = null;
        this.gameLogic = new GameLogic();
        this.debugMode = false;
        this.debugValidSet = null;
        this.preloadImages().then(() => {
            this.initializeUI();
            this.initializeDefaultPlayers();
            this.startNewGame();
        });
    }
    async preloadImages() {
        const imagePromises = [];
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    this.imageCache.set(i, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load image for card ${i}`);
                    resolve();
                };
            });
            img.src = `cards/${i}.png`;
            imagePromises.push(promise);
        }
        await Promise.all(imagePromises);
        console.log(`Preloaded ${this.imageCache.size} card images`);
    }
    initializeUI() {
        this.playersContainer = document.getElementById('players-container');
        this.cardContainer = document.getElementById('card-container');
        this.actionBar = document.getElementById('action-bar');
        this.actionMessagesElement = document.getElementById('action-messages');
        this.totalSetsElement = document.getElementById('total-sets');
        this.timerElement = document.getElementById('timer');
        this.newGameButton = document.getElementById('new-game-btn');
        this.pauseButton = document.getElementById('pause-btn');
        // this.addPlayerButton = document.getElementById('add-player-btn'); // Removed button
        this.playerModal = document.getElementById('player-modal');
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        // this.addPlayerButton.addEventListener('click', () => this.showPlayerModal()); // Removed button
        // Modal close functionality
        document.getElementById('close-player-modal').addEventListener('click', () => this.closePlayerModal());
        this.playerModal.addEventListener('click', (e) => {
            if (e.target === this.playerModal)
                this.closePlayerModal();
        });
        // Add player functionality
        document.getElementById('add-player-confirm').addEventListener('click', () => this.addPlayer());
        // document.getElementById('add-player-sidebar-btn').addEventListener('click', () => this.showPlayerModal()); // Removed button
        document.getElementById('new-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter')
                this.addPlayer();
        });
        // Debug mode toggle with Command-D
        document.addEventListener('keydown', (e) => {
            if (e.metaKey && e.key === 'd') {
                e.preventDefault();
                this.toggleDebugMode();
            }
        });
    }
    initializeDefaultPlayers() {
        // Add 2 default players to start
        this.addPlayer('Player 1');
        this.addPlayer('Player 2');
        // Set the first player as current player
        const firstPlayer = Array.from(this.players.values())[0];
        if (firstPlayer) {
            this.currentPlayerId = firstPlayer.id;
            this.updatePlayersDisplay();
        }
    }
    addPlayer(name) {
        if (this.players.size >= 12) {
            this.showActionMessage('Maximum 12 players allowed', 'error');
            return;
        }
        const playerName = name || document.getElementById('new-player-name').value.trim();
        if (!playerName) {
            this.showActionMessage('Please enter a player name', 'error');
            return;
        }
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const player = {
            id: playerId,
            name: playerName,
            isActive: false,
            setsFound: 0
        };
        this.players.set(playerId, player);
        this.updatePlayersDisplay();
        this.showActionMessage(`${playerName} joined the game`, 'player_joined');
        // Clear input
        document.getElementById('new-player-name').value = '';
        // Close modal if it was opened via the add button
        if (this.playerModal.style.display !== 'none') {
            this.closePlayerModal();
        }
    }
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player)
            return;
        this.players.delete(playerId);
        // If this was the current player, switch to another player
        if (this.currentPlayerId === playerId) {
            const remainingPlayers = Array.from(this.players.values());
            this.currentPlayerId = remainingPlayers.length > 0 ? remainingPlayers[0].id : null;
        }
        this.updatePlayersDisplay();
        this.showActionMessage(`${player.name} left the game`, 'player_left');
    }
    updatePlayersDisplay() {
        this.playersContainer.innerHTML = '';
        this.players.forEach((player) => {
            const playerCard = this.createPlayerCard(player);
            this.playersContainer.appendChild(playerCard);
        });
    }
    createPlayerCard(player) {
        const item = document.createElement('div');
        item.className = `player-item ${player.id === this.currentPlayerId ? 'active' : ''}`;
        item.dataset.playerId = player.id;
        item.innerHTML = `
            <span class="player-name">${player.name}</span>
            <span class="player-score">${player.setsFound}</span>
        `;
        // Click to activate player
        item.addEventListener('click', () => {
            this.setCurrentPlayer(player.id);
        });
        return item;
    }
    setCurrentPlayer(playerId) {
        var _a;
        this.currentPlayerId = playerId;
        this.updatePlayersDisplay();
        this.showActionMessage(`${(_a = this.players.get(playerId)) === null || _a === void 0 ? void 0 : _a.name} is now active`, 'info');
    }
    startNewGame() {
        this.gameLogic.startNewGame();
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameEnded = false;
        this.actionMessages = [];
        this.updateActionBar();
        // Reset all player sets
        this.players.forEach(player => {
            player.setsFound = 0;
        });
        this.updatePlayersDisplay();
        this.showActionMessage('New game started!', 'game_started');
        this.startTimer();
        // Update debug valid set if debug mode is on
        if (this.debugMode) {
            this.debugValidSet = this.getValidSet();
            this.updateExistingCardsDebugHighlighting();
        }
        this.updateDisplay();
    }
    startTimer() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        this.startTime = Date.now();
        this.gameTimer = setInterval(() => {
            if (!this.isPaused) {
                this.updateTimer();
            }
        }, 1000);
    }
    updateTimer() {
        const elapsed = Math.floor((Date.now() - this.startTime - this.pausedTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        this.timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    updateDisplay() {
        if (this.updateTimeout) {
            cancelAnimationFrame(this.updateTimeout);
            this.updateTimeout = null;
        }
        this.updateTimeout = requestAnimationFrame(() => {
            this.updateStatus();
            this.updateCards();
            if (this.gameLogic.isGameOver()) {
                this.endGame();
            }
            this.updateTimeout = null;
        });
    }
    updateStatus() {
        const totalSets = Array.from(this.players.values()).reduce((sum, player) => sum + player.setsFound, 0);
        this.totalSetsElement.textContent = totalSets.toString();
    }
    updateCards() {
        const displayedCards = this.gameLogic.getDisplayedCards();
        const selectedCards = this.gameLogic.getSelectedCards();
        this.adjustGridLayout(displayedCards.length);
        this.updateCardsWithDiffing(displayedCards, selectedCards);
    }
    updateCardsWithDiffing(displayedCards, selectedCards) {
        const existingCards = Array.from(this.cardContainer.children);
        const existingCardIds = existingCards.map(el => parseInt(el.dataset.cardId || '0'));
        const newCardIds = displayedCards.map(card => card.getId());
        // Remove cards that are no longer displayed
        existingCards.forEach((cardEl, index) => {
            const cardId = existingCardIds[index];
            if (!newCardIds.includes(cardId)) {
                cardEl.remove();
            }
        });
        // Add or update cards
        displayedCards.forEach((card, index) => {
            const cardId = card.getId();
            const isSelected = selectedCards.has(card);
            const existingIndex = existingCardIds.indexOf(cardId);
            if (existingIndex === -1) {
                const cardElement = this.createCardElement(card, isSelected);
                if (index < this.cardContainer.children.length) {
                    this.cardContainer.insertBefore(cardElement, this.cardContainer.children[index]);
                }
                else {
                    this.cardContainer.appendChild(cardElement);
                }
            }
            else {
                const existingEl = existingCards[existingIndex];
                const currentlySelected = existingEl.classList.contains('selected');
                if (currentlySelected !== isSelected) {
                    if (isSelected) {
                        existingEl.classList.add('selected');
                    }
                    else {
                        existingEl.classList.remove('selected');
                    }
                }
                const currentPosition = Array.from(this.cardContainer.children).indexOf(existingEl);
                if (currentPosition !== index) {
                    if (index < this.cardContainer.children.length) {
                        this.cardContainer.insertBefore(existingEl, this.cardContainer.children[index]);
                    }
                    else {
                        this.cardContainer.appendChild(existingEl);
                    }
                }
            }
        });
    }
    adjustGridLayout(cardCount) {
        this.cardContainer.className = this.cardContainer.className.replace(/\bgrid-\d+-cols\b/g, '');
        let gridClass = '';
        if (cardCount <= 12) {
            gridClass = 'grid-4-cols';
        }
        else if (cardCount <= 15) {
            gridClass = 'grid-5-cols';
        }
        else {
            gridClass = 'grid-6-cols';
        }
        this.cardContainer.classList.add(gridClass);
        console.log(`Applied grid class: ${gridClass} for ${cardCount} cards`);
    }
    createCardElement(card, isSelected) {
        const cardDiv = document.createElement('div');
        let className = 'minimal-card';
        if (isSelected) className += ' selected';
        if (this.debugMode && this.debugValidSet && this.debugValidSet.includes(card)) {
            className += ' debug-highlight';
            console.log('Adding debug highlight to card:', card.getId());
        }
        cardDiv.className = className;
        cardDiv.dataset.cardId = card.getId().toString();
        const cardId = card.getId();
        const cachedImg = this.imageCache.get(cardId);
        const img = document.createElement('img');
        img.alt = card.toString();
        img.draggable = false;
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        }
        else {
            img.src = `cards/${cardId}.png`;
        }
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => {
            if (!this.isPaused && this.currentPlayerId) {
                const wasSet = this.handleCardSelection(card);
                if (wasSet) {
                    this.autoDealIfNoSet();
                }
                this.updateDisplay();
            }
        });
        return cardDiv;
    }
    handleCardSelection(card) {
        if (!this.currentPlayerId)
            return false;
        const beforeSetsFound = this.gameLogic.getSetsFound();
        this.gameLogic.selectCard(card);
        const afterSetsFound = this.gameLogic.getSetsFound();
        if (afterSetsFound > beforeSetsFound) {
            // A set was found by the current player
            const player = this.players.get(this.currentPlayerId);
            if (player) {
                player.setsFound++;
                this.showActionMessage(`${player.name} found a SET! (+1 set)`, 'set_found', player.name);
                this.updatePlayersDisplay();
            }
            return true;
        }
        return false;
    }
    autoDealIfNoSet() {
        while (!this.gameLogic.hasVisibleSet() && this.gameLogic.getRemainingCards() > 0) {
            this.gameLogic.dealMoreCards();
        }
        // Update debug valid set if debug mode is on
        if (this.debugMode) {
            this.debugValidSet = this.getValidSet();
            this.updateExistingCardsDebugHighlighting();
        }
    }
    showActionMessage(text, type, playerName) {
        const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text,
            playerName,
            timestamp: Date.now(),
            type
        };
        this.actionMessages.push(message);
        // Keep only last 10 messages
        if (this.actionMessages.length > 10) {
            this.actionMessages = this.actionMessages.slice(-10);
        }
        this.updateActionBar();
    }
    updateActionBar() {
        if (this.actionMessages.length === 0) {
            this.actionBar.style.display = 'none';
            return;
        }
        this.actionBar.style.display = 'block';
        this.actionMessagesElement.innerHTML = '';
        this.actionMessages.slice(-3).forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = 'action-message';
            messageEl.textContent = message.text;
            this.actionMessagesElement.appendChild(messageEl);
        });
        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.actionBar.style.display = 'none';
        }, 3000);
    }
    endGame() {
        if (this.gameEnded)
            return;
        this.gameEnded = true;
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        // Find winner
        const players = Array.from(this.players.values());
        const winner = players.reduce((prev, current) => (current.setsFound > prev.setsFound) ? current : prev);
        this.showActionMessage(`Game Over! ${winner.name} wins with ${winner.setsFound} sets!`, 'game_ended');
        // Update player cards to show winner
        this.updatePlayersDisplay();
    }
    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            this.pauseButton.querySelector('img').src = 'icons/play.svg';
            this.pauseButton.querySelector('img').alt = 'Resume';
            this.pauseButton.title = 'Resume';
        }
        else {
            this.pausedTime += Date.now() - this.pauseStartTime;
            this.pauseButton.querySelector('img').src = 'icons/pause.svg';
            this.pauseButton.querySelector('img').alt = 'Pause';
            this.pauseButton.title = 'Pause';
        }
    }
    showPlayerModal() {
        this.updatePlayerModal();
        this.playerModal.style.display = 'flex';
    }
    closePlayerModal() {
        this.playerModal.style.display = 'none';
    }
    updatePlayerModal() {
        const playerList = document.getElementById('player-list');
        playerList.innerHTML = '';
        this.players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-list-item';
            item.innerHTML = `
                <span>${player.name} (${player.setsFound} sets)</span>
                <button class="remove-btn" onclick="multiplayerGame.removePlayer('${player.id}')">Remove</button>
            `;
            playerList.appendChild(item);
        });
    }
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        console.log('Debug mode:', this.debugMode ? 'ON' : 'OFF');
        if (this.debugMode) {
            this.debugValidSet = this.getValidSet();
            console.log('Valid set found:', this.debugValidSet);
            if (this.debugValidSet) {
                console.log('Valid set cards:', this.debugValidSet.map(card => card.getId()));
            } else {
                console.log('No valid set found');
            }
        } else {
            this.debugValidSet = null;
        }
        this.showActionMessage(`Debug mode ${this.debugMode ? 'ON' : 'OFF'}`, 'info');
        this.updateExistingCardsDebugHighlighting();
    }
    getValidSet() {
        // Find a valid set from the displayed cards
        const displayedCards = this.gameLogic.getDisplayedCards();
        for (let i = 0; i < displayedCards.length; i++) {
            for (let j = i + 1; j < displayedCards.length; j++) {
                for (let k = j + 1; k < displayedCards.length; k++) {
                    const card1 = displayedCards[i];
                    const card2 = displayedCards[j];
                    const card3 = displayedCards[k];
                    if (GameLogic.isValidSet(card1, card2, card3)) {
                        return [card1, card2, card3];
                    }
                }
            }
        }
        return null;
    }
    updateExistingCardsDebugHighlighting() {
        const cardElements = this.cardContainer.children;
        const displayedCards = this.gameLogic.getDisplayedCards();
        
        for (let i = 0; i < cardElements.length; i++) {
            const cardElement = cardElements[i];
            const cardId = parseInt(cardElement.dataset.cardId);
            
            // Find the corresponding card object
            const card = displayedCards.find(c => c.getId() === cardId);
            if (!card) continue;
            
            // Remove existing debug highlight
            cardElement.classList.remove('debug-highlight');
            
            // Add debug highlight if needed
            if (this.debugMode && this.debugValidSet && this.debugValidSet.includes(card)) {
                cardElement.classList.add('debug-highlight');
                console.log('Updated debug highlight for card:', cardId);
            }
        }
    }
}
// Initialize the multiplayer game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.multiplayerGame = new MultiplayerSetGame();
});

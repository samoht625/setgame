import { GameLogic } from './gameLogic.js';
export class OnlineMultiplayerSetGame {
    constructor() {
        this.players = new Map();
        this.currentPlayerId = null;
        this.roomCode = '';
        this.room = null;
        this.gameState = null;
        this.socket = null;
        this.imageCache = new Map();
        this.updateTimeout = null;
        // Backend URL
        this.BACKEND_URL = 'https://setgame-backend.onrender.com';
        this.gameLogic = new GameLogic();
        this.preloadImages().then(() => {
            this.initializeUI();
            this.showRoomModal();
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
        this.joinRoomButton = document.getElementById('join-room-btn');
        this.createRoomButton = document.getElementById('create-room-btn');
        this.roomCodeInput = document.getElementById('room-code');
        this.playerNameInput = document.getElementById('player-name');
        this.roomModal = document.getElementById('room-modal');
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.joinRoomButton.addEventListener('click', () => this.joinRoom());
        this.createRoomButton.addEventListener('click', () => this.createRoom());
        // Modal close functionality
        document.getElementById('close-room-modal').addEventListener('click', () => this.closeRoomModal());
        this.roomModal.addEventListener('click', (e) => {
            if (e.target === this.roomModal)
                this.closeRoomModal();
        });
        // Enter key to join room
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter')
                this.joinRoom();
        });
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter')
                this.joinRoom();
        });
    }
    showRoomModal() {
        this.roomModal.style.display = 'flex';
    }
    closeRoomModal() {
        this.roomModal.style.display = 'none';
    }
    async createRoom() {
        try {
            const response = await fetch(`${this.BACKEND_URL}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error('Failed to create room');
            }
            const data = await response.json();
            this.roomCode = data.roomCode;
            this.roomCodeInput.value = this.roomCode;
            this.showActionMessage(`Room created: ${this.roomCode}`, 'info');
        }
        catch (error) {
            console.error('Error creating room:', error);
            this.showActionMessage('Failed to create room', 'error');
        }
    }
    async joinRoom() {
        const roomCode = this.roomCodeInput.value.trim();
        const playerName = this.playerNameInput.value.trim();
        if (!roomCode || !playerName) {
            this.showActionMessage('Please enter both room code and player name', 'error');
            return;
        }
        this.roomCode = roomCode;
        await this.connectToRoom(playerName);
    }
    async connectToRoom(playerName) {
        try {
            // Connect to WebSocket
            this.socket = new WebSocket(`wss://setgame-backend.onrender.com`);
            this.socket.onopen = () => {
                console.log('Connected to server');
                this.socket.send(JSON.stringify({
                    type: 'join_room',
                    roomCode: this.roomCode,
                    playerName: playerName
                }));
            };
            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleSocketMessage(data);
            };
            this.socket.onclose = () => {
                console.log('Disconnected from server');
                this.showActionMessage('Disconnected from server', 'error');
            };
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showActionMessage('Connection error', 'error');
            };
        }
        catch (error) {
            console.error('Error connecting to room:', error);
            this.showActionMessage('Failed to connect to room', 'error');
        }
    }
    handleSocketMessage(data) {
        switch (data.type) {
            case 'room_joined':
                this.handleRoomJoined(data);
                break;
            case 'player_joined':
                this.handlePlayerJoined(data.player);
                break;
            case 'player_left':
                this.handlePlayerLeft(data.playerId);
                break;
            case 'game_state_update':
                this.handleGameStateUpdate(data.gameState);
                break;
            case 'error':
                this.showActionMessage(data.message, 'error');
                break;
        }
    }
    handleRoomJoined(data) {
        this.roomCode = data.roomCode;
        this.currentPlayerId = data.playerId;
        this.room = {
            id: data.roomCode,
            roomCode: data.roomCode,
            createdAt: new Date().toISOString(),
            gameState: data.gameState,
            isActive: true
        };
        // Update players
        this.players.clear();
        data.players.forEach((player) => {
            this.players.set(player.playerId, player);
        });
        this.updatePlayersDisplay();
        this.closeRoomModal();
        this.showActionMessage(`Joined room ${this.roomCode}`, 'info');
        // Start the game if there's a game state
        if (data.gameState) {
            this.loadGameState(data.gameState);
        }
    }
    handlePlayerJoined(player) {
        this.players.set(player.playerId, player);
        this.updatePlayersDisplay();
        this.showActionMessage(`${player.name} joined the room`, 'player_joined');
    }
    handlePlayerLeft(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.players.delete(playerId);
            this.updatePlayersDisplay();
            this.showActionMessage(`${player.name} left the room`, 'player_left');
        }
    }
    handleGameStateUpdate(gameState) {
        this.loadGameState(gameState);
    }
    loadGameState(gameState) {
        this.gameState = gameState;
        // For now, we'll work with card IDs directly
        // The backend will handle the game logic
        this.updateDisplay();
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
        item.className = `player-item ${player.playerId === this.currentPlayerId ? 'active' : ''}`;
        item.dataset.playerId = player.playerId;
        item.innerHTML = `
            <span class="player-name">${player.name}</span>
            <span class="player-score">${player.setsFound}</span>
            <span class="player-status ${player.isOnline ? 'online' : 'offline'}"></span>
        `;
        return item;
    }
    startNewGame() {
        if (!this.socket) {
            this.showActionMessage('Not connected to a room', 'error');
            return;
        }
        // Send new game request to server
        this.socket.send(JSON.stringify({
            type: 'start_new_game'
        }));
    }
    handleCardSelection(cardId) {
        if (!this.socket || !this.currentPlayerId)
            return;
        this.socket.send(JSON.stringify({
            type: 'select_card',
            cardId: cardId
        }));
    }
    updateDisplay() {
        if (this.updateTimeout) {
            cancelAnimationFrame(this.updateTimeout);
            this.updateTimeout = null;
        }
        this.updateTimeout = requestAnimationFrame(() => {
            this.updateStatus();
            this.updateCards();
            this.updateTimeout = null;
        });
    }
    updateStatus() {
        const totalSets = Array.from(this.players.values()).reduce((sum, player) => sum + player.setsFound, 0);
        this.totalSetsElement.textContent = totalSets.toString();
    }
    updateCards() {
        if (!this.gameState)
            return;
        const displayedCards = this.gameState.cards;
        const selectedCards = this.gameState.selectedCards;
        // Convert to card IDs if needed
        const cardIds = Array.isArray(displayedCards) ?
            displayedCards.map(card => typeof card === 'number' ? card : card.getId()) :
            [];
        const selectedCardIds = Array.isArray(selectedCards) ?
            selectedCards.map(card => typeof card === 'number' ? card : card.getId()) :
            [];
        this.adjustGridLayout(cardIds.length);
        this.updateCardsWithDiffing(cardIds, selectedCardIds);
    }
    updateCardsWithDiffing(displayedCards, selectedCards) {
        const existingCards = Array.from(this.cardContainer.children);
        const existingCardIds = existingCards.map(el => parseInt(el.dataset.cardId || '0'));
        const newCardIds = displayedCards;
        // Remove cards that are no longer displayed
        existingCards.forEach((cardEl, index) => {
            const cardId = existingCardIds[index];
            if (!newCardIds.includes(cardId)) {
                cardEl.remove();
            }
        });
        // Add or update cards
        displayedCards.forEach((cardId, index) => {
            const isSelected = selectedCards.includes(cardId);
            const existingIndex = existingCardIds.indexOf(cardId);
            if (existingIndex === -1) {
                const cardElement = this.createCardElement(cardId, isSelected);
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
    }
    createCardElement(cardId, isSelected) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `minimal-card ${isSelected ? 'selected' : ''}`;
        cardDiv.dataset.cardId = cardId.toString();
        const cachedImg = this.imageCache.get(cardId);
        const img = document.createElement('img');
        img.alt = `Card ${cardId}`;
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
            this.handleCardSelection(cardId);
        });
        return cardDiv;
    }
    togglePause() {
        // Implement pause functionality if needed
        this.showActionMessage('Pause functionality not implemented yet', 'info');
    }
    showActionMessage(text, type) {
        const messageEl = document.createElement('div');
        messageEl.className = `action-message ${type}`;
        messageEl.textContent = text;
        this.actionMessagesElement.appendChild(messageEl);
        // Keep only last 5 messages
        while (this.actionMessagesElement.children.length > 5) {
            this.actionMessagesElement.removeChild(this.actionMessagesElement.firstChild);
        }
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
    }
}
// Initialize the online multiplayer game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.onlineMultiplayerGame = new OnlineMultiplayerSetGame();
});

export class MultiplayerSetGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.selectedCards = new Set();
        this.currentGameId = null;
        this.imageCache = new Map();
        this.preloadImages().then(() => {
            this.initializeUI();
            this.setupWebSocket();
        });
    }
    async preloadImages() {
        const imagePromises = [];
        // Preload all 81 card images
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise((resolve) => {
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
        // Get DOM elements
        this.joinForm = document.getElementById('join-form');
        this.overlay = document.getElementById('overlay');
        this.gameContent = document.getElementById('game-content');
        this.playerNameInput = document.getElementById('player-name');
        this.joinButton = document.getElementById('join-btn');
        this.currentPlayerName = document.getElementById('current-player-name');
        this.setsCountElement = document.getElementById('sets-count');
        this.totalWinsElement = document.getElementById('total-wins');
        this.deckRemainingElement = document.getElementById('deck-remaining');
        this.playersContainer = document.getElementById('players-container');
        this.cardContainer = document.getElementById('card-container');
        // Setup event listeners
        this.playerNameInput.addEventListener('input', () => {
            this.joinButton.disabled = this.playerNameInput.value.trim().length === 0;
        });
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.joinButton.disabled) {
                this.joinGame();
            }
        });
        this.joinButton.addEventListener('click', () => this.joinGame());
        // Focus on name input
        this.playerNameInput.focus();
    }
    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            console.log('Connected to server');
        };
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.showNotification('Disconnected from server', true);
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        };
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('Connection error', true);
        };
    }
    joinGame() {
        this.playerName = this.playerNameInput.value.trim();
        if (this.playerName && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'join',
                name: this.playerName
            }));
        }
    }
    handleServerMessage(data) {
        switch (data.type) {
            case 'playerId':
                this.playerId = data.playerId;
                this.showGame();
                break;
            case 'gameState':
                this.updateGameState(data);
                break;
            case 'setFound':
                this.handleSetFound(data);
                break;
            case 'invalidSet':
                this.showNotification('Invalid set!', true);
                break;
        }
    }
    showGame() {
        this.joinForm.style.display = 'none';
        this.overlay.style.display = 'none';
        this.gameContent.style.display = 'block';
        this.currentPlayerName.textContent = this.playerName;
    }
    updateGameState(state) {
        // Check if this is a new game
        if (this.currentGameId !== null && this.currentGameId !== state.gameId) {
            this.showNotification('New game started!', false);
        }
        this.currentGameId = state.gameId;
        // Update deck remaining
        this.deckRemainingElement.textContent = `Cards remaining: ${state.deckRemaining}`;
        // Update players list
        this.updatePlayersList(state.players);
        // Update cards
        this.updateCards(state.displayedCards, state.players);
        // Update current player stats
        const currentPlayer = state.players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            this.setsCountElement.textContent = currentPlayer.setsFound.toString();
            this.totalWinsElement.textContent = currentPlayer.totalWins.toString();
        }
    }
    updatePlayersList(players) {
        this.playersContainer.innerHTML = '';
        // Sort players by sets found (descending)
        const sortedPlayers = [...players].sort((a, b) => b.setsFound - a.setsFound);
        sortedPlayers.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            if (player.id === this.playerId) {
                playerDiv.classList.add('current-player');
            }
            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name;
            const scoresDiv = document.createElement('div');
            scoresDiv.className = 'player-scores';
            scoresDiv.innerHTML = `
                <span>Sets: ${player.setsFound}</span>
                <span>Total: ${player.totalWins}</span>
            `;
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(scoresDiv);
            this.playersContainer.appendChild(playerDiv);
        });
    }
    updateCards(displayedCards, players) {
        // Adjust grid layout
        this.adjustGridLayout(displayedCards.length);
        // Get all selected cards from other players
        const otherPlayersSelected = new Set();
        players.forEach(player => {
            if (player.id !== this.playerId) {
                player.selectedCards.forEach(cardId => otherPlayersSelected.add(cardId));
            }
        });
        // Clear and rebuild cards
        this.cardContainer.innerHTML = '';
        displayedCards.forEach(cardData => {
            const cardDiv = this.createCardElement(cardData, this.selectedCards.has(cardData.id), otherPlayersSelected.has(cardData.id));
            this.cardContainer.appendChild(cardDiv);
        });
    }
    adjustGridLayout(cardCount) {
        this.cardContainer.className = 'card-container';
        if (cardCount <= 12) {
            this.cardContainer.classList.add('grid-4-cols');
        }
        else if (cardCount <= 15) {
            this.cardContainer.classList.add('grid-5-cols');
        }
        else {
            this.cardContainer.classList.add('grid-6-cols');
        }
    }
    createCardElement(cardData, isSelected, isOtherPlayerSelected) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        if (isSelected) {
            cardDiv.classList.add('selected');
        }
        if (isOtherPlayerSelected) {
            cardDiv.classList.add('other-player-selected');
        }
        const img = document.createElement('img');
        img.alt = `Card ${cardData.id}`;
        img.draggable = false;
        const cachedImg = this.imageCache.get(cardData.id);
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        }
        else {
            img.src = `cards/${cardData.id}.png`;
        }
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => {
            this.handleCardClick(cardData.id);
        });
        return cardDiv;
    }
    handleCardClick(cardId) {
        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
        }
        else {
            this.selectedCards.add(cardId);
            // If 3 cards selected, check for set
            if (this.selectedCards.size >= 3) {
                // Only send the first 3 cards
                const cardsArray = Array.from(this.selectedCards).slice(0, 3);
                this.sendSelectedCards(cardsArray);
                this.selectedCards.clear();
            }
        }
        // Send current selection to server
        this.sendSelectedCards(Array.from(this.selectedCards));
    }
    sendSelectedCards(cardIds) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'selectCards',
                cardIds: cardIds
            }));
        }
    }
    handleSetFound(data) {
        if (data.playerId === this.playerId) {
            this.showNotification('Set found! +1 point', false);
        }
        else {
            this.showNotification(`${data.playerName} found a set!`, false);
        }
    }
    showNotification(message, isError) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        if (isError) {
            notification.classList.add('error');
        }
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

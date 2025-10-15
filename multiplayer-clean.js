import { GameLogic } from './gameLogic.js';

class CleanMultiplayerSetGame {
    constructor() {
        this.socket = null;
        this.roomCode = '';
        this.players = new Map();
        this.gameState = null;
        this.currentPlayerId = null;
        this.imageCache = new Map();
        
        // UI elements
        this.cardContainer = null;
        this.playersContainer = null;
        this.actionBar = null;
        this.actionMessagesElement = null;
        this.totalSetsElement = null;
        this.timerElement = null;
        this.newGameButton = null;
        this.pauseButton = null;
        
        // Game state
        this.gameStarted = false;
        this.gamePhase = 'waiting';
        this.setHighlighting = false;
        
        this.initialize();
    }

    async initialize() {
        await this.preloadImages();
        this.initializeUI();
        this.setupEventListeners();
        this.connectToServer();
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
            img.src = `/cards/${i}.png`;
            imagePromises.push(promise);
        }
        await Promise.all(imagePromises);
        console.log(`Preloaded ${this.imageCache.size} card images`);
    }

    initializeUI() {
        this.cardContainer = document.getElementById('card-container');
        this.playersContainer = document.getElementById('players-list');
        this.actionBar = document.getElementById('action-bar');
        this.actionMessagesElement = document.getElementById('action-messages');
        this.totalSetsElement = document.getElementById('total-sets');
        this.timerElement = document.getElementById('timer');
        this.newGameButton = document.getElementById('new-game-btn');
        this.pauseButton = document.getElementById('pause-btn');
        
        // Ensure buttons are properly initialized
        if (this.newGameButton) {
            this.newGameButton.style.cursor = 'pointer';
        }
        if (this.pauseButton) {
            this.pauseButton.style.cursor = 'pointer';
        }
    }

    setupEventListeners() {
        if (this.newGameButton) {
            this.newGameButton.addEventListener('click', () => this.startNewGame());
        }
        
        if (this.pauseButton) {
            this.pauseButton.addEventListener('click', () => this.togglePause());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                this.toggleSetHighlighting();
            }
        });
    }

    connectToServer() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.currentPlayerId = this.socket.id;
            this.joinRoom();
        });

        this.socket.on('room_joined', (data) => {
            this.handleRoomJoined(data);
        });

        this.socket.on('game_started', (data) => {
            this.handleGameStarted(data);
        });

        this.socket.on('game_state_update', (data) => {
            this.handleGameStateUpdate(data);
        });

        this.socket.on('set_found', (data) => {
            this.handleSetFound(data);
        });

        this.socket.on('invalid_set', (data) => {
            this.handleInvalidSet(data);
        });

        this.socket.on('player_left', (data) => {
            this.handlePlayerLeft(data);
        });

        this.socket.on('error', (data) => {
            this.showActionMessage(data.message, 'error');
        });

        this.socket.on('disconnect', () => {
            this.showActionMessage('Disconnected from server', 'error');
        });
    }

    joinRoom() {
        // Extract room from URL or let server find available room
        const path = window.location.pathname;
        const match = path.match(/\/m\/(.+)/);
        const roomCode = match ? match[1] : null;
        
        this.socket.emit('join_room', {
            roomCode: roomCode,
            playerName: this.generatePlayerName()
        });
    }

    generatePlayerName() {
        return `Player ${Math.floor(Math.random() * 1000)}`;
    }

    handleRoomJoined(data) {
        this.roomCode = data.roomCode;
        this.gameState = data.gameState;
        
        // Update players
        this.players.clear();
        data.players.forEach(player => {
            this.players.set(player.playerId, player);
        });
        
        this.updatePlayersDisplay();
        this.updateRoomDisplay();
        
        // Update URL to reflect room
        this.updateURL();
        
        this.showActionMessage(`Joined room: ${this.roomCode}`, 'info');
        
        // Render cards if game is already running
        console.log('Game state:', this.gameState);
        if (this.gameState && this.gameState.cards && this.gameState.cards.length > 0) {
            console.log('Rendering existing cards...');
            this.renderCards();
            this.gamePhase = 'playing';
            this.gameStarted = true;
        } else {
            console.log('No game running, auto-starting...');
            // Auto-start game if no game is running
            setTimeout(() => {
                this.startNewGame();
            }, 1000);
        }
    }

    handleGameStarted(data) {
        this.gameState = data.gameState;
        this.gameStarted = true;
        this.gamePhase = 'playing';
        
        this.renderCards();
        this.showActionMessage('Game started!', 'success');
    }

    handleGameStateUpdate(data) {
        this.gameState = data.gameState;
        this.renderCards();
    }

    handleSetFound(data) {
        this.gameState = data.gameState;
        this.showSetFoundAnimation(data.cardIds);
        this.playSetFoundSound();
        this.updatePlayersDisplay();
        this.updateTotalSetsDisplay();
        this.renderCards();
        
        this.showActionMessage('Set found!', 'success');
    }

    handleInvalidSet(data) {
        this.showActionMessage('Not a valid set', 'error');
    }

    handlePlayerLeft(data) {
        this.players.delete(data.playerId);
        this.updatePlayersDisplay();
        
        const player = Array.from(this.players.values()).find(p => p.id === data.playerId);
        if (player) {
            this.showActionMessage(`${player.name} left the game`, 'info');
        }
    }

    startNewGame() {
        if (!this.socket || !this.roomCode) return;
        
        this.socket.emit('start_game', {
            roomCode: this.roomCode
        });
    }

    handleCardSelection(cardId) {
        if (!this.socket || !this.roomCode || this.gamePhase !== 'playing') return;
        
        this.socket.emit('select_card', {
            roomCode: this.roomCode,
            cardId: cardId
        });
    }

    renderCards() {
        if (!this.gameState || !this.cardContainer) return;
        
        console.log('renderCards called, clearing container...');
        this.cardContainer.innerHTML = '';
        
        this.gameState.cards.forEach(card => {
            const cardElement = this.createCardElement(card);
            console.log('Created card element:', cardElement);
            this.cardContainer.appendChild(cardElement);
        });
        
        this.adjustGridLayout(this.gameState.cards.length);
        console.log('Cards rendered, container children:', this.cardContainer.children.length);
    }

    createCardElement(card) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'minimal-card';
        cardDiv.dataset.cardId = card.id;
        
        if (this.gameState.selectedCards.includes(card.id)) {
            cardDiv.classList.add('selected');
        }
        
        const img = document.createElement('img');
        img.alt = `Set Card ${card.id}`;
        img.draggable = false;
        
        const cachedImg = this.imageCache.get(card.id);
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        } else {
            img.src = `/cards/${card.id}.png`;
        }
        
        img.onerror = () => {
            console.warn(`Failed to load card image: ${card.id}`);
            img.style.display = 'none';
        };
        
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => {
            this.handleCardSelection(card.id);
        });
        
        return cardDiv;
    }

    adjustGridLayout(cardCount) {
        if (cardCount <= 12) {
            this.cardContainer.className = 'grid-4-cols';
        } else if (cardCount <= 15) {
            this.cardContainer.className = 'grid-5-cols';
        } else {
            this.cardContainer.className = 'grid-6-cols';
        }
    }

    updatePlayersDisplay() {
        if (!this.playersContainer) return;
        
        this.playersContainer.innerHTML = '';
        
        this.players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <span>${player.name}</span>
                <span>${player.setsFound}</span>
            `;
            this.playersContainer.appendChild(playerElement);
        });
    }

    updateRoomDisplay() {
        const roomDisplay = document.getElementById('room-display');
        if (roomDisplay) {
            roomDisplay.textContent = this.roomCode;
        }
    }

    updateTotalSetsDisplay() {
        if (!this.totalSetsElement) return;
        
        const totalSets = Array.from(this.players.values()).reduce((sum, player) => sum + player.setsFound, 0);
        this.totalSetsElement.textContent = totalSets.toString();
    }

    updateURL() {
        const newPath = `/m/${this.roomCode}`;
        if (window.location.pathname !== newPath) {
            window.history.pushState({}, '', newPath);
        }
    }

    showSetFoundAnimation(cardIds) {
        cardIds.forEach(cardId => {
            const cardElement = this.cardContainer.querySelector(`[data-card-id="${cardId}"]`);
            if (cardElement) {
                cardElement.classList.add('set-found');
                setTimeout(() => {
                    cardElement.classList.remove('set-found');
                }, 2000);
            }
        });
    }

    playSetFoundSound() {
        // Simple audio feedback using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('Audio not available');
        }
    }

    showActionMessage(text, type) {
        if (!this.actionMessagesElement || !this.actionBar) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `action-message ${type}`;
        messageEl.textContent = text;
        
        this.actionMessagesElement.appendChild(messageEl);
        this.actionBar.style.display = 'block';
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
            
            // Hide action bar if no messages left
            if (this.actionMessagesElement.children.length === 0) {
                this.actionBar.style.display = 'none';
            }
        }, 3000);
    }

    togglePause() {
        // Implement pause functionality if needed
        this.showActionMessage('Pause functionality not implemented yet', 'info');
    }

    toggleSetHighlighting() {
        this.setHighlighting = !this.setHighlighting;
        
        if (this.setHighlighting) {
            this.highlightValidSets();
        } else {
            this.clearSetHighlights();
        }
        
        this.showActionMessage(`Set highlighting ${this.setHighlighting ? 'ON' : 'OFF'}`, 'info');
    }

    highlightValidSets() {
        if (!this.gameState || !this.gameState.cards) return;
        
        const validSets = this.findValidSets();
        this.clearSetHighlights();
        
        validSets.forEach(set => {
            set.forEach(cardId => {
                const cardElement = this.cardContainer.querySelector(`[data-card-id="${cardId}"]`);
                if (cardElement) {
                    cardElement.classList.add('debug-highlight');
                }
            });
        });
        
        this.showActionMessage(`Highlighted ${validSets.length} valid sets`, 'info');
    }

    clearSetHighlights() {
        const highlightedCards = this.cardContainer.querySelectorAll('.debug-highlight');
        highlightedCards.forEach(card => {
            card.classList.remove('debug-highlight');
        });
    }

    findValidSets() {
        if (!this.gameState || !this.gameState.cards) return [];
        
        const cards = this.gameState.cards;
        const validSets = [];
        
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                for (let k = j + 1; k < cards.length; k++) {
                    const card1 = cards[i];
                    const card2 = cards[j];
                    const card3 = cards[k];
                    
                    if (this.isValidSet(card1, card2, card3)) {
                        validSets.push([card1.id, card2.id, card3.id]);
                    }
                }
            }
        }
        
        return validSets;
    }

    isValidSet(card1, card2, card3) {
        const allHaveFeatureProps = [card1, card2, card3].every(c => 
            c && 'color' in c && 'shape' in c && 'number' in c && 'shading' in c
        );

        let a, b, c;
        if (allHaveFeatureProps) {
            a = [card1.color, card1.shape, card1.number, card1.shading];
            b = [card2.color, card2.shape, card2.number, card2.shading];
            c = [card3.color, card3.shape, card3.number, card3.shading];
        } else {
            a = this.idToFeatures(card1.id);
            b = this.idToFeatures(card2.id);
            c = this.idToFeatures(card3.id);
        }

        for (let i = 0; i < 4; i++) {
            const s = new Set([a[i], b[i], c[i]]);
            if (!(s.size === 1 || s.size === 3)) return false;
        }
        return true;
    }

    idToFeatures(id) {
        let x = id - 1; // 0..80
        const f3 = x % 3; x = Math.floor(x / 3);
        const f2 = x % 3; x = Math.floor(x / 3);
        const f1 = x % 3; x = Math.floor(x / 3);
        const f0 = x % 3;
        return [f0, f1, f2, f3];
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (!window.multiplayerGame) {
        window.multiplayerGame = new CleanMultiplayerSetGame();
    }
});

// Also initialize if DOM is already loaded (for direct navigation)
if (document.readyState !== 'loading' && !window.multiplayerGame) {
    window.multiplayerGame = new CleanMultiplayerSetGame();
}

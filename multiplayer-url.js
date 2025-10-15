// Import GameLogic - we'll need to handle this differently
// import { GameLogic } from './gameLogic.js';

class URLBasedMultiplayerSetGame {
    constructor() {
        this.players = new Map();
        this.currentPlayerId = null;
        this.roomCode = '';
        this.room = null;
        this.gameState = null;
        this.socket = null;
        this.imageCache = new Map();
        this.updateTimeout = null;
        this.isEditingRoom = false;
        this.isEditingPlayer = false;
        
        // Game state
        this.startTime = 0;
        this.gameTimer = null;
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameStarted = false;
        this.gamePhase = 'waiting'; // waiting, playing, finished
        this.debugMode = false;
        this.setHighlighting = false;
        
        // Backend URL
        this.BACKEND_URL = (window.__BACKEND_URL__ || (location.hostname.includes('onrender.com') ? 'https://setgame-backend.onrender.com' : 'http://localhost:3000'));
        // this.gameLogic = new GameLogic(); // Commented out for now
        
        this.preloadImages().then(() => {
            this.initializeFromURL();
            this.initializeUI();
            this.connectToRoom();
        });
    }

    initializeFromURL() {
        // Extract room name from URL path
        const path = window.location.pathname;
        const match = path.match(/\/m\/(.+)/);
        
        if (match && match[1]) {
            this.roomCode = match[1];
        } else if (path === '/m') {
            // If user visits /m, redirect to find available room
            window.location.href = '/m';
            return;
        } else {
            // Default room name if no URL match
            this.roomCode = 'beloved-cheetah';
            this.updateURL();
        }
        
        // Generate player name
        this.playerName = this.generatePlayerName();
        
    }

    generatePlayerName() {
        // For now, we'll use a simple approach and let the server assign the actual name
        // This will be updated when we connect and see existing players
        return 'Player';
    }

    updateURL() {
        const newPath = `/m/${this.roomCode}`;
        if (window.location.pathname !== newPath) {
            window.history.pushState({}, '', newPath);
        }
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
        this.playersContainer = document.getElementById('players-container');
        this.cardContainer = document.getElementById('card-container');
        this.actionBar = document.getElementById('action-bar');
        this.actionMessagesElement = document.getElementById('action-messages');
        this.totalSetsElement = document.getElementById('total-sets');
        this.timerElement = document.getElementById('timer');
        this.newGameButton = document.getElementById('new-game-btn');
        this.pauseButton = document.getElementById('pause-btn');
        
        // Room controls
        this.roomNameDisplay = document.getElementById('room-name-display');
        this.roomNameInput = document.getElementById('room-name-input');
        this.editRoomButton = document.getElementById('edit-room-btn');
        
        // Player controls
        this.playerNameDisplay = document.getElementById('player-name-display');
        this.playerNameInput = document.getElementById('player-name-input');
        this.editPlayerButton = document.getElementById('edit-player-btn');
        
        this.setupEventListeners();
        this.updateRoomDisplay();
        this.updatePlayerDisplay();
    }

    setupEventListeners() {
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        
        // Add debug mode toggle (double-click pause button)
        this.pauseButton.addEventListener('dblclick', () => this.toggleDebugMode());
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Shift + H to toggle set highlighting
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                this.toggleSetHighlighting();
            }
            
            // Ctrl/Cmd + Shift + D to toggle debug mode
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleDebugMode();
            }
        });
        
        // Room editing
        this.editRoomButton.addEventListener('click', () => this.toggleRoomEdit());
        this.roomNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveRoomName();
        });
        this.roomNameInput.addEventListener('blur', () => this.saveRoomName());
        
        // Player editing
        this.editPlayerButton.addEventListener('click', () => this.togglePlayerEdit());
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.savePlayerName();
        });
        this.playerNameInput.addEventListener('blur', () => this.savePlayerName());
    }

    updateRoomDisplay() {
        this.roomNameDisplay.textContent = this.roomCode;
        this.roomNameInput.value = this.roomCode;
    }

    updatePlayerDisplay() {
        this.playerNameDisplay.textContent = this.playerName;
        this.playerNameInput.value = this.playerName;
    }

    toggleRoomEdit() {
        this.isEditingRoom = !this.isEditingRoom;
        
        if (this.isEditingRoom) {
            this.roomNameDisplay.classList.add('hidden');
            this.roomNameInput.classList.remove('hidden');
            this.editRoomButton.textContent = 'Save';
            this.roomNameInput.focus();
        } else {
            this.saveRoomName();
        }
    }

    saveRoomName() {
        const newRoomName = this.roomNameInput.value.trim();
        if (newRoomName && newRoomName !== this.roomCode) {
            this.roomCode = newRoomName;
            this.updateURL();
            this.updateRoomDisplay();
            
            // Reconnect to new room
            if (this.socket) {
                this.socket.disconnect();
            }
            this.connectToRoom();
        }
        
        this.roomNameDisplay.classList.remove('hidden');
        this.roomNameInput.classList.add('hidden');
        this.editRoomButton.textContent = 'Edit Room';
        this.isEditingRoom = false;
    }

    togglePlayerEdit() {
        this.isEditingPlayer = !this.isEditingPlayer;
        
        if (this.isEditingPlayer) {
            this.playerNameDisplay.classList.add('hidden');
            this.playerNameInput.classList.remove('hidden');
            this.editPlayerButton.textContent = 'Save';
            this.playerNameInput.focus();
        } else {
            this.savePlayerName();
        }
    }

    savePlayerName() {
        const newPlayerName = this.playerNameInput.value.trim();
        if (newPlayerName && newPlayerName !== this.playerName) {
            this.playerName = newPlayerName;
            this.updatePlayerDisplay();
            
            // Update player name on server if connected
            if (this.socket && this.currentPlayerId) {
                this.socket.emit('update_player_name', {
                    playerId: this.currentPlayerId,
                    newName: this.playerName
                });
            }
        }
        
        this.playerNameDisplay.classList.remove('hidden');
        this.playerNameInput.classList.add('hidden');
        this.editPlayerButton.textContent = 'Edit Name';
        this.isEditingPlayer = false;
    }

    async connectToRoom() {
        try {
            console.log('Attempting to connect to room:', this.roomCode, 'with player:', this.playerName);
            
            // Connect using Socket.IO
            this.socket = io(this.BACKEND_URL, {
                transports: ['polling', 'websocket'],
                upgrade: true,
                rememberUpgrade: false
            });
            
            this.socket.on('connect', () => {
                console.log('Connected to server, joining room:', this.roomCode);
                this.showActionMessage('Connected to server', 'info');
                console.log('Sending join_room event:', { roomCode: this.roomCode, playerName: this.playerName });
                this.socket.emit('join_room', {
                    roomCode: this.roomCode,
                    playerName: this.playerName
                });
            });
            
            this.socket.on('room_joined', (data) => {
                console.log('Received room_joined event:', data);
                this.handleSocketMessage({ type: 'room_joined', ...data });
            });
            
            this.socket.on('player_joined', (data) => {
                this.handleSocketMessage({ type: 'player_joined', ...data });
            });
            
            this.socket.on('player_left', (data) => {
                this.handleSocketMessage({ type: 'player_left', ...data });
            });
            
            this.socket.on('player_name_updated', (data) => {
                this.handleSocketMessage({ type: 'player_name_updated', ...data });
            });
            
            this.socket.on('game_state_update', (data) => {
                this.handleSocketMessage({ type: 'game_state_update', ...data });
            });
            
            this.socket.on('card_selected', (data) => {
                this.handleCardSelectionFromOtherPlayer(data);
            });
            
            this.socket.on('set_found', (data) => {
                this.handleSetFound(data);
            });
            
            this.socket.on('error', (data) => {
                this.handleSocketMessage({ type: 'error', ...data });
            });
            
            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.showActionMessage('Disconnected from server', 'error');
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Socket.IO connection error:', error);
                this.showActionMessage('Connection error: ' + error.message, 'error');
            });
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
            case 'player_name_updated':
                this.handlePlayerNameUpdated(data);
                break;
            case 'game_state_update':
                this.handleGameStateUpdate(data.gameState, data.players);
                break;
            case 'error':
                this.showActionMessage(data.message, 'error');
                break;
        }
    }

    handleRoomJoined(data) {
        console.log('Room joined:', data);
        this.roomCode = data.roomCode;
        this.currentPlayerId = data.playerId;
        this.room = {
            id: data.roomCode,
            roomCode: data.roomCode,
            createdAt: new Date().toISOString(),
            gameState: data.gameState,
            isActive: true
        };
        
        // Update room display
        this.updateRoomDisplay();
        
        // Update players
        this.players.clear();
        data.players.forEach((player) => {
            this.players.set(player.playerId, player);
        });
        
        // Update our player name if it was auto-assigned
        const ourPlayer = this.players.get(this.currentPlayerId);
        console.log('Our player:', ourPlayer, 'Current player name:', this.playerName);
        if (ourPlayer && ourPlayer.name !== this.playerName) {
            console.log('Updating player name from', this.playerName, 'to', ourPlayer.name);
            this.playerName = ourPlayer.name;
            this.updatePlayerDisplay();
        }
        
        this.updatePlayersDisplay();
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

    handlePlayerNameUpdated(data) {
        const { playerId, oldName, newName } = data;
        const player = this.players.get(playerId);
        
        if (player) {
            player.name = newName;
            this.updatePlayersDisplay();
            
            // Update our own display if it's our player
            if (playerId === this.currentPlayerId) {
                this.playerName = newName;
                this.updatePlayerDisplay();
            }
            
            this.showActionMessage(`${oldName} changed name to ${newName}`, 'info');
        }
    }

    handleGameStateUpdate(gameState, players) {
        if (Array.isArray(players)) {
            // Update players map from payload
            this.players.clear();
            players.forEach((p) => {
                if (p && p.playerId) {
                    this.players.set(p.playerId, p);
                }
            });
            this.updatePlayersDisplay();
        }
        this.loadGameState(gameState);
    }

    loadGameState(gameState) {
        this.gameState = gameState;
        this.updateDisplay();
        
        // Update debug info if debug mode is on
        if (this.debugMode) {
            this.updateDebugInfo();
        }
    }

    updatePlayersDisplay() {
        this.playersContainer.innerHTML = '';
        this.players.forEach((player) => {
            const playerCard = this.createPlayerCard(player);
            this.playersContainer.appendChild(playerCard);
        });
    }
    
    updateTotalSetsDisplay() {
        const totalSets = Array.from(this.players.values()).reduce((sum, player) => sum + player.setsFound, 0);
        this.totalSetsElement.textContent = totalSets.toString();
    }

    createPlayerCard(player) {
        const isCurrentPlayer = player.playerId === this.currentPlayerId;
        const item = document.createElement('div');
        item.className = `player-item ${isCurrentPlayer ? 'active' : ''}`;
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
        
        if (this.gamePhase === 'playing') {
            this.showActionMessage('Game already in progress!', 'error');
            return;
        }
        
        this.gamePhase = 'playing';
        this.socket.emit('start_new_game');
        this.startTimer();
        this.showActionMessage('Game started!', 'info');
    }
    
    startTimer() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        this.startTime = Date.now();
        this.gameStarted = true;
        this.isPaused = false;
        this.pausedTime = 0;
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
    
    togglePause() {
        if (!this.gameStarted) return;
        
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            this.showActionMessage('Game paused', 'info');
        } else {
            this.pausedTime += Date.now() - this.pauseStartTime;
            this.showActionMessage('Game resumed', 'info');
        }
    }
    
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        this.showActionMessage(`Debug mode ${this.debugMode ? 'ON' : 'OFF'}`, 'info');
        
        if (this.debugMode) {
            this.showDebugInfo();
        } else {
            this.hideDebugInfo();
        }
    }
    
    showDebugInfo() {
        // Create debug panel
        let debugPanel = document.getElementById('debug-panel');
        if (!debugPanel) {
            debugPanel = document.createElement('div');
            debugPanel.id = 'debug-panel';
            debugPanel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 12px;
                z-index: 10000;
                max-width: 300px;
            `;
            document.body.appendChild(debugPanel);
        }
        
        this.updateDebugInfo();
    }
    
    hideDebugInfo() {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.remove();
        }
    }
    
    updateDebugInfo() {
        const debugPanel = document.getElementById('debug-panel');
        if (!debugPanel || !this.debugMode) return;
        
        const gameState = this.gameState || {};
        const selectedCards = Array.from(gameState.selectedCards || []);
        const validSets = this.findValidSets();
        
        debugPanel.innerHTML = `
            <div><strong>🐛 DEBUG MODE - SET ANSWERS</strong></div>
            <div>Game Phase: ${this.gamePhase}</div>
            <div>Current Player: ${this.currentPlayerId}</div>
            <div>Selected Cards: [${selectedCards.join(', ')}]</div>
            <div>Sets Found: ${gameState.setsFound || 0}</div>
            <div><strong>Valid Sets Available:</strong></div>
            ${validSets.map((set, index) => 
                `<div style="margin-left: 10px; color: #4CAF50;">Set ${index + 1}: [${set.join(', ')}]</div>`
            ).join('')}
            <div style="margin-top: 10px;">
                <button onclick="window.multiplayerGame.toggleSetHighlighting()" 
                        style="background: #ffc107; color: black; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                    ${this.setHighlighting ? 'Hide' : 'Show'} Set Highlights
                </button>
            </div>
            <div style="margin-top: 10px; font-size: 10px; color: #888;">
                Socket: ${this.socket ? this.socket.readyState === 1 ? 'Connected' : 'Disconnected' : 'None'}
            </div>
        `;
    }
    
    findValidSets() {
        if (!this.gameState || !Array.isArray(this.gameState.cards)) return [];
        const cards = this.gameState.cards;
        const validSets = [];
        const n = cards.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                for (let k = j + 1; k < n; k++) {
                    const a = cards[i];
                    const b = cards[j];
                    const c = cards[k];
                    if (this.isValidSet(a, b, c)) {
                        validSets.push([a, b, c]);
                    }
                }
            }
        }
        return validSets;
    }

    isValidSet(a, b, c) {
        // Map 1..81 -> base-3 features and check all-same/all-different
        const fa = this.idToFeatures(a);
        const fb = this.idToFeatures(b);
        const fc = this.idToFeatures(c);
        for (let i = 0; i < 4; i++) {
            const s = new Set([fa[i], fb[i], fc[i]]);
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
    
    debugLog(message, data = null) {
        if (this.debugMode) {
            console.log(`[DEBUG] ${message}`, data);
            this.updateDebugInfo();
        }
    }
    
    toggleSetHighlighting() {
        this.setHighlighting = !this.setHighlighting;
        
        if (this.setHighlighting) {
            this.highlightValidSets();
        } else {
            this.clearSetHighlights();
        }
        
        // Show action message
        this.showActionMessage(`Set highlighting ${this.setHighlighting ? 'ON' : 'OFF'}`, 'info');
        
        // Update debug panel
        if (this.debugMode) {
            this.updateDebugInfo();
        }
    }
    
    highlightValidSets() {
        const validSets = this.findValidSets();
        
        // Clear existing highlights
        this.clearSetHighlights();
        
        // Add highlights to each valid set
        validSets.forEach((set, index) => {
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

    handleCardSelection(cardId) {
        this.debugLog('Card selection attempt', { cardId, gamePhase: this.gamePhase, currentPlayer: this.currentPlayerId });
        
        if (!this.socket || !this.currentPlayerId)
            return;
        
        // Check if game is in playing phase
        if (this.gamePhase !== 'playing') {
            this.showActionMessage('Game not started yet!', 'error');
            return;
        }
        
        // Add immediate visual feedback
        this.toggleCardSelection(cardId);
        
        this.socket.emit('select_card', {
            cardId: cardId
        });
        
        this.debugLog('Card selection sent to server', { cardId });
    }
    
    toggleCardSelection(cardId) {
        const cardElement = this.cardContainer.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement) {
            const isSelected = cardElement.classList.contains('selected');
            if (isSelected) {
                cardElement.classList.remove('selected');
            } else {
                cardElement.classList.add('selected');
            }
        }
    }
    
    handleCardSelectionFromOtherPlayer(data) {
        const { playerId, cardId, isSelected } = data;
        
        // Update visual state
        const cardElement = this.cardContainer.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement) {
            if (isSelected) {
                cardElement.classList.add('selected');
            } else {
                cardElement.classList.remove('selected');
            }
        }
        
        // Show who selected the card
        const player = this.players.get(playerId);
        if (player) {
            const action = isSelected ? 'selected' : 'deselected';
            this.showActionMessage(`${player.name} ${action} card ${cardId}`, 'info');
        }
    }
    
    handleSetFound(data) {
        const { playerId, cardIds, points } = data;
        
        // Visual feedback for set found
        this.showSetFoundAnimation(cardIds);
        
        // Update player score
        const player = this.players.get(playerId);
        if (player) {
            player.setsFound++;
            player.score += points || 10;
            this.updatePlayersDisplay();
            this.updateTotalSetsDisplay();
        }
        
        // Show celebration message
        this.showActionMessage(`🎉 ${player?.name || 'Player'} found a SET! (+${points || 10} points)`, 'set_found');
        
        // Play sound (if available)
        this.playSetFoundSound();
    }
    
    showSetFoundAnimation(cardIds) {
        // Add visual effect to the cards that formed the set
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
            
            oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
            oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
            oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('Audio not available:', error);
        }
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
        
        const cardIds = Array.isArray(displayedCards) ? displayedCards.slice() : [];
        const selectedCardIds = Array.isArray(selectedCards) ? selectedCards.slice() : [];
        
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
                } else {
                    this.cardContainer.appendChild(cardElement);
                }
            } else {
                const existingEl = existingCards[existingIndex];
                const currentlySelected = existingEl.classList.contains('selected');
                if (currentlySelected !== isSelected) {
                    if (isSelected) {
                        existingEl.classList.add('selected');
                    } else {
                        existingEl.classList.remove('selected');
                    }
                }
                
                const currentPosition = Array.from(this.cardContainer.children).indexOf(existingEl);
                if (currentPosition !== index) {
                    if (index < this.cardContainer.children.length) {
                        this.cardContainer.insertBefore(existingEl, this.cardContainer.children[index]);
                    } else {
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
        } else if (cardCount <= 15) {
            gridClass = 'grid-5-cols';
        } else {
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
        img.alt = `Set Card ${cardId}`;
        img.draggable = false;
        
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        } else {
            img.src = `/cards/${cardId}.png`;
        }
        
        // Add error handling for missing images
        img.onerror = () => {
            console.warn(`Failed to load card image: ${cardId}`);
            img.style.display = 'none';
        };
        
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => {
            this.handleCardSelection(cardId);
        });
        
        return cardDiv;
    }

    togglePause() {
        this.showActionMessage('Pause functionality not implemented yet', 'info');
    }

    showActionMessage(text, type) {
        console.log('Action message:', text, type);
        
        // Show the action bar
        this.actionBar.style.display = 'block';
        
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
            
            // Hide action bar if no messages left
            if (this.actionMessagesElement.children.length === 0) {
                this.actionBar.style.display = 'none';
            }
        }, 3000);
    }
}


// Initialize the URL-based multiplayer game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.multiplayerGame = new URLBasedMultiplayerSetGame();
    } catch (error) {
        console.error('Failed to initialize multiplayer game:', error);
    }
});

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './database/connection.js';
import { Room } from './models/Room.js';
import { Player } from './models/Player.js';
import { Game } from './models/Game.js';
import { Set } from './models/Set.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? ['https://setgame-frontend.onrender.com']
            : ['http://localhost:8000', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://setgame-frontend.onrender.com']
        : ['http://localhost:8000', 'http://127.0.0.1:8000'],
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Store active connections
const activeConnections = new Map(); // playerId -> socketId
const roomConnections = new Map(); // roomId -> Set of playerIds

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/rooms/:roomCode', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const players = await Player.findByRoom(room.id);
        const currentGame = await Game.getCurrentGame(room.id);
        
        res.json({
            room: {
                id: room.id,
                roomCode: room.room_code,
                createdAt: room.created_at,
                gameState: room.game_state,
                isActive: room.is_active
            },
            players: players.map(p => ({
                playerId: p.player_id,
                name: p.name,
                joinedAt: p.joined_at,
                isOnline: p.is_online,
                currentScore: p.current_score,
                setsFound: p.sets_found
            })),
            currentGame
        });
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rooms', async (req, res) => {
    try {
        const room = await Room.create();
        res.json({
            roomCode: room.room_code,
            message: 'Room created successfully'
        });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.get('/api/rooms/:roomCode/players', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const players = await Player.findByRoom(room.id);
        res.json(players.map(p => ({
            playerId: p.player_id,
            name: p.name,
            joinedAt: p.joined_at,
            isOnline: p.is_online,
            currentScore: p.current_score,
            setsFound: p.sets_found
        })));
    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/rooms/:roomCode/history', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const history = await Game.getGameHistory(room.id);
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join_room', async (data) => {
        try {
            const { roomCode, playerName } = data;
            
            // Find or create room
            let room = await Room.findByCode(roomCode);
            if (!room) {
                room = await Room.create();
            }
            
            // Check if room is full
            const playerCount = await Player.getPlayerCount(room.id);
            if (playerCount >= (process.env.MAX_PLAYERS_PER_ROOM || 12)) {
                socket.emit('error', { message: 'Room is full' });
                return;
            }
            
            // Create player
            const player = await Player.create(room.id, playerName);
            
            // Store connection
            activeConnections.set(player.player_id, socket.id);
            if (!roomConnections.has(room.id)) {
                roomConnections.set(room.id, new Set());
            }
            roomConnections.get(room.id).add(player.player_id);
            
            // Join socket room
            socket.join(roomCode);
            socket.playerId = player.player_id;
            socket.roomId = room.id;
            socket.roomCode = roomCode;
            
            // Get current players and game state
            const players = await Player.findByRoom(room.id);
            const gameState = await Room.getGameState(room.id);
            
            // Send room joined confirmation
            socket.emit('room_joined', {
                roomCode,
                playerId: player.player_id,
                players: players.map(p => ({
                    playerId: p.player_id,
                    name: p.name,
                    isOnline: p.is_online,
                    currentScore: p.current_score,
                    setsFound: p.sets_found
                })),
                gameState
            });
            
            // Notify other players
            socket.to(roomCode).emit('player_joined', {
                player: {
                    playerId: player.player_id,
                    name: player.name,
                    isOnline: true,
                    currentScore: 0,
                    setsFound: 0
                }
            });
            
            console.log(`Player ${playerName} joined room ${roomCode}`);
            
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });
    
    socket.on('select_card', async (data) => {
        try {
            const { cardId } = data;
            const roomId = socket.roomId;
            const playerId = socket.playerId;
            if (!roomId || !playerId) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }

            // Load state and players
            const gameState = (await Room.getGameState(roomId)) || {};
            const players = await Player.findByRoom(roomId);

            gameState.deck = Array.isArray(gameState.deck) ? gameState.deck : [];
            gameState.cards = Array.isArray(gameState.cards) ? gameState.cards : [];
            gameState.selectedCards = Array.isArray(gameState.selectedCards) ? gameState.selectedCards : [];
            gameState.gamePhase = gameState.gamePhase || 'waiting';

            // Toggle selection
            if (!gameState.selectedCards.includes(cardId)) {
                gameState.selectedCards.push(cardId);
            } else {
                gameState.selectedCards = gameState.selectedCards.filter((id) => id !== cardId);
            }

            // Handle set validation when 3 cards selected
            if (gameState.selectedCards.length === 3) {
                const [a, b, c] = gameState.selectedCards;
                const isSet = isValidSetById(a, b, c);
                if (isSet) {
                    // Update player score
                    const playerRow = await Player.findByPlayerId(playerId);
                    const newSets = (playerRow?.sets_found || 0) + 1;
                    const newScore = (playerRow?.current_score || 0) + 10;
                    await Player.updateScore(playerId, newSets, newScore);

                    // Record set against current game
                    let currentGame = await Game.getCurrentGame(roomId);
                    if (!currentGame) {
                        currentGame = await Game.create(roomId);
                    }
                    await Set.record(currentGame.id, playerId, [a, b, c], 10);

                    // Replace/remove selected cards
                    const remaining = gameState.cards.filter((id) => id !== a && id !== b && id !== c);
                    // If <= 12, replace in place when possible
                    if (gameState.cards.length <= 12) {
                        const next = [];
                        for (const id of gameState.cards) {
                            if (id === a || id === b || id === c) {
                                const dealt = gameState.deck.pop();
                                if (dealt) next.push(dealt);
                            } else {
                                next.push(id);
                            }
                        }
                        gameState.cards = next;
                    } else {
                        gameState.cards = remaining;
                    }

                    // Ensure at least one visible set (deal 3 if none and deck available)
                    if (!hasVisibleSet(gameState.cards) && gameState.deck.length >= 3) {
                        dealMoreCards(gameState, 3);
                    }
                }
                // Clear selection (both for valid and invalid to keep UX simple)
                gameState.selectedCards = [];
            }

            await Room.updateGameState(roomId, gameState);

            // Send state + latest players snapshot (scores may have changed)
            io.to(socket.roomCode).emit('game_state_update', {
                gameState,
                selectedBy: playerId,
                players: players.map((p) => ({
                    playerId: p.player_id,
                    name: p.name,
                    isOnline: p.is_online,
                    currentScore: p.current_score,
                    setsFound: p.sets_found,
                })),
            });
        } catch (error) {
            console.error('Error selecting card:', error);
            socket.emit('error', { message: 'Failed to select card' });
        }
    });

    socket.on('start_new_game', async () => {
        try {
            const roomId = socket.roomId;
            if (!roomId) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            // Initialize deck and deal 12
            const deck = generateShuffledDeck();
            const gameState = {
                deck,
                cards: [],
                selectedCards: [],
                gamePhase: 'playing',
            };
            dealInitialCards(gameState);

            // Create a new game row
            await Game.create(roomId);

            await Room.updateGameState(roomId, gameState);
            io.to(socket.roomCode).emit('game_state_update', {
                gameState,
            });
        } catch (error) {
            console.error('Error starting new game:', error);
            socket.emit('error', { message: 'Failed to start new game' });
        }
    });

    socket.on('update_player_name', async (data) => {
        try {
            const { playerId, newName } = data;
            const roomId = socket.roomId;
            if (!roomId || !playerId || !newName) {
                socket.emit('error', { message: 'Invalid player update' });
                return;
            }
            // Update name
            const player = await Player.findByPlayerId(playerId);
            if (!player) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }
            await updatePlayerName(playerId, newName);
            io.to(socket.roomCode).emit('player_name_updated', {
                playerId,
                oldName: player.name,
                newName,
            });
        } catch (error) {
            console.error('Error updating player name:', error);
            socket.emit('error', { message: 'Failed to update player name' });
        }
    });
    
    socket.on('disconnect', async () => {
        try {
            const playerId = socket.playerId;
            const roomId = socket.roomId;
            
            if (playerId && roomId) {
                // Update player status
                await Player.setOnlineStatus(playerId, false);
                
                // Remove from room connections
                if (roomConnections.has(roomId)) {
                    roomConnections.get(roomId).delete(playerId);
                }
                
                // Notify other players
                socket.to(socket.roomCode).emit('player_left', {
                    playerId
                });
                
                console.log(`Player ${playerId} left room ${socket.roomCode}`);
            }
            
            // Clean up connections
            activeConnections.delete(playerId);
            
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Cleanup inactive rooms every hour
setInterval(async () => {
    try {
        const cleaned = await Room.cleanupInactiveRooms();
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} inactive rooms`);
        }
    } catch (error) {
        console.error('Error cleaning up rooms:', error);
    }
}, 60 * 60 * 1000); // 1 hour

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

// ---------------- Helper functions ----------------
function generateShuffledDeck() {
    const deck = [];
    for (let i = 1; i <= 81; i++) deck.push(i);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealInitialCards(gameState) {
    dealMoreCards(gameState, Math.min(12, gameState.deck.length));
}

function dealMoreCards(gameState, count = 3) {
    gameState.cards = Array.isArray(gameState.cards) ? gameState.cards : [];
    for (let i = 0; i < count && gameState.deck.length > 0; i++) {
        const next = gameState.deck.pop();
        if (next) gameState.cards.push(next);
    }
}

function hasVisibleSet(cards) {
    const n = cards.length;
    for (let i = 0; i < n - 2; i++) {
        for (let j = i + 1; j < n - 1; j++) {
            for (let k = j + 1; k < n; k++) {
                if (isValidSetById(cards[i], cards[j], cards[k])) return true;
            }
        }
    }
    return false;
}

function isValidSetById(a, b, c) {
    const fa = idToFeatures(a);
    const fb = idToFeatures(b);
    const fc = idToFeatures(c);
    for (let i = 0; i < 4; i++) {
        const s = new Set([fa[i], fb[i], fc[i]]);
        if (!(s.size === 1 || s.size === 3)) return false;
    }
    return true;
}

function idToFeatures(id) {
    // Map 1..81 to four base-3 digits [n, s, h, c]
    let x = (id - 1);
    const f3 = x % 3; x = Math.floor(x / 3);
    const f2 = x % 3; x = Math.floor(x / 3);
    const f1 = x % 3; x = Math.floor(x / 3);
    const f0 = x % 3;
    return [f0, f1, f2, f3];
}

async function updatePlayerName(playerId, newName) {
    const query = 'UPDATE players SET name = $1 WHERE player_id = $2';
    await pool.query(query, [newName, playerId]);
}


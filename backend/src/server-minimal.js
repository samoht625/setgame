import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://setgame.onrender.com', 'https://setgame-backend.onrender.com'] 
            : ['http://localhost:8000', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://setgame.onrender.com', 'https://setgame-backend.onrender.com'] 
        : true,
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Serve static files from the project root directory
app.use(express.static(path.join(__dirname, '../../')));

// Store rooms in memory (temporary)
const rooms = new Map();

// Helper function to find an available room
function findAvailableRoom() {
    const MAX_PLAYERS_PER_ROOM = 12;
    
    // Look for existing rooms that aren't full, preferring rooms with fewer players
    let bestRoom = null;
    let minPlayers = MAX_PLAYERS_PER_ROOM;
    
    for (const [roomCode, room] of rooms) {
        if (room.players.length < MAX_PLAYERS_PER_ROOM && room.players.length < minPlayers) {
            bestRoom = roomCode;
            minPlayers = room.players.length;
        }
    }
    
    if (bestRoom) {
        return bestRoom;
    }
    
    // If no available rooms, create a new one with a random name
    const adjectives = ['happy', 'bright', 'clever', 'swift', 'brave', 'calm', 'wise', 'bold', 'kind', 'gentle'];
    const nouns = ['tiger', 'eagle', 'wolf', 'bear', 'fox', 'lion', 'hawk', 'deer', 'owl', 'raven'];
    
    let roomCode;
    do {
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        roomCode = `${adjective}-${noun}`;
    } while (rooms.has(roomCode));
    
    // Create the new room
    rooms.set(roomCode, {
        roomCode,
        players: [],
        gameState: {
            cards: [],
            selectedCards: [],
            gamePhase: 'waiting'
        }
    });
    
    return roomCode;
}

// Helper function to generate player names
function generatePlayerName(existingPlayers) {
    const existingNames = existingPlayers.map(p => p.name);
    console.log('Existing player names:', existingNames);
    let playerNumber = 1;
    
    while (existingNames.includes(`Player ${playerNumber}`)) {
        playerNumber++;
    }
    
    console.log(`Generated player name: Player ${playerNumber}`);
    return `Player ${playerNumber}`;
}

// Helper function to shuffle an array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle /m route - redirect to available room
app.get('/m', (req, res) => {
    const availableRoom = findAvailableRoom();
    res.redirect(`/m/${availableRoom}`);
});

// Handle multiplayer URL pattern /m/room-name
app.get('/m/:roomName', (req, res) => {
    res.sendFile(path.join(__dirname, '../../multiplayer.html'));
});

app.post('/api/rooms', (req, res) => {
    const roomCode = `room-${Math.random().toString(36).substr(2, 6)}`;
    rooms.set(roomCode, {
        roomCode,
        players: [],
        gameState: {
            cards: [],
            selectedCards: [],
            gamePhase: 'waiting'
        }
    });
    
    res.json({
        roomCode: roomCode,
        message: 'Room created successfully'
    });
});

app.get('/api/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    const room = rooms.get(roomCode);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        room: {
            id: roomCode,
            roomCode: roomCode,
            createdAt: new Date().toISOString(),
            gameState: room.gameState,
            isActive: true
        },
        players: room.players,
        currentGame: null
    });
});

// Catch-all handler: send back index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../index.html'));
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join_room', async (data) => {
        try {
            console.log('Received join_room event:', data);
            const { roomCode, playerName } = data;
            
            // Find or create room
            let room = rooms.get(roomCode);
            if (!room) {
                room = {
                    roomCode,
                    players: [],
                    gameState: {
                        cards: [],
                        selectedCards: [],
                        gamePhase: 'waiting'
                    }
                };
                rooms.set(roomCode, room);
            }
            
            // Auto-assign player name if not provided or if it's just "Player"
            let finalPlayerName = playerName;
            if (!playerName || playerName === 'Player') {
                finalPlayerName = generatePlayerName(room.players);
                console.log(`Auto-assigned player name: ${finalPlayerName} (was: ${playerName})`);
            }
            
            // Create player
            const player = {
                playerId: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: finalPlayerName,
                isOnline: true,
                currentScore: 0,
                setsFound: 0
            };
            
            room.players.push(player);
            
            // Join socket room
            socket.join(roomCode);
            socket.playerId = player.playerId;
            socket.roomCode = roomCode;
            
            // Send room joined confirmation
            socket.emit('room_joined', {
                roomCode,
                playerId: player.playerId,
                players: room.players,
                gameState: room.gameState
            });
            
            // Notify other players
            socket.to(roomCode).emit('player_joined', {
                player: player
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
            const roomCode = socket.roomCode;
            
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Simple card selection logic
            if (!room.gameState.selectedCards.includes(cardId)) {
                room.gameState.selectedCards.push(cardId);
            } else {
                room.gameState.selectedCards = room.gameState.selectedCards.filter(id => id !== cardId);
            }
            
            // Check if we have 3 selected cards
            if (room.gameState.selectedCards.length === 3) {
                // Clear selection
                room.gameState.selectedCards = [];
            }
            
            // Broadcast to all players in room
            io.to(roomCode).emit('game_state_update', {
                gameState: room.gameState,
                selectedBy: socket.playerId
            });
            
        } catch (error) {
            console.error('Error selecting card:', error);
            socket.emit('error', { message: 'Failed to select card' });
        }
    });
    
    socket.on('update_player_name', async (data) => {
        try {
            const { playerId, newName } = data;
            const roomCode = socket.roomCode;
            
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const player = room.players.find(p => p.playerId === playerId);
            if (!player) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }
            
            // Update player name
            const oldName = player.name;
            player.name = newName;
            
            // Notify all players in room
            io.to(roomCode).emit('player_name_updated', {
                playerId,
                oldName,
                newName
            });
            
            console.log(`Player ${playerId} changed name from ${oldName} to ${newName}`);
            
        } catch (error) {
            console.error('Error updating player name:', error);
            socket.emit('error', { message: 'Failed to update player name' });
        }
    });
    
    socket.on('start_new_game', async () => {
        try {
            const roomCode = socket.roomCode;
            
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Generate initial cards (12 cards for Set game) - shuffled
            const allCards = [];
            for (let i = 1; i <= 81; i++) {
                allCards.push(i);
            }
            const shuffledCards = shuffleArray(allCards);
            const initialCards = shuffledCards.slice(0, 12);
            
            // Update room game state
            room.gameState = {
                cards: initialCards,
                selectedCards: [],
                gamePhase: 'playing'
            };
            
            // Broadcast new game state to all players in room
            io.to(roomCode).emit('game_state_update', {
                gameState: room.gameState
            });
            
            console.log(`New game started in room ${roomCode} with ${initialCards.length} cards`);
            
        } catch (error) {
            console.error('Error starting new game:', error);
            socket.emit('error', { message: 'Failed to start new game' });
        }
    });
    
    socket.on('disconnect', async () => {
        try {
            const playerId = socket.playerId;
            const roomCode = socket.roomCode;
            
            if (playerId && roomCode) {
                const room = rooms.get(roomCode);
                if (room) {
                    // Remove player
                    room.players = room.players.filter(p => p.playerId !== playerId);
                    
                    // Notify other players
                    socket.to(roomCode).emit('player_left', {
                        playerId
                    });
                    
                    console.log(`Player ${playerId} left room ${roomCode}`);
                }
            }
            
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

import pool from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';

const adjectives = ['happy', 'clever', 'brave', 'swift', 'bright', 'calm', 'bold', 'wise', 'gentle', 'fierce'];
const animals = ['tiger', 'elephant', 'dolphin', 'eagle', 'lion', 'panda', 'fox', 'owl', 'bear', 'wolf'];

export class Room {
    static generateRoomCode() {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const animal = animals[Math.floor(Math.random() * animals.length)];
        return `${adj}-${animal}`;
    }

    static async create() {
        try {
            const roomCode = this.generateRoomCode();
            const gameState = {
                deck: this.generateDeck(),
                displayedCards: [],
                selectedCards: [],
                gamePhase: 'waiting',
                currentPlayerId: null,
                gameStartTime: null,
                isPaused: false
            };

            const query = `
                INSERT INTO rooms (room_code, game_state)
                VALUES ($1, $2)
                RETURNING *
            `;
            
            const result = await pool.query(query, [roomCode, JSON.stringify(gameState)]);
            return result.rows[0];
        } catch (error) {
            console.error('Error creating room:', error);
            
            // If table doesn't exist, try to create it
            if (error.code === '42P01') { // relation does not exist
                console.log('Tables not found, creating schema...');
                await this.createTables();
                
                // Retry the room creation
                const roomCode = this.generateRoomCode();
                const gameState = {
                    deck: this.generateDeck(),
                    displayedCards: [],
                    selectedCards: [],
                    gamePhase: 'waiting',
                    currentPlayerId: null,
                    gameStartTime: null,
                    isPaused: false
                };

                const query = `
                    INSERT INTO rooms (room_code, game_state)
                    VALUES ($1, $2)
                    RETURNING *
                `;
                
                const result = await pool.query(query, [roomCode, JSON.stringify(gameState)]);
                return result.rows[0];
            }
            
            throw error;
        }
    }

    static async createTables() {
        const schema = `
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                room_code VARCHAR(20) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                game_state JSONB NOT NULL DEFAULT '{}',
                is_active BOOLEAN DEFAULT true,
                max_players INTEGER DEFAULT 12
            );

            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                player_id VARCHAR(50) NOT NULL,
                name VARCHAR(50) NOT NULL,
                joined_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW(),
                is_online BOOLEAN DEFAULT true,
                current_score INTEGER DEFAULT 0,
                sets_found INTEGER DEFAULT 0,
                UNIQUE(room_id, player_id)
            );

            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                started_at TIMESTAMP DEFAULT NOW(),
                ended_at TIMESTAMP NULL,
                winner_player_id VARCHAR(50) NULL,
                total_sets_found INTEGER DEFAULT 0,
                game_duration_seconds INTEGER NULL
            );

            CREATE TABLE IF NOT EXISTS sets (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
                player_id VARCHAR(50) NOT NULL,
                found_at TIMESTAMP DEFAULT NOW(),
                card_ids INTEGER[] NOT NULL,
                points_awarded INTEGER DEFAULT 10
            );

            CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
            CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
            CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
            CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
            CREATE INDEX IF NOT EXISTS idx_sets_game_id ON sets(game_id);
            CREATE INDEX IF NOT EXISTS idx_sets_player_id ON sets(player_id);
        `;
        
        await pool.query(schema);
        console.log('Database tables created successfully');
    }

    static async findByCode(roomCode) {
        const query = 'SELECT * FROM rooms WHERE room_code = $1 AND is_active = true';
        const result = await pool.query(query, [roomCode]);
        return result.rows[0] || null;
    }

    static async updateGameState(roomId, gameState) {
        const query = `
            UPDATE rooms 
            SET game_state = $1, updated_at = NOW()
            WHERE id = $2
        `;
        await pool.query(query, [JSON.stringify(gameState), roomId]);
    }

    static async getGameState(roomId) {
        const query = 'SELECT game_state FROM rooms WHERE id = $1';
        const result = await pool.query(query, [roomId]);
        return result.rows[0]?.game_state || null;
    }

    static generateDeck() {
        const deck = [];
        let id = 1;
        
        const numbers = ['ONE', 'TWO', 'THREE'];
        const shapes = ['DIAMOND', 'SQUIGGLE', 'OVAL'];
        const shadings = ['SOLID', 'STRIPED', 'OPEN'];
        const colors = ['RED', 'GREEN', 'PURPLE'];
        
        for (const number of numbers) {
            for (const shape of shapes) {
                for (const shading of shadings) {
                    for (const color of colors) {
                        deck.push(id++);
                    }
                }
            }
        }
        
        // Shuffle the deck
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        return deck;
    }

    static async cleanupInactiveRooms() {
        const hours = process.env.ROOM_CLEANUP_HOURS || 24;
        const query = `
            UPDATE rooms 
            SET is_active = false 
            WHERE created_at < NOW() - INTERVAL '${hours} hours' 
            AND is_active = true
        `;
        const result = await pool.query(query);
        console.log(`Cleaned up ${result.rowCount} inactive rooms`);
        return result.rowCount;
    }
}


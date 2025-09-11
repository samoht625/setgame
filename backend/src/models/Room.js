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


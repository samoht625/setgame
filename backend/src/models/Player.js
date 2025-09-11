import pool from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';

export class Player {
    static async create(roomId, playerName) {
        const playerId = uuidv4();
        const query = `
            INSERT INTO players (room_id, player_id, name)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        
        const result = await pool.query(query, [roomId, playerId, playerName]);
        return result.rows[0];
    }

    static async findByRoom(roomId) {
        const query = `
            SELECT * FROM players 
            WHERE room_id = $1 AND is_online = true
            ORDER BY joined_at ASC
        `;
        const result = await pool.query(query, [roomId]);
        return result.rows;
    }

    static async findByPlayerId(playerId) {
        const query = 'SELECT * FROM players WHERE player_id = $1';
        const result = await pool.query(query, [playerId]);
        return result.rows[0] || null;
    }

    static async updateLastSeen(playerId) {
        const query = `
            UPDATE players 
            SET last_seen = NOW()
            WHERE player_id = $1
        `;
        await pool.query(query, [playerId]);
    }

    static async setOnlineStatus(playerId, isOnline) {
        const query = `
            UPDATE players 
            SET is_online = $1, last_seen = NOW()
            WHERE player_id = $1
        `;
        await pool.query(query, [isOnline, playerId]);
    }

    static async updateScore(playerId, setsFound, score) {
        const query = `
            UPDATE players 
            SET sets_found = $1, current_score = $2
            WHERE player_id = $3
        `;
        await pool.query(query, [setsFound, score, playerId]);
    }

    static async remove(playerId) {
        const query = 'DELETE FROM players WHERE player_id = $1';
        await pool.query(query, [playerId]);
    }

    static async getPlayerCount(roomId) {
        const query = `
            SELECT COUNT(*) as count 
            FROM players 
            WHERE room_id = $1 AND is_online = true
        `;
        const result = await pool.query(query, [roomId]);
        return parseInt(result.rows[0].count);
    }
}


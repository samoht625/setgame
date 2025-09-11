import pool from '../database/connection.js';

export class Game {
    static async create(roomId) {
        const query = `
            INSERT INTO games (room_id)
            VALUES ($1)
            RETURNING *
        `;
        
        const result = await pool.query(query, [roomId]);
        return result.rows[0];
    }

    static async end(gameId, winnerPlayerId, totalSetsFound, durationSeconds) {
        const query = `
            UPDATE games 
            SET ended_at = NOW(), 
                winner_player_id = $1, 
                total_sets_found = $2, 
                game_duration_seconds = $3
            WHERE id = $4
        `;
        
        await pool.query(query, [winnerPlayerId, totalSetsFound, durationSeconds, gameId]);
    }

    static async getCurrentGame(roomId) {
        const query = `
            SELECT * FROM games 
            WHERE room_id = $1 AND ended_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query, [roomId]);
        return result.rows[0] || null;
    }

    static async getGameHistory(roomId, limit = 10) {
        const query = `
            SELECT g.*, p.name as winner_name
            FROM games g
            LEFT JOIN players p ON g.winner_player_id = p.player_id
            WHERE g.room_id = $1
            ORDER BY g.started_at DESC
            LIMIT $2
        `;
        
        const result = await pool.query(query, [roomId, limit]);
        return result.rows;
    }
}


import pool from '../database/connection.js';

export class Set {
    static async record(gameId, playerId, cardIds, pointsAwarded = 10) {
        const query = `
            INSERT INTO sets (game_id, player_id, card_ids, points_awarded)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        
        const result = await pool.query(query, [gameId, playerId, cardIds, pointsAwarded]);
        return result.rows[0];
    }

    static async getByGame(gameId) {
        const query = `
            SELECT s.*, p.name as player_name
            FROM sets s
            JOIN players p ON s.player_id = p.player_id
            WHERE s.game_id = $1
            ORDER BY s.found_at ASC
        `;
        
        const result = await pool.query(query, [gameId]);
        return result.rows;
    }

    static async getByPlayer(playerId, limit = 50) {
        const query = `
            SELECT s.*, g.room_id, g.started_at as game_started_at
            FROM sets s
            JOIN games g ON s.game_id = g.id
            WHERE s.player_id = $1
            ORDER BY s.found_at DESC
            LIMIT $2
        `;
        
        const result = await pool.query(query, [playerId, limit]);
        return result.rows;
    }

    static async getPlayerStats(playerId) {
        const query = `
            SELECT 
                COUNT(*) as total_sets,
                SUM(points_awarded) as total_points,
                AVG(points_awarded) as avg_points_per_set
            FROM sets
            WHERE player_id = $1
        `;
        
        const result = await pool.query(query, [playerId]);
        return result.rows[0];
    }
}


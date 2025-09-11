-- Set Game Multiplayer Database Schema

-- Create tables
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_sets_game_id ON sets(game_id);
CREATE INDEX IF NOT EXISTS idx_sets_player_id ON sets(player_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


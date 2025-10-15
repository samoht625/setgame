import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
    try {
        console.log('Starting database migration...');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the schema
        await pool.query(schema);
        
        console.log('Database migration completed successfully!');
        
        // Test the connection
        const result = await pool.query('SELECT NOW()');
        console.log('Database connection test:', result.rows[0]);
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();

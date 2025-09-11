#!/usr/bin/env python3
from flask import Flask, send_from_directory, send_file
import os

app = Flask(__name__)

@app.route('/')
def index():
    """Serve the main single player game"""
    return send_file('index.html')

@app.route('/m')
def minimal_multiplayer():
    """Serve the minimal multiplayer game"""
    return send_file('m.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, images, etc.)"""
    # Don't serve Python files or other non-web files
    if filename.endswith(('.py', '.pyc', '.pyo', '.pyd', '.so', '.dylib')):
        return "File not found", 404
    return send_from_directory('.', filename)

if __name__ == '__main__':
    print("🚀 Flask Server starting...")
    print("📱 Minimal Multiplayer: http://localhost:8000/m")
    print("🎮 Single Player: http://localhost:8000/")
    print("Press Ctrl+C to stop")
    
    app.run(host='0.0.0.0', port=8000, debug=True)

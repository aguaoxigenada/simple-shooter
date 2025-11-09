// Multiplayer game server
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameServer } from './game/gameServer.js';

const app = express();
const httpServer = createServer(app);

// CORS configuration - use environment variable in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:3000']);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production' && allowedOrigins.length > 0
            ? allowedOrigins
            : "*", // Allow all in development
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;

// Create game server instance
const gameServer = new GameServer(io);

// Basic HTTP endpoint for health checks
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: gameServer.getPlayerCount() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    gameServer.handlePlayerConnect(socket);

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        gameServer.handlePlayerDisconnect(socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
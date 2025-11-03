// Multiplayer game server
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameServer } from './game/gameServer.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // In production, specify your client URL
        methods: ["GET", "POST"]
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
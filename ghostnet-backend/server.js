// ─── GhostNet Backend — Entry Point ───

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { initEmitter } = require('./socket/emitter');

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'], // polling FIRST for Render compatibility
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

initEmitter(io);

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

const { seedReplayData } = require('./store/memory');
seedReplayData();

server.listen(PORT, () => {
  console.log(`GHOSTNET backend live on port ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});
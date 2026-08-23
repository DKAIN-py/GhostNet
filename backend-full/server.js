import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { registerSocketHandlers } from "./src/socket/handlers.js";

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

let ioInstance = null;

// Create Express app with dynamic io reference getter
const app = createApp(() => ioInstance);

// Create HTTP server with Express app
const server = http.createServer(app);

// Attach Socket.io server to the HTTP server
const io = new SocketIOServer(server, {
  cors: {
    origin: "*", // Matches mock_backend.js: allows Python agent & frontend connections from any host/LAN
    methods: ["GET", "POST"],
  },
  allowEIO3: true, // Crucial for python-socketio (v4 & v5) compatibility
  transports: ["polling", "websocket"],
  pingTimeout: 30000,
  pingInterval: 10000,
});
ioInstance = io;

// Socket.io connection lifecycle
io.on("connection", (socket) => {
  console.log(`[+] Agent client connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

  // Register bidirectional event handlers (Python AI service & frontend clients)
  registerSocketHandlers(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`[-] Agent client disconnected: ${socket.id} (${reason})`);
  });
});

// Periodic background heartbeat / cron task (every 60s)
const cronInterval = setInterval(() => {
  const connectedCount = io.engine.clientsCount;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[GHOSTNET Cron] Heartbeat tick | Active socket clients: ${connectedCount} | Time: ${new Date().toISOString()}`);
  }
}, 60000);

// Start server
server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Starting AutoNet / GHOSTNET Socket.io Receiver on port ${PORT}...`);
  console.log(`🌐 Bound to host: ${HOST}`);
  console.log(`📡 Socket.io endpoint active (cors: *, allowEIO3: true)`);
  console.log(`⚡ Mode: ${process.env.MONGODB_URI ? "MongoDB Connected" : "In-Memory Only"}`);
  console.log(`=======================================================`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`[GHOSTNET] Received ${signal}, shutting down gracefully...`);
  clearInterval(cronInterval);
  io.close(() => {
    server.close(() => {
      console.log("[GHOSTNET] Server closed.");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export { server, app, io };

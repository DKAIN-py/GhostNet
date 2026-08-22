import express from "express";
import cors from "cors";
import { createSignalRouter } from "./src/routes/signalRoutes.js";
import { createCascadeRouter } from "./src/routes/cascadeRoutes.js";
import { createCommsRouter } from "./src/routes/commsRoutes.js";
import { createIncidentRouter } from "./src/routes/incidentRoutes.js";
import { createStateRouter } from "./src/routes/stateRoutes.js";
import { createTestRouter } from "./src/routes/testRoutes.js";
import { createReplayRouter } from "./src/routes/replayRoutes.js";
import { createMeshRouter } from "./src/routes/meshRoutes.js";
import { createDemoRouter } from "./src/routes/demoRoutes.js";

/**
 * CORS Origin Matcher:
 * Allows localhost:*, 127.0.0.1:*, LAN IPs, *.vercel.app, and custom ALLOWED_ORIGINS
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true; // allow non-browser / server-to-server / curl / python
  if (process.env.NODE_ENV !== "production") return true; // Permissive in dev / test
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\.\d+\.\d+(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/.test(origin)) return true;

  if (process.env.ALLOWED_ORIGINS) {
    const list = process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    if (list.includes(origin)) return true;
  }
  return false;
}

export function createApp(io = null) {
  const app = express();

  // CORS middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS origin not allowed: ${origin}`));
        }
      },
      credentials: true,
    })
  );

  // Body parser middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Mount routes
  app.use(createSignalRouter(io));
  app.use(createCascadeRouter(io));
  app.use(createCommsRouter(io));
  app.use(createIncidentRouter(io));
  app.use(createStateRouter());
  app.use(createTestRouter(io));
  app.use(createReplayRouter());
  app.use(createMeshRouter());
  app.use(createDemoRouter(io));

  // Global 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      error: "NotFoundError",
      statusCode: 404,
      message: `Route '${req.method} ${req.originalUrl}' not found`,
    });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error: err.name || "ServerError",
      statusCode,
      message: err.message || "Internal server error",
      details: err.details || undefined,
    });
  });

  return app;
}

export default createApp;

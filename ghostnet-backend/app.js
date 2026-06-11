require('dotenv').config();

const express = require('express');
const cors = require('cors');

const signalRoutes = require('./routes/signals');
const cascadeRoutes = require('./routes/cascade');
const historyRoutes = require('./routes/history');
const replayRoutes = require('./routes/replay');
const { seedReplayData } = require('./store/memory');

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('CORS blocked'));
  }
}));

app.use(express.json());
app.use('/', signalRoutes);
app.use('/', cascadeRoutes);
app.use('/history', historyRoutes);
app.use('/replay', replayRoutes);

seedReplayData();

module.exports = app;
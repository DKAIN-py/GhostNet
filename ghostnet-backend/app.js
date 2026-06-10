// ─── GhostNet Backend — App ───

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const signalRoutes = require('./routes/signals');
const cascadeRoutes = require('./routes/cascade');
const historyRoutes = require('./routes/history');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.use('/', signalRoutes);
app.use('/', cascadeRoutes);
app.use('/history', historyRoutes);

module.exports = app;
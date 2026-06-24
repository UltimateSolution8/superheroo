require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRoutes  = require('./routes/auth');
const heroRoutes  = require('./routes/hero');
const pool        = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ──────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: ['http://142.93.208.120', 'http://localhost', 'http://127.0.0.1', /\.github\.io$/, '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please wait 15 minutes.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/hero', heroRoutes);

// ── Health check ─────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Superherooo API v1.0', status: 'running' });
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.'
  });
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Superherooo API running on port ${PORT}`);
});

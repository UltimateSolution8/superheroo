require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const heroRoutes = require('./routes/hero');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const supabase   = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { success: false, message: 'Too many attempts, please wait 15 minutes.' }
});
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/hero', heroRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

// ── Health check ──────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    // Ping Supabase by selecting from a system function
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check error:', err.message);
    res.status(500).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

app.get('/googlec610d08977be8646.html', (req, res) => {
  res.send('google-site-verification: googlec610d08977be8646.html');
});

app.get('/', (req, res) => {
  res.json({ message: 'Superherooo API v1.0', status: 'running' });
});

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Superherooo API running on port ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
});

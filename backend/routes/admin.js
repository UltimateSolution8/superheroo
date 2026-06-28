const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const supabase = require('../db');

const router = express.Router();
const CONTACTS_FILE = path.join(__dirname, '../contacts.json');

// Fixed admin credentials (for simplicity)
const ADMIN_EMAIL = 'admin@superherooo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_admin_key';

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// Middleware to protect routes
const authAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error('Not admin');
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

router.get('/users', authAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, mobile, role, is_active, created_at')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/heroes', authAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, full_name, email, mobile, is_active, created_at,
        professionals(primary_service, city, profile_status, total_jobs, rating)
      `)
      .eq('role', 'professional')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    // flatten response a bit
    const heroes = data.map(u => ({
      ...u,
      primary_service: u.professionals?.primary_service || 'N/A',
      city: u.professionals?.city || 'N/A',
      profile_status: u.professionals?.profile_status || 'N/A',
      total_jobs: u.professionals?.total_jobs || 0,
      rating: u.professionals?.rating || 0
    }));
    res.json({ success: true, data: heroes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/contacts', authAdmin, (req, res) => {
  try {
    let contacts = [];
    if (fs.existsSync(CONTACTS_FILE)) {
      contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE));
    }
    // Reverse to show newest first
    contacts.reverse();
    res.json({ success: true, data: contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error reading contacts' });
  }
});

module.exports = router;

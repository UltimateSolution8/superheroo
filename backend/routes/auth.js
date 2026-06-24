const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool    = require('../db');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const sendError = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

// ── Validation rules ─────────────────────────────────────
const signupValidation = [
  body('full_name')
    .trim().notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters.'),

  body('email')
    .trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('mobile')
    .trim().notEmpty().withMessage('Mobile number is required.')
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must have at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must have at least one number.'),
];

const loginValidation = [
  body('email').trim().isEmail().withMessage('Enter a valid email.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

// ── POST /api/auth/signup ────────────────────────────────
router.post('/signup', signupValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }

  const { full_name, email, mobile, password } = req.body;

  try {
    // Check duplicates
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR mobile = $2',
      [email, mobile]
    );
    if (existing.rows.length > 0) {
      return sendError(res, 409, 'An account with this email or mobile already exists.');
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, mobile, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, full_name, email, mobile, role, created_at`,
      [full_name, email, mobile, password_hash]
    );

    const user  = result.rows[0];
    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: `Welcome to Superherooo, ${user.full_name}! 🎉`,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, mobile: user.mobile, role: user.role },
    });
  } catch (err) {
    console.error('Signup error:', err);
    return sendError(res, 500, 'Server error during signup. Please try again.');
  }
});

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, full_name, email, mobile, role, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return sendError(res, 403, 'Your account has been suspended. Please contact support.');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const token = signToken(user);

    return res.json({
      success: true,
      message: `Welcome back, ${user.full_name}! 👋`,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, mobile: user.mobile, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return sendError(res, 500, 'Server error during login. Please try again.');
  }
});

module.exports = router;

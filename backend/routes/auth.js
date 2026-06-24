const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const supabase = require('../db');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

// ── Validation ────────────────────────────────────────────
const signupRules = [
  body('full_name').trim().notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters.'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('mobile').trim().matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must include one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must include one number.'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Enter a valid email.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

// ── POST /api/auth/signup ─────────────────────────────────
router.post('/signup', signupRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const { full_name, email, mobile, password } = req.body;

  try {
    // Check for existing user
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},mobile.eq.${mobile}`)
      .maybeSingle();

    if (existing)
      return fail(res, 409, 'An account with this email or mobile already exists.');

    const password_hash = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ full_name, email, mobile, password_hash, role: 'customer' })
      .select('id, full_name, email, mobile, role')
      .single();

    if (error) {
      console.error('Signup insert error:', error);
      return fail(res, 500, 'Could not create account. Please try again.');
    }

    const token = signToken(user);
    return res.status(201).json({
      success: true,
      message: `Welcome to Superherooo, ${user.full_name}! 🎉`,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, mobile: user.mobile, role: user.role },
    });
  } catch (err) {
    console.error('Signup error:', err);
    return fail(res, 500, 'Server error. Please try again.');
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', loginRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, full_name, email, mobile, role, password_hash, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) { console.error('Login query error:', error); return fail(res, 500, 'Server error.'); }
    if (!user)  return fail(res, 401, 'Invalid email or password.');
    if (!user.is_active) return fail(res, 403, 'Account suspended. Please contact support.');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return fail(res, 401, 'Invalid email or password.');

    const token = signToken(user);
    return res.json({
      success: true,
      message: `Welcome back, ${user.full_name}! 👋`,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, mobile: user.mobile, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return fail(res, 500, 'Server error. Please try again.');
  }
});

module.exports = router;

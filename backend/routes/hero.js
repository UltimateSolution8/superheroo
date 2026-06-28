const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const supabase = require('../db');

const router = express.Router();

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

// ── Validation ────────────────────────────────────────────
const heroRules = [
  body('full_name').trim().notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters.'),
  body('email').trim().isEmail().withMessage('Enter a valid email.').normalizeEmail(),
  body('mobile').trim().matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Must include one uppercase letter.')
    .matches(/[0-9]/).withMessage('Must include one number.'),
  body('primary_service').notEmpty().withMessage('Primary service is required.'),
  body('experience_years').optional({ checkFalsy: true })
    .isInt({ min: 0, max: 50 }).withMessage('Experience must be 0–50 years.'),
  body('pincode').optional({ checkFalsy: true })
    .matches(/^\d{6}$/).withMessage('Pincode must be 6 digits.'),
  body('aadhar_number').optional({ checkFalsy: true })
    .matches(/^\d{12}$/).withMessage('Aadhaar must be 12 digits.'),
  body('pan_number').optional({ checkFalsy: true })
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Enter a valid PAN (e.g. ABCDE1234F).'),
];

// ── POST /api/hero/apply ──────────────────────────────────
router.post('/apply', heroRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const {
    full_name, email, mobile, password, primary_service,
    secondary_services, experience_years, city, pincode, address,
    aadhar_number, pan_number,
    bio, languages, availability,
  } = req.body;

  try {
    // Check duplicates
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'professional')
      .or(`email.eq.${email},mobile.eq.${mobile}`)
      .maybeSingle();

    if (existing)
      return fail(res, 409, 'An account with this email or mobile already exists.');

    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ full_name, email, mobile, password_hash, role: 'professional' })
      .select('id, full_name')
      .single();

    if (userErr) {
      console.error('Hero user insert error:', userErr);
      return fail(res, 500, 'Could not create account. Please try again.');
    }

    // Create professional profile
    const { error: profErr } = await supabase
      .from('professionals')
      .insert({
        user_id:             user.id,
        primary_service,
        secondary_services:  secondary_services || [],
        experience_years:    experience_years   || null,
        city:                city               || null,
        pincode:             pincode            || null,
        address:             address            || null,
        aadhar_number:       aadhar_number      || null,
        pan_number:          pan_number         || null,
        bio:                 bio                || null,
        languages:           languages          || [],
        availability:        availability       || null,
      });

    if (profErr) {
      console.error('Professional profile error:', profErr);
      // Rollback user (best-effort)
      await supabase.from('users').delete().eq('id', user.id);
      return fail(res, 500, 'Could not save professional profile. Please try again.');
    }

    return res.status(201).json({
      success: true,
      message: `Application received, ${user.full_name}! 🦸 Our team will review and contact you within 48 hours.`,
    });
  } catch (err) {
    console.error('Hero apply error:', err);
    return fail(res, 500, 'Server error. Please try again.');
  }
});

module.exports = router;

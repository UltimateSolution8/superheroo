const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool    = require('../db');

const router = express.Router();

// ── Validation rules ─────────────────────────────────────
const heroValidation = [
  // Required fields
  body('full_name').trim().notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters.'),

  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),

  body('mobile').trim().matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number.'),

  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Must include at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Must include at least one number.'),

  body('primary_service').notEmpty().withMessage('Primary service/skill is required.'),

  // Optional but validated if provided
  body('experience_years').optional({ checkFalsy: true })
    .isInt({ min: 0, max: 50 }).withMessage('Experience must be 0–50 years.'),

  body('pincode').optional({ checkFalsy: true })
    .matches(/^\d{6}$/).withMessage('Pincode must be 6 digits.'),

  body('aadhar_number').optional({ checkFalsy: true })
    .matches(/^\d{12}$/).withMessage('Aadhaar must be 12 digits.'),

  body('pan_number').optional({ checkFalsy: true })
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Enter a valid PAN number (e.g. ABCDE1234F).'),
];

// ── POST /api/hero/apply ─────────────────────────────────
router.post('/apply', heroValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }

  const {
    full_name, email, mobile, password, primary_service,
    secondary_services, experience_years, city, pincode, address,
    aadhar_number, pan_number, bank_account, ifsc_code,
    bio, languages, availability,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check duplicate
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1 OR mobile = $2',
      [email, mobile]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'An account with this email or mobile already exists.',
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Create user account
    const userResult = await client.query(
      `INSERT INTO users (full_name, email, mobile, password_hash, role)
       VALUES ($1, $2, $3, $4, 'professional')
       RETURNING id, full_name, email`,
      [full_name, email, mobile, password_hash]
    );
    const user = userResult.rows[0];

    // Create professional profile
    await client.query(
      `INSERT INTO professionals
         (user_id, primary_service, secondary_services, experience_years,
          city, pincode, address, aadhar_number, pan_number,
          bank_account, ifsc_code, bio, languages, availability)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        user.id,
        primary_service,
        secondary_services || [],
        experience_years || null,
        city || null,
        pincode || null,
        address || null,
        aadhar_number || null,
        pan_number || null,
        bank_account || null,
        ifsc_code || null,
        bio || null,
        languages || [],
        availability || null,
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `Application received, ${full_name}! 🦸 Our team will review and contact you within 48 hours.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Hero apply error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing your application. Please try again.',
    });
  } finally {
    client.release();
  }
});

module.exports = router;

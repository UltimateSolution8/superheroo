-- ============================================================
--  Superherooo Database Schema
--  Run this in Supabase SQL Editor
-- ============================================================

-- USERS table (customers + professionals base)
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  full_name    VARCHAR(120) NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  mobile       VARCHAR(15)  UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','professional','admin')),
  is_verified  BOOLEAN      DEFAULT FALSE,
  is_active    BOOLEAN      DEFAULT TRUE,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- PROFESSIONALS extended profile
CREATE TABLE IF NOT EXISTS professionals (
  id               SERIAL PRIMARY KEY,
  user_id          INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  primary_service  VARCHAR(80)  NOT NULL,
  secondary_services TEXT[],
  experience_years INT,
  city             VARCHAR(80),
  pincode          VARCHAR(10),
  address          TEXT,
  aadhar_number    VARCHAR(16),
  pan_number       VARCHAR(12),
  bank_account     VARCHAR(25),
  ifsc_code        VARCHAR(15),
  bio              TEXT,
  languages        TEXT[],
  availability     VARCHAR(50),
  profile_status   VARCHAR(20) DEFAULT 'pending' CHECK (profile_status IN ('pending','approved','rejected','suspended')),
  rating           NUMERIC(2,1) DEFAULT 0,
  total_jobs       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- CONTACT MESSAGES table
CREATE TABLE IF NOT EXISTS contact_messages (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  subject      VARCHAR(200),
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professionals_updated_at BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

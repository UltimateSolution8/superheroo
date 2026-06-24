#!/bin/bash
# Superherooo Backend — Server Setup & Deploy Script
set -e

echo "======================================"
echo "  Superherooo Backend Deployment"
echo "======================================"

# 1. Update packages
apt-get update -y

# 2. Install Node.js 20 LTS if not present
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node --version)  NPM: $(npm --version)"

# 3. Install PM2 globally
npm install -g pm2 2>/dev/null || true

# 4. Copy app to /opt/superherooo-api
mkdir -p /opt/superherooo-api
cp -r /tmp/superherooo-backend/* /opt/superherooo-api/

cd /opt/superherooo-api
npm install --production

# 5. Run DB schema migration
echo "Running DB schema..."
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync('schema.sql', 'utf8');
pool.query(sql).then(() => { console.log('Schema applied!'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(0); });
"

# 6. Start / restart with PM2
pm2 delete superherooo-api 2>/dev/null || true
pm2 start server.js --name superherooo-api --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true

echo ""
echo "✅ Deployment complete!"
echo "   API running at http://142.93.208.120:3001"
pm2 status

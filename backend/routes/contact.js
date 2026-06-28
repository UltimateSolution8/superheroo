const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const CONTACTS_FILE = path.join(__dirname, '../contacts.json');

// Initialize contacts file
if (!fs.existsSync(CONTACTS_FILE)) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));
}

router.post('/', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
  }

  try {
    const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE));
    const newContact = {
      id: Date.now(),
      name,
      email,
      subject: subject || '',
      message,
      created_at: new Date().toISOString()
    };
    contacts.push(newContact);
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));

    return res.status(201).json({ success: true, message: 'Message sent successfully.' });
  } catch (err) {
    console.error('Contact save error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;

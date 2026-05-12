import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// Single admin user — credentials set via env vars
const ADMIN_USER = process.env.ADMIN_USERNAME || 'jonathan';
const ADMIN_PASS_HASH = process.env.ADMIN_PASSWORD_HASH; // bcrypt hash
const ADMIN_PASS_PLAIN = process.env.ADMIN_PASSWORD;     // plain text fallback

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username.toLowerCase() !== ADMIN_USER.toLowerCase()) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let valid = false;
  if (ADMIN_PASS_HASH) {
    valid = await bcrypt.compare(password, ADMIN_PASS_HASH);
  } else if (ADMIN_PASS_PLAIN) {
    valid = password === ADMIN_PASS_PLAIN;
  } else {
    return res.status(500).json({ error: 'No admin password configured' });
  }

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username: ADMIN_USER },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token, username: ADMIN_USER });
});

export default router;

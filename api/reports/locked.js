import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const JWT_SECRET = process.env.JWT_SECRET;

// Load locked report data (server-side only — never shipped to browser)
let lockedData = null;
function getLockedData() {
  if (!lockedData) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    lockedData = JSON.parse(
      readFileSync(join(__dirname, '..', 'data', 'locked-reports.json'), 'utf-8')
    );
  }
  return lockedData;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Require valid JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);

    if (payload.tier !== 'pro') {
      return res.status(403).json({ error: 'Pro subscription required' });
    }

    // Return locked report company data
    const data = getLockedData();
    return res.status(200).json({ success: true, reports: data });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please verify again.' });
    }
    return res.status(401).json({ error: 'Invalid session' });
  }
}

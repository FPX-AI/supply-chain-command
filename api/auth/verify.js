import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Issue a longer-lived session token (30 days)
    const sessionToken = jwt.sign(
      { email: payload.email, customerId: payload.customerId, tier: 'pro' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      sessionToken,
      email: payload.email,
      tier: 'pro',
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Link expired. Request a new one.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

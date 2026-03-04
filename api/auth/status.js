import jwt from 'jsonwebtoken';
import Stripe from 'stripe';

const JWT_SECRET = process.env.JWT_SECRET;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(200).json({ tier: 'free', authenticated: false });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);

    // Re-verify Stripe subscription is still active
    if (payload.customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: payload.customerId,
        status: 'active',
        limit: 1,
      });
      if (subscriptions.data.length === 0) {
        return res.status(200).json({ tier: 'free', authenticated: false, message: 'Subscription expired' });
      }
    }

    return res.status(200).json({
      tier: 'pro',
      authenticated: true,
      email: payload.email,
    });
  } catch (err) {
    return res.status(200).json({ tier: 'free', authenticated: false });
  }
}

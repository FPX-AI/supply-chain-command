import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET;
const APP_URL = process.env.APP_URL || 'https://command.fpx.world';

function escapeStripeSearchValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function findCustomersByEmail(email) {
  const customersById = new Map();

  // Stripe's list email filter is exact and case-sensitive. Search is
  // case-insensitive, but may lag briefly, so keep list as a fallback.
  try {
    const searchResults = await stripe.customers.search({
      query: `email:"${escapeStripeSearchValue(email)}"`,
      limit: 10,
    });
    for (const customer of searchResults.data) customersById.set(customer.id, customer);
  } catch (err) {
    console.warn('Stripe customer search failed, falling back to exact lookup:', err);
  }

  const exactEmails = [...new Set([email, email.toLowerCase()])];
  for (const exactEmail of exactEmails) {
    const listResults = await stripe.customers.list({ email: exactEmail, limit: 10 });
    for (const customer of listResults.data) customersById.set(customer.id, customer);
  }

  return [...customersById.values()];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (!normalizedEmail) return res.status(400).json({ error: 'Email required' });

  try {
    // Search Stripe for this email across all customers
    const customers = await findCustomersByEmail(normalizedEmail);

    let hasActiveSubscription = false;
    let customerId = null;

    for (const customer of customers) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 5,
      });
      if (subscriptions.data.length > 0) {
        hasActiveSubscription = true;
        customerId = customer.id;
        break;
      }
    }

    if (!hasActiveSubscription) {
      return res.status(200).json({
        success: false,
        message: 'No active Substack Pro subscription found for this email. Subscribe at fpxai.substack.com/subscribe',
      });
    }

    // Generate a magic link token (short-lived)
    const magicToken = jwt.sign(
      { email: normalizedEmail.toLowerCase(), customerId },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const verifyUrl = `${APP_URL}?token=${magicToken}`;

    // Send magic link email
    await resend.emails.send({
      from: 'FPX AI No Reply <noreply@fpx.world>',
      to: normalizedEmail,
      subject: 'Your FPX AI Supply Chain COMMAND Access Link',
      html: `
        <div style="background:#0a0a0a;color:#00ff41;font-family:monospace;padding:40px;max-width:500px;margin:0 auto;">
          <h1 style="color:#ff6600;font-size:18px;border-bottom:1px solid #333;padding-bottom:12px;">
            FPX SUPPLY CHAIN COMMAND
          </h1>
          <p style="color:#888;font-size:13px;">CLEARANCE VERIFICATION</p>
          <p style="color:#ccc;font-size:14px;line-height:1.6;">
            Your Pro subscription has been verified. Click below to activate COMMAND-level access:
          </p>
          <a href="${verifyUrl}" style="display:inline-block;background:#ff6600;color:#000;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:14px;margin:20px 0;letter-spacing:1px;">
            ACTIVATE ACCESS →
          </a>
          <p style="color:#555;font-size:11px;margin-top:24px;">
            This link expires in 15 minutes. If you didn't request this, ignore this email.
          </p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: 'Magic link sent! Check your email.' });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

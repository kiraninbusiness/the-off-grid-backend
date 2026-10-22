import rateLimit from 'express-rate-limit';

/*
  RATE LIMITING

  Keyed by IP by default (express-rate-limit's standard behavior).
  Trust proxy must be set correctly in server.js (Render/Vercel sit
  behind a proxy) or every request will appear to come from the same
  internal IP and these limits would either lock out the whole site or
  do nothing — see `app.set('trust proxy', 1)` in server.js.
*/

const make = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message },
});

export const loginLimiter = make(15 * 60 * 1000, 10, 'Too many login attempts. Please try again in 15 minutes.');
export const forgotPasswordLimiter = make(15 * 60 * 1000, 5, 'Too many password reset requests. Please try again in 15 minutes.');
export const registerLimiter = make(60 * 60 * 1000, 5, 'Too many accounts created from this network. Please try again later.');
export const contactLimiter = make(60 * 60 * 1000, 10, 'Too many messages sent. Please try again later.');
export const newsletterLimiter = make(60 * 60 * 1000, 5, 'Too many signup attempts. Please try again later.');
export const generalApiLimiter = make(15 * 60 * 1000, 300, 'Too many requests. Please slow down.');

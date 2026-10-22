import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import {initDb} from './db.js';
import auth from './routes/auth.js';
import products from './routes/products.js';
import orders from './routes/orders.js';
import reviews from './routes/reviews.js';
import coupons from './routes/coupons.js';
import newsletter from './routes/newsletter.js';
import profile from './routes/profile.js';
import variants from './routes/variants.js';
import returns from './routes/returns.js';
import adminRoutes from './routes/admin.js';
import upload from './routes/upload.js';
import giftcards from './routes/giftcards.js';
import cart from './routes/cart.js';
import combos from './routes/combos.js';
import abandoned, { startAbandonedCartScheduler } from './routes/abandoned.js';
import webhooks from './routes/webhooks.js';
import contact from './routes/contact.js';
import notifications from './routes/notifications.js';
import customer from './routes/customer.js';
import { loginLimiter, forgotPasswordLimiter, registerLimiter, contactLimiter, newsletterLimiter, generalApiLimiter } from './middleware/rateLimiters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app=express();

// Render/Vercel sit behind a reverse proxy — without this, every
// request looks like it comes from the same internal IP, which
// breaks both rate limiting (keyed by IP) and anything reading
// req.ip/X-Forwarded-For correctly.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://accounts.google.com", "https://checkout.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://accounts.google.com"],
      frameSrc: ["https://accounts.google.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // would otherwise block the Razorpay/Google iframes above
}));

/*
  CORS — explicit origin whitelist rather than a single value, so
  both the apex and www domains work without allowing arbitrary
  origins. Set CLIENT_URL (and optionally CLIENT_URL_WWW) in
  production; both fall back to localhost for local dev.
*/
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  process.env.CLIENT_URL_WWW,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests / non-browser tools (curl, Postman, the
    // Razorpay webhook) don't send an Origin header at all.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

/*
  Razorpay webhooks MUST be mounted before express.json() and parsed as
  a raw Buffer — the webhook signature is computed over the exact raw
  request bytes, and JSON-parsing + re-serializing would change them,
  breaking every signature check. See routes/webhooks.js for details.
*/
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooks);

app.use(express.json({limit:'1mb'}));
app.use(generalApiLimiter);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/contact', contactLimiter);
app.use('/api/newsletter', newsletterLimiter);
app.use('/api/auth',auth);
app.use('/api/products',products);
app.use('/api/orders',orders);
app.use('/api/reviews',reviews);
app.use('/api/coupons',coupons);
app.use('/api/newsletter',newsletter);
app.use('/api/profile',profile);
app.use('/api/products',variants);
app.use('/api/returns',returns);
app.use('/api/admin',adminRoutes);
app.use('/api/upload',upload);
app.use('/api/gift-cards',giftcards);
app.use('/api/cart',cart);
app.use('/api/combos',combos);
app.use('/api/admin/abandoned-carts',abandoned);
app.use('/api/contact',contact);
app.use('/api/notifications',notifications);
app.use('/api/customer',customer);

/*
  STANDARDIZED ERROR HANDLING
  Never leak stack traces, SQL errors, or filesystem paths to the
  client — those go to the server logs only. Must be the LAST
  app.use() — Express identifies error handlers by their 4-argument
  signature.
*/
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Request not allowed' });
  }
  res.status(err.status || 500).json({ message: 'Something went wrong. Please try again.' });
});

const port=process.env.PORT||5000;
initDb().then(()=>app.listen(port,()=>{console.log(`API running on http://localhost:${port}`);startAbandonedCartScheduler();}))
.catch(e=>{console.error(e);process.exit(1)});

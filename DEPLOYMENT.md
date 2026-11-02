# Deploy the backend

Render service `the-off-grid-api`: root directory `server`, build `npm install`, start `npm start`.

Required environment: `DATABASE_URL` (Neon), `JWT_SECRET`, `CLIENT_URL`, `CLIENT_URL_WWW`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Optional: `GEMINI_API_KEY` (photo search), `CRON_SECRET`,
`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `ENABLE_CAMPAIGN_CRON`, `ENABLE_ABANDONED_CART_CRON`.
See `server/.env.example`.

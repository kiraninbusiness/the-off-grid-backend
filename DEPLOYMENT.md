# Deploy THE OFF GRID
Frontend: Vercel, root `client`, build `npm run build`.
Backend: Render, root `server`, build `npm install`, start `npm start`.
Database: Render PostgreSQL; set DATABASE_URL on backend.
Frontend env: VITE_API_URL=https://YOUR-BACKEND.onrender.com/api
Backend env: CLIENT_URL=https://YOUR-FRONTEND.vercel.app and JWT_SECRET.
Razorpay: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET stay on the backend.

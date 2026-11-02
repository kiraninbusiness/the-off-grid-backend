import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';
import { estimateDelivery } from '../services/deliveryEstimate.js';
import { tierProgress, TIERS, birthdayRewardDue, cleanBirthday, BIRTHDAY_POINTS } from '../services/club.js';

const router = Router();
router.use(auth);

// Customer loyalty wallet + transaction-style history derived from settled orders.
router.get('/loyalty', async (req,res)=>{
  try {
    const user = await pool.query(`SELECT id,name,loyalty_points,referral_code FROM users WHERE id=$1`,[req.user.id]);
    if(!user.rows.length) return res.status(404).json({message:'User not found'});
    const orders = await pool.query(`
      SELECT id,total,points_earned,points_redeemed,created_at,status
      FROM orders WHERE user_id=$1 AND (points_earned > 0 OR points_redeemed > 0)
      ORDER BY created_at DESC LIMIT 100`,[req.user.id]);
    const referrals = await pool.query(`SELECT COUNT(*)::int count FROM users WHERE referred_by=$1`,[req.user.id]);
    const spend = await pool.query(`SELECT COALESCE(SUM(total),0)::int total FROM orders WHERE user_id=$1 AND status='delivered'`,[req.user.id]);
    res.json({points:Number(user.rows[0].loyalty_points)||0, referral_code:user.rows[0].referral_code, referral_count:referrals.rows[0].count, delivered_spend:Number(spend.rows[0].total)||0, transactions:orders.rows});
  } catch(e){ console.error(e); res.status(500).json({message:'Could not load rewards'}); }
});

// OFF GRID CLUB: tier, progress, perks, birthday reward and points history.
router.get('/club', async (req,res)=>{
  try {
    const u = await pool.query(`SELECT loyalty_points, referral_code, birthday, birthday_reward_year FROM users WHERE id=$1`,[req.user.id]);
    if(!u.rows.length) return res.status(404).json({message:'User not found'});
    const row = u.rows[0];
    const spend = await pool.query(`SELECT COALESCE(SUM(total),0)::int AS total FROM orders WHERE user_id=$1 AND status='delivered'`,[req.user.id]);
    const dob = row.birthday ? new Date(row.birthday).toISOString().slice(0,10) : null;
    let birthdayGranted = 0;
    if (dob && birthdayRewardDue(dob, row.birthday_reward_year)) {
      // The WHERE clause makes the grant happen once even if two requests race.
      const year = new Date().getUTCFullYear();
      const claimed = await pool.query(
        `UPDATE users SET birthday_reward_year=$1, loyalty_points=loyalty_points+$2
          WHERE id=$3 AND (birthday_reward_year IS DISTINCT FROM $1) RETURNING loyalty_points`,
        [year, BIRTHDAY_POINTS, req.user.id]);
      if (claimed.rows.length) {
        birthdayGranted = BIRTHDAY_POINTS;
        row.loyalty_points = claimed.rows[0].loyalty_points;
        await pool.query(`INSERT INTO points_ledger (user_id, delta, reason) VALUES ($1,$2,'birthday')`,[req.user.id, BIRTHDAY_POINTS]);
      }
    }
    const history = await pool.query(`SELECT id, delta, reason, order_id, created_at FROM points_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100`,[req.user.id]);
    const referrals = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE referred_by=$1`,[req.user.id]);
    res.json({
      ...tierProgress(spend.rows[0].total),
      points: Number(row.loyalty_points)||0,
      referral_code: row.referral_code,
      referral_count: referrals.rows[0].count,
      birthday: dob,
      birthday_points_granted: birthdayGranted,
      birthday_reward_points: BIRTHDAY_POINTS,
      tiers: TIERS.map(({key,name,minSpend,multiplier,perks})=>({key,name,min_spend:minSpend,multiplier,perks})),
      history: history.rows,
    });
  } catch(e){ console.error(e); res.status(500).json({message:'Could not load OFF GRID CLUB'}); }
});

// Birthday can be set once, so the yearly reward cannot be farmed by changing it.
router.put('/birthday', async (req,res)=>{
  const dob = cleanBirthday(req.body?.birthday);
  if (!dob) return res.status(400).json({message:'Enter a valid date of birth (YYYY-MM-DD)'});
  try {
    const r = await pool.query(`UPDATE users SET birthday=$1 WHERE id=$2 AND birthday IS NULL RETURNING id`,[dob, req.user.id]);
    if (!r.rows.length) return res.status(409).json({message:'Your birthday is already saved. Contact support to change it.'});
    res.json({birthday: dob});
  } catch(e){ console.error(e); res.status(500).json({message:'Could not save birthday'}); }
});

router.get('/referrals', async (req,res)=>{
  const {rows}=await pool.query(`SELECT referral_code FROM users WHERE id=$1`,[req.user.id]);
  if(!rows.length) return res.status(404).json({message:'User not found'});
  const referrals=await pool.query(`SELECT id,name,created_at,referral_reward_paid FROM users WHERE referred_by=$1 ORDER BY created_at DESC`,[req.user.id]);
  res.json({code:rows[0].referral_code, referrals:referrals.rows, reward:'Earn loyalty points when a referred friend completes their first qualifying purchase.'});
});

router.get('/recommendations', async (req,res)=>{
  const productId=Number(req.query.product_id)||0;
  try {
    if(productId){
      const p=await pool.query(`SELECT category,gender FROM products WHERE id=$1`,[productId]);
      if(p.rows.length){
        const {rows}=await pool.query(`SELECT * FROM products WHERE id<>$1 AND category=$2 AND stock>0 ORDER BY created_at DESC LIMIT 8`,[productId,p.rows[0].category]);
        return res.json(rows);
      }
    }
    const {rows}=await pool.query(`SELECT * FROM products WHERE stock>0 ORDER BY created_at DESC LIMIT 8`);
    res.json(rows);
  } catch(e){res.status(500).json({message:'Could not load recommendations'});}
});

router.post('/stock-alerts', async(req,res)=>{
  const productId=Number(req.body.product_id); const variantId=req.body.variant_id?Number(req.body.variant_id):null;
  if(!productId) return res.status(400).json({message:'product_id is required'});
  const u=await pool.query(`SELECT email FROM users WHERE id=$1`,[req.user.id]);
  if(!u.rows.length) return res.status(404).json({message:'User not found'});
  await pool.query(`INSERT INTO stock_alerts(product_id,email,variant_id,notified) VALUES($1,$2,$3,FALSE) ON CONFLICT DO NOTHING`,[productId,u.rows[0].email,variantId]);
  res.status(201).json({success:true,message:'You will be notified when this item is restocked.'});
});

router.get('/serviceability/:pincode', async(req,res)=>{
  const p=String(req.params.pincode||'').trim();
  if(!/^\d{6}$/.test(p)) return res.status(400).json({serviceable:false,message:'Enter a valid 6-digit pincode.'});
  // Store-level estimate; final courier availability is confirmed at checkout.
  const est=estimateDelivery(p);
  if(!est) return res.status(400).json({serviceable:false,message:'Enter a valid 6-digit pincode.'});
  res.json({serviceable:true,pincode:p,estimated_days:est.estimated_days,estimated_delivery:{min_date:est.min_date,max_date:est.max_date,label:est.label},cod:true,free_shipping_threshold:1499});
});

export default router;

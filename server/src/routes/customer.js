import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

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
  res.json({serviceable:true,pincode:p,estimated_days:'3–7 business days',cod:true,free_shipping_threshold:1499});
});

export default router;

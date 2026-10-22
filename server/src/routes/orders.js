import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { checkCoupon } from './coupons.js';
import { sendEmail, orderConfirmationEmail, orderStatusEmail } from '../services/email.js';
import { logStockMovement } from './variants.js';
import { createNotification } from '../services/notifications.js';

const router = Router();


/*
  AWARD LOYALTY POINTS
  1 point per ₹100 spent, based on the amount
  actually paid (after any discount).
  Guarded by points_awarded so it can never
  run twice for the same order.
*/
export async function awardLoyaltyPoints(client, orderId) {

  const orderResult = await client.query(
    `SELECT id, user_id, total
     FROM orders
     WHERE id = $1
       AND points_awarded = FALSE
     FOR UPDATE`,
    [orderId]
  );

  if (!orderResult.rows.length) return;

  const order = orderResult.rows[0];
  const points = Math.floor(Number(order.total) / 100);

  if (points <= 0) {
    await client.query(
      `UPDATE orders SET points_awarded = TRUE WHERE id = $1`,
      [orderId]
    );
    return;
  }

  await client.query(
    `UPDATE users
     SET loyalty_points = loyalty_points + $1
     WHERE id = $2`,
    [points, order.user_id]
  );

  await client.query(
    `UPDATE orders
     SET points_earned = $1, points_awarded = TRUE
     WHERE id = $2`,
    [points, orderId]
  );


  /*
    REFERRAL BONUS
    The first time a referred user's order earns
    them points, their referrer gets a one-time
    ₹100 (100 point) bonus. Guarded by
    referral_bonus_given so it can only ever fire
    once per referred user.
  */
  const referredUser = await client.query(
    `SELECT referred_by, referral_bonus_given
     FROM users
     WHERE id = $1
     FOR UPDATE`,
    [order.user_id]
  );

  const referredBy = referredUser.rows[0]?.referred_by;
  const bonusAlreadyGiven =
    referredUser.rows[0]?.referral_bonus_given;

  if (referredBy && !bonusAlreadyGiven) {

    // Lifetime cap — without email/phone verification (a bigger,
    // separate project), the cheapest real mitigation against someone
    // farming referral bonuses via mass fake accounts is simply
    // capping how many times it can pay out for one referrer.
    const MAX_REFERRAL_BONUSES = 20;
    const referralCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE referred_by = $1 AND referral_bonus_given = TRUE`,
      [referredBy]
    );

    if (referralCount.rows[0].count < MAX_REFERRAL_BONUSES) {
      const REFERRAL_BONUS = 100;

      await client.query(
        `UPDATE users
         SET loyalty_points = loyalty_points + $1
         WHERE id = $2`,
        [REFERRAL_BONUS, referredBy]
      );
    }

    await client.query(
      `UPDATE users
       SET referral_bonus_given = TRUE
       WHERE id = $1`,
      [order.user_id]
    );
  }
}


/*
  CREATE ORDER
*/
router.post('/create', auth, async (req, res) => {
  const {
    items = [],
    shipping = {},
    payment_method = 'cod',
    redeem_points = 0,
    coupon_code = '',
    gift_card_code = ''
  } = req.body;

  if (!['cod', 'online'].includes(payment_method)) {
    return res.status(400).json({
      message: 'Invalid payment method'
    });
  }

  if (!items.length) {
    return res.status(400).json({
      message: 'Cart is empty'
    });
  }

  const cleanShipping = {
    name: String(shipping.name || '').trim(),
    phone: String(shipping.phone || '').replace(/\D/g, ''),
    email: String(shipping.email || '').trim().toLowerCase(),
    address: String(shipping.address || '').trim(),
    city: String(shipping.city || '').trim(),
    state: String(shipping.state || '').trim(),
    pincode: String(shipping.pincode || '').replace(/\D/g, '')
  };

  if (!cleanShipping.name || !/^\d{10}$/.test(cleanShipping.phone) || !/^\S+@\S+\.\S+$/.test(cleanShipping.email) || !cleanShipping.address || !cleanShipping.city || !cleanShipping.state || !/^\d{6}$/.test(cleanShipping.pincode)) {
    return res.status(400).json({ message: 'Please provide valid delivery details.' });
  }

  /*
    ONLINE PAYMENT REQUIRES RAZORPAY
  */
  if (
    payment_method === 'online' &&
    (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    )
  ) {
    return res.status(503).json({
      message:
        'Online payment is currently unavailable. Please choose Cash on Delivery.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    /*
      GET PRODUCTS AND LOCK THEIR ROWS
      This prevents stock problems when multiple
      customers try to buy the same product.
    */
    const ids = items.map((x) => Number(x.productId));

    const { rows } = await client.query(
      `SELECT *
       FROM products
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [ids]
    );

    const byId = Object.fromEntries(
      rows.map((p) => [p.id, p])
    );

    /*
      SKU-LEVEL VARIANT LOOKUP
      If a product has variant rows (size+color -> stock), lock and
      validate against the specific variant instead of the aggregate
      products.stock column. Products with no variants fall back to
      the old product-level stock check for backward compatibility.
    */
    const variantByKey = {};
    for (const item of items) {
      const productId = Number(item.productId);
      if (!item.selectedSize) continue;
      const variantResult = await client.query(
        `SELECT * FROM product_variants
         WHERE product_id = $1 AND size = $2 AND color = $3
         FOR UPDATE`,
        [productId, item.selectedSize, item.selectedColor || '']
      );
      if (variantResult.rows.length) {
        variantByKey[`${productId}|${item.selectedSize}|${item.selectedColor || ''}`] = variantResult.rows[0];
      }
    }

    /*
      COMBO / BUNDLE DEALS
      Auto-applies the single best-value active combo deal (e.g. "any 3
      T-SHIRTS for ₹1999") based on whichever deal the current cart
      qualifies for and saves the customer the most money. Computed
      server-side from the cart contents — never trusts client input.
    */
    let comboDiscount = 0;
    let appliedCombo = null;
    const comboDealsResult = await client.query('SELECT * FROM combo_deals WHERE active = TRUE');

    for (const deal of comboDealsResult.rows) {
      const matchingItems = items.filter((item) => {
        const p = byId[Number(item.productId)];
        return p && String(p.category).toLowerCase() === String(deal.category).toLowerCase();
      });
      const totalQty = matchingItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      const totalValue = matchingItems.reduce((sum, item) => sum + Number(byId[Number(item.productId)].price) * Number(item.quantity), 0);
      const bundleCount = Math.floor(totalQty / Number(deal.quantity));
      if (bundleCount <= 0) continue;

      const avgUnitPrice = totalValue / totalQty;
      const dealDiscount = Math.max(0, bundleCount * (avgUnitPrice * Number(deal.quantity) - Number(deal.bundle_price)));

      if (dealDiscount > comboDiscount) {
        comboDiscount = Math.round(dealDiscount);
        appliedCombo = deal;
      }
    }

    /*
      CALCULATE SUBTOTAL
    */
    let subtotal = 0;

    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      const p = byId[productId];

      if (!p) {
        throw new Error(
          `Product ${productId} not found`
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        throw new Error(
          `Invalid quantity for product ${productId}`
        );
      }

      const variantKey = `${productId}|${item.selectedSize || ''}|${item.selectedColor || ''}`;
      const variant = variantByKey[variantKey];

      if (variant) {
        if (quantity > Number(variant.stock)) {
          throw new Error(
            `Only ${variant.stock} available for ${p.name} (${variant.size}${variant.color ? ' / ' + variant.color : ''})`
          );
        }
      } else if (quantity > Number(p.stock)) {
        throw new Error(
          `Only ${p.stock} available for ${p.name}`
        );
      }

      subtotal +=
        Number(p.price) * quantity;
    }

    /*
      SHIPPING
      Free above ₹1,499
      Otherwise ₹79
    */
    const shippingCharge =
      subtotal >= 1499 ? 0 : 79;


    /*
      COUPON CODE
      Locked so two simultaneous orders can't both
      squeeze past the same usage_limit.
    */
    let couponRow = null;
    let couponDiscount = 0;
    const normalizedCode =
      String(coupon_code || '').trim().toUpperCase();

    if (normalizedCode) {
      const couponResult = await client.query(
        'SELECT * FROM coupons WHERE code=$1 FOR UPDATE',
        [normalizedCode]
      );
      couponRow = couponResult.rows[0] || null;

      const check = await checkCoupon(
        { query: (...args) => client.query(...args) },
        normalizedCode,
        subtotal,
        req.user.id
      );

      if (!check.ok) {
        throw new Error(check.message);
      }

      couponDiscount = check.discount;
    }


    /*
      LOYALTY POINTS REDEMPTION
      1 point = ₹1. Can't redeem more points
      than the user has, and can't discount
      more than what's left of the subtotal
      after the coupon is applied.
    */
    const userResult = await client.query(
      `SELECT loyalty_points
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.user.id]
    );

    const userPoints =
      Number(userResult.rows[0]?.loyalty_points) || 0;

    const pointsToRedeem = Math.max(
      0,
      Math.min(
        Math.floor(Number(redeem_points) || 0),
        userPoints,
        Math.max(0, subtotal - couponDiscount)
      )
    );

    /*
      GIFT CARD
      Locked so two simultaneous orders can't both spend down the
      same balance past zero. Applied after coupon + points, capped
      to whatever's left of the order total.
    */
    let giftCard = null;
    let giftCardDiscount = 0;
    const normalizedGiftCode = String(gift_card_code || '').trim().toUpperCase();

    if (normalizedGiftCode) {
      const giftResult = await client.query(
        'SELECT * FROM gift_cards WHERE code = $1 FOR UPDATE',
        [normalizedGiftCode]
      );
      giftCard = giftResult.rows[0] || null;

      if (!giftCard || !giftCard.active) {
        throw new Error('Gift card not found or inactive');
      }
      if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
        throw new Error('Gift card has expired');
      }
      if (Number(giftCard.balance) <= 0) {
        throw new Error('Gift card has no remaining balance');
      }

      const remainingAfterOtherDiscounts = Math.max(0, subtotal - couponDiscount - pointsToRedeem);
      giftCardDiscount = Math.min(Number(giftCard.balance), remainingAfterOtherDiscounts);
    }

    const discount = pointsToRedeem;

    const total =
      subtotal + shippingCharge - couponDiscount - discount - giftCardDiscount - comboDiscount;

    if (couponRow) {
      await client.query(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1',
        [couponRow.id]
      );
    }

    if (pointsToRedeem > 0) {
      await client.query(
        `UPDATE users
         SET loyalty_points = loyalty_points - $1
         WHERE id = $2`,
        [pointsToRedeem, req.user.id]
      );
    }


    /*
      CREATE DATABASE ORDER
    */
    const order = (
      await client.query(
        `INSERT INTO orders(
          user_id,
          total,
          shipping_name,
          shipping_phone,
          shipping_address,
          shipping_email,
          shipping_city,
          shipping_state,
          shipping_pincode,
          payment_method,
          discount,
          points_redeemed,
          coupon_code,
          coupon_discount,
          gift_card_code,
          gift_card_discount,
          combo_discount
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *`,
        [
          req.user.id,
          total,
          cleanShipping.name,
          cleanShipping.phone,
          cleanShipping.address,
          cleanShipping.email,
          cleanShipping.city,
          cleanShipping.state,
          cleanShipping.pincode,
          payment_method,
          discount,
          pointsToRedeem,
          couponRow ? couponRow.code : null,
          couponDiscount,
          giftCard ? giftCard.code : null,
          giftCardDiscount,
          comboDiscount
        ]
      )
    ).rows[0];

    if (giftCard && giftCardDiscount > 0) {
      await client.query(
        'UPDATE gift_cards SET balance = balance - $1 WHERE id = $2',
        [giftCardDiscount, giftCard.id]
      );
      await client.query(
        'INSERT INTO gift_card_redemptions (gift_card_id, order_id, amount) VALUES ($1,$2,$3)',
        [giftCard.id, order.id, giftCardDiscount]
      );
    }

    if (couponRow) {
      await client.query(
        'INSERT INTO coupon_redemptions (coupon_id, user_id, order_id) VALUES ($1,$2,$3)',
        [couponRow.id, req.user.id, order.id]
      );
    }


    /*
      CREATE ORDER ITEMS
      AND RESERVE STOCK
    */
    for (const item of items) {
      const productId =
        Number(item.productId);

      const quantity =
        Number(item.quantity);

      const p = byId[productId];

      await client.query(
        `INSERT INTO order_items(
          order_id,
          product_id,
          name,
          price,
          quantity,
          selected_size,
          selected_color
        )
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id,
          p.id,
          p.name,
          p.price,
          quantity,
          item.selectedSize || null,
          item.selectedColor || p.color || null
        ]
      );

      /*
        Reserve stock immediately.

        If online payment is cancelled or fails,
        the stock will be restored by the
        payment-cancel endpoint below.
      */
      const variantKey = `${p.id}|${item.selectedSize || ''}|${item.selectedColor || ''}`;
      const variant = variantByKey[variantKey];

      if (variant) {
        const variantUpdate = await client.query(
          `UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
          [quantity, variant.id]
        );
        if (variantUpdate.rowCount === 0) {
          throw new Error(`${p.name} (${item.selectedSize || ''}${item.selectedColor ? ' / ' + item.selectedColor : ''}) sold out while placing your order`);
        }
      }

      const productUpdate = await client.query(
        `UPDATE products
         SET stock = stock - $1
         WHERE id = $2 AND stock >= $1`,
        [
          quantity,
          p.id
        ]
      );
      // Defense-in-depth alongside the FOR UPDATE row lock already
      // held on this product earlier in the transaction — if
      // rowCount is 0 here, stock genuinely ran out mid-transaction
      // rather than trusting the earlier check alone.
      if (productUpdate.rowCount === 0) {
        throw new Error(`${p.name} sold out while placing your order`);
      }

      await logStockMovement(client, {
        productId: p.id, variantId: variant?.id || null, change: -quantity,
        reason: 'order_placed', reference: `order #${order.id}`
      });
    }


    /*
      RAZORPAY ORDER
    */
    if (payment_method === 'online') {

      const rzp = new Razorpay({
        key_id:
          process.env.RAZORPAY_KEY_ID,

        key_secret:
          process.env.RAZORPAY_KEY_SECRET
      });

      const rOrder =
        await rzp.orders.create({
          amount:
            Math.round(total * 100),

          currency: 'INR',

          receipt:
            `order_${order.id}`
        });


      await client.query(
        `UPDATE orders
         SET razorpay_order_id = $1
         WHERE id = $2`,
        [
          rOrder.id,
          order.id
        ]
      );

      order.razorpay_order_id =
        rOrder.id;
    }


    await client.query('COMMIT');

    // Order confirmation email — fire and forget, never blocks the response
    const emailItems = items.map((item) => ({
      name: byId[Number(item.productId)]?.name || '',
      quantity: Number(item.quantity),
      price: byId[Number(item.productId)]?.price || 0
    }));
    const { subject, html } = orderConfirmationEmail({ ...order, items: emailItems });
    sendEmail({ to: cleanShipping.email, subject, html }).catch((e) => console.error('order email failed:', e.message));

    res.status(201).json({
      order
    });

  } catch (e) {

    await client.query('ROLLBACK');

    console.error(
      'ORDER CREATE ERROR:',
      e.message
    );

    res.status(400).json({
      message:
        e.message ||
        'Could not create order'
    });

  } finally {
    client.release();
  }
});


/*
  CUSTOMER — MY ORDERS
*/
router.get('/mine', auth, async (req, res) => {

  const { rows } =
    await pool.query(
      `SELECT *
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

  if (!rows.length) {
    return res.json(rows);
  }

  const orderIds = rows.map((o) => o.id);

  const itemsResult = await pool.query(
    `SELECT id, order_id, product_id, name, price, quantity, selected_size, selected_color
     FROM order_items
     WHERE order_id = ANY($1::int[])`,
    [orderIds]
  );

  const itemsByOrder = {};

  for (const item of itemsResult.rows) {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push(item);
  }

  const withItems = rows.map((order) => ({
    ...order,
    items: itemsByOrder[order.id] || []
  }));

  res.json(withItems);
});


/*
  Restore stock and customer benefits for an unpaid/cancelled order.
  This is deliberately idempotent: callers must hold the order row lock
  and only invoke it while the order is still cancellable.
*/
export async function restoreOrderBenefits(client, order) {
  const itemsResult = await client.query(
    `SELECT product_id, quantity, selected_size, selected_color
     FROM order_items
     WHERE order_id = $1`,
    [order.id]
  );

  for (const item of itemsResult.rows) {
    await client.query(
      `UPDATE products SET stock = stock + $1 WHERE id = $2`,
      [Number(item.quantity), Number(item.product_id)]
    );

    let variantId = null;
    if (item.selected_size) {
      const v = await client.query(
        `UPDATE product_variants
         SET stock = stock + $1
         WHERE product_id = $2 AND size = $3 AND color = $4
         RETURNING id`,
        [Number(item.quantity), Number(item.product_id), item.selected_size, item.selected_color || '']
      );
      variantId = v.rows[0]?.id || null;
    }

    await logStockMovement(client, {
      productId: Number(item.product_id), variantId, change: Number(item.quantity),
      reason: 'order_cancelled_or_restored', reference: `order #${order.id}`
    });
  }

  if (Number(order.points_redeemed) > 0) {
    await client.query(
      `UPDATE users
       SET loyalty_points = loyalty_points + $1
       WHERE id = $2`,
      [Number(order.points_redeemed), Number(order.user_id)]
    );
  }

  if (order.coupon_code) {
    await client.query(
      `UPDATE coupons
       SET used_count = GREATEST(0, used_count - 1)
       WHERE code = $1`,
      [order.coupon_code]
    );
    await client.query(`DELETE FROM coupon_redemptions WHERE order_id = $1`, [order.id]);
  }

  if (order.gift_card_code && Number(order.gift_card_discount) > 0) {
    await client.query(
      `UPDATE gift_cards SET balance = balance + $1 WHERE code = $2`,
      [Number(order.gift_card_discount), order.gift_card_code]
    );
    await client.query(
      `DELETE FROM gift_card_redemptions WHERE order_id = $1`,
      [order.id]
    );
  }
}


/*
  CUSTOMER — GET ONE ORDER
*/
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );

  if (!rows.length) {
    return res.status(404).json({ message: 'Order not found' });
  }

  const items = await pool.query(
    `SELECT order_id, product_id, name, price, quantity, selected_size, selected_color
     FROM order_items
     WHERE order_id = $1
     ORDER BY id`,
    [req.params.id]
  );

  res.json({ ...rows[0], items: items.rows });
});


/*
  CUSTOMER — CANCEL OWN ORDER
  AND RESTORE PRODUCT STOCK

  This is for normal pending COD orders.
*/
router.patch(
  '/:id/cancel',
  auth,
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      await client.query('BEGIN');


      const orderResult =
        await client.query(
          `SELECT *
           FROM orders
           WHERE id = $1
             AND user_id = $2
             AND status = 'pending'
             AND payment_method = 'cod'
           FOR UPDATE`,
          [
            req.params.id,
            req.user.id
          ]
        );


      if (!orderResult.rows.length) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          message:
            'This order cannot be cancelled.'
        });
      }


      const order =
        orderResult.rows[0];


      await restoreOrderBenefits(client, order);


      /*
        CANCEL ORDER
      */
      const updatedResult =
        await client.query(
          `UPDATE orders
           SET status = 'cancelled'
           WHERE id = $1
           RETURNING *`,
          [order.id]
        );


      await client.query(
        'COMMIT'
      );


      res.json({
        message:
          'Order cancelled successfully',

        order:
          updatedResult.rows[0]
      });

    } catch (e) {

      await client.query(
        'ROLLBACK'
      );

      console.error(
        'CANCEL ORDER ERROR:',
        e.message
      );

      res.status(500).json({
        message:
          'Could not cancel order'
      });

    } finally {
      client.release();
    }
  }
);


/*
  ONLINE PAYMENT — CANCEL / FAILED
  RESTORE PRODUCT STOCK

  This endpoint is intentionally separate
  from the normal customer cancellation route.

  It can only cancel:
  - the customer's own order
  - online payment orders
  - unpaid orders
  - orders that are not already cancelled

  Because the row is locked inside a transaction,
  calling this endpoint twice will NOT restore
  the stock twice.
*/
router.patch(
  '/:id/payment-cancel',
  auth,
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      await client.query(
        'BEGIN'
      );


      const orderResult =
        await client.query(
          `SELECT *
           FROM orders
           WHERE id = $1
             AND user_id = $2
             AND payment_method = 'online'
             AND payment_status <> 'paid'
             AND status <> 'cancelled'
           FOR UPDATE`,
          [
            req.params.id,
            req.user.id
          ]
        );


      /*
        If no order was found, it may already
        have been cancelled.

        This also prevents double stock restoration.
      */
      if (!orderResult.rows.length) {

        await client.query(
          'ROLLBACK'
        );

        return res.json({
          message:
            'Order already cancelled or payment completed.'
        });
      }


      const order =
        orderResult.rows[0];


      /*
        GET ORDER ITEMS
      */
      await restoreOrderBenefits(client, order);


      /*
        CANCEL ORDER
      */
      const updatedResult =
        await client.query(
          `UPDATE orders
           SET status = 'cancelled'
           WHERE id = $1
           RETURNING *`,
          [order.id]
        );


      await client.query(
        'COMMIT'
      );


      res.json({
        message:
          'Unpaid order cancelled successfully',

        order:
          updatedResult.rows[0]
      });

    } catch (e) {

      await client.query(
        'ROLLBACK'
      );

      console.error(
        'PAYMENT CANCEL ERROR:',
        e.message
      );

      res.status(500).json({
        message:
          'Could not cancel unpaid order'
      });

    } finally {
      client.release();
    }
  }
);


/*
  ADMIN — ALL ORDERS
*/
router.get(
  '/',
  auth,
  admin,
  async (req, res) => {

    const { rows } =
      await pool.query(
        `SELECT
           o.*,
           u.name,
           u.email
         FROM orders o
         JOIN users u
           ON u.id = o.user_id
         ORDER BY o.created_at DESC`
      );

    res.json(rows);
  }
);


/*
  ADMIN — UPDATE ORDER STATUS
*/
router.patch(
  '/:id/status',
  auth,
  admin,
  async (req, res) => {

    const {
      status,
      payment_status
    } = req.body;

    const client = await pool.connect();

    let updatedOrder;

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `UPDATE orders
         SET
           status =
             COALESCE($1, status),

           payment_status =
             COALESCE(
               $2,
               payment_status
             ),

           delivered_at =
             CASE WHEN $1 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END

         WHERE id = $3

         RETURNING *`,
        [
          status,
          payment_status,
          req.params.id
        ]
      );

      if (!rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message:
            'Order not found'
        });
      }

      updatedOrder = rows[0];

      /*
        Award points for COD orders once they're
        actually delivered. Online orders already
        get points at payment verification.
      */
      if (
        status === 'delivered' &&
        updatedOrder.payment_method === 'cod'
      ) {
        await awardLoyaltyPoints(client, updatedOrder.id);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('ORDER STATUS UPDATE ERROR:', e.message);
      return res.status(500).json({ message: 'Could not update order status' });
    } finally {
      client.release();
    }

    // Status update email — fire and forget
    if (status && ['processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      const customer = await pool.query('SELECT shipping_email FROM orders WHERE id = $1', [updatedOrder.id]);
      const email = customer.rows[0]?.shipping_email;
      if (email) {
        const { subject, html } = orderStatusEmail(updatedOrder);
        sendEmail({ to: email, subject, html }).catch((e) => console.error('status email failed:', e.message));
      }
      if (updatedOrder.user_id) {
        const displayId = `OG${String(updatedOrder.id).padStart(6, '0')}`;
        const statusCopy = {
          processing: `Order ${displayId} is being processed.`,
          shipped: `Order ${displayId} has shipped.`,
          delivered: `Order ${displayId} was delivered.`,
          cancelled: `Order ${displayId} was cancelled.`
        };
        createNotification(updatedOrder.user_id, {
          type: 'order_status',
          title: statusCopy[status] || `Order ${displayId} updated`,
          link: `/orders`
        });
      }
    }

    res.json(updatedOrder);
  }
);


/*
  RAZORPAY PAYMENT VERIFICATION
*/
router.post(
  '/verify-payment',
  auth,
  async (req, res) => {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ message: 'Razorpay is not configured' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `SELECT *
         FROM orders
         WHERE id = $1
           AND user_id = $2
         FOR UPDATE`,
        [orderId, req.user.id]
      );

      if (!orderResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Order not found' });
      }

      const order = orderResult.rows[0];

      if (order.status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'This order has already been cancelled.' });
      }

      if (order.payment_method !== 'online') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'This order is not an online payment order.' });
      }

      if (order.razorpay_order_id !== razorpay_order_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Razorpay order mismatch' });
      }

      if (order.payment_status === 'paid') {
        await client.query('COMMIT');
        return res.json(order);
      }

      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const providedSignature = String(razorpay_signature || '');
      const signaturesMatch =
        providedSignature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));

      if (!signaturesMatch) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid payment signature' });
      }

      const updated = await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
             status = 'processing',
             razorpay_payment_id = $3
         WHERE id = $1
           AND user_id = $2
           AND payment_status <> 'paid'
           AND status <> 'cancelled'
         RETURNING *`,
        [orderId, req.user.id, razorpay_payment_id]
      );

      if (!updated.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Order could not be marked as paid.' });
      }

      await awardLoyaltyPoints(client, orderId);
      await client.query('COMMIT');

      const finalOrder = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
        [orderId, req.user.id]
      );

      res.json(finalOrder.rows[0]);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('PAYMENT VERIFY ERROR:', e.message);
      res.status(500).json({ message: 'Could not verify payment' });
    } finally {
      client.release();
    }
  }
);


/*
  ORDER MODIFICATION BEFORE SHIPPING

  Customers can adjust their own order — address, size, or quantity —
  right up until it ships. Once status is 'shipped', 'delivered', or
  'cancelled', none of these apply; at that point it's a return/
  exchange request instead (see returns.js).
*/
function assertModifiable(order) {
  if (!['pending', 'processing'].includes(order.status)) {
    const err = new Error('This order can no longer be modified — it has already shipped');
    err.status = 400;
    throw err;
  }
}

// PATCH /api/orders/:id/address — change delivery details before shipping
router.patch('/:id/address', auth, async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ message: 'Order not found' });
    assertModifiable(order);

    const { name, phone, address, city, state, pincode } = req.body;
    if (!name || !phone || !address || !city || !state || !pincode) {
      return res.status(400).json({ message: 'All address fields are required' });
    }
    if (!/^\d{10}$/.test(String(phone))) return res.status(400).json({ message: 'Enter a valid 10-digit phone number' });
    if (!/^\d{6}$/.test(String(pincode))) return res.status(400).json({ message: 'Enter a valid 6-digit pincode' });

    const { rows } = await pool.query(
      `UPDATE orders SET
        shipping_name = $1, shipping_phone = $2, shipping_address = $3,
        shipping_city = $4, shipping_state = $5, shipping_pincode = $6,
        edited_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name.trim(), phone.trim(), address.trim(), city.trim(), state.trim(), pincode.trim(), order.id]
    );

    createNotification(req.user.id, {
      type: 'order_edited',
      title: `Delivery address updated for order OG${String(order.id).padStart(6, '0')}`,
      link: '/orders'
    });

    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Could not update address' });
  }
});

// PATCH /api/orders/:id/items/:itemId — change size and/or quantity of one item
router.patch('/:id/items/:itemId', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    const order = orderResult.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Order not found' }); }
    assertModifiable(order);

    const itemResult = await client.query('SELECT * FROM order_items WHERE id = $1 AND order_id = $2', [req.params.itemId, order.id]);
    const item = itemResult.rows[0];
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Item not found on this order' }); }

    const newSize = req.body.selected_size !== undefined ? req.body.selected_size : item.selected_size;
    const newQuantity = req.body.quantity !== undefined ? Math.max(1, Number(req.body.quantity)) : item.quantity;
    const sizeChanged = newSize !== item.selected_size;
    const quantityDelta = newQuantity - item.quantity;

    // Release the currently-held stock for this line before checking/reserving the new amount
    if (item.selected_size) {
      await client.query(
        `UPDATE product_variants SET stock = stock + $1 WHERE product_id = $2 AND size = $3 AND color = $4`,
        [item.quantity, item.product_id, item.selected_size, item.selected_color || '']
      );
    }
    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);

    // Check + reserve the new size/quantity
    if (newSize) {
      const variantResult = await client.query(
        `SELECT * FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3 FOR UPDATE`,
        [item.product_id, newSize, item.selected_color || '']
      );
      const variant = variantResult.rows[0];
      if (variant && Number(variant.stock) < newQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Only ${variant.stock} left in ${newSize}${item.selected_color ? ' / ' + item.selected_color : ''}` });
      }
      if (variant) {
        await client.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [newQuantity, variant.id]);
      }
    }
    const productResult = await client.query('SELECT stock, price FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
    if (Number(productResult.rows[0].stock) < newQuantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Only ${productResult.rows[0].stock} left in stock` });
    }
    await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [newQuantity, item.product_id]);

    await client.query(
      'UPDATE order_items SET selected_size = $1, quantity = $2 WHERE id = $3',
      [newSize, newQuantity, item.id]
    );

    // Recompute order total from the actual item price difference —
    // preserves whatever coupon/points/gift-card discount was already
    // applied rather than re-deriving eligibility from scratch.
    const priceDiff = item.price * quantityDelta;
    const newTotal = Math.max(0, Number(order.total) + priceDiff);
    await client.query('UPDATE orders SET total = $1, edited_at = NOW() WHERE id = $2', [newTotal, order.id]);

    await logStockMovement(client, {
      productId: item.product_id, change: -quantityDelta,
      reason: 'customer_order_edit', reference: `order #${order.id}, item #${item.id}`
    });

    await client.query('COMMIT');

    createNotification(req.user.id, {
      type: 'order_edited',
      title: `Order OG${String(order.id).padStart(6, '0')} updated${sizeChanged ? ' — size changed' : ''}`,
      link: '/orders'
    });

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ORDER ITEM EDIT ERROR:', e.message);
    res.status(500).json({ message: 'Could not update item' });
  } finally {
    client.release();
  }
});

// DELETE /api/orders/:id/items/:itemId — remove one item from an order before it ships
router.delete('/:id/items/:itemId', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    const order = orderResult.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Order not found' }); }
    assertModifiable(order);

    const itemsResult = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    if (itemsResult.rows.length <= 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This is the only item on the order — cancel the order instead of removing it' });
    }

    const item = itemsResult.rows.find((i) => i.id === Number(req.params.itemId));
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Item not found on this order' }); }

    if (item.selected_size) {
      await client.query(
        `UPDATE product_variants SET stock = stock + $1 WHERE product_id = $2 AND size = $3 AND color = $4`,
        [item.quantity, item.product_id, item.selected_size, item.selected_color || '']
      );
    }
    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    await client.query('DELETE FROM order_items WHERE id = $1', [item.id]);

    const newTotal = Math.max(0, Number(order.total) - item.price * item.quantity);
    await client.query('UPDATE orders SET total = $1, edited_at = NOW() WHERE id = $2', [newTotal, order.id]);

    await logStockMovement(client, {
      productId: item.product_id, change: item.quantity,
      reason: 'customer_order_edit', reference: `removed from order #${order.id}`
    });

    await client.query('COMMIT');

    createNotification(req.user.id, {
      type: 'order_edited',
      title: `Item removed from order OG${String(order.id).padStart(6, '0')}`,
      link: '/orders'
    });

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ORDER ITEM DELETE ERROR:', e.message);
    res.status(500).json({ message: 'Could not remove item' });
  } finally {
    client.release();
  }
});


export default router;

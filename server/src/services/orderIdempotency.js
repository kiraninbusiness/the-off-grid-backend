import { createHash } from 'node:crypto';

export function isValidOrderIdempotencyKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{16,128}$/.test(value);
}

export function hashOrderRequest(input) {
  const items = Array.isArray(input.items) ? input.items.map((item) => ({
    productId: Number(item?.productId),
    quantity: Number(item?.quantity),
    selectedSize: String(item?.selectedSize || '').trim(),
    selectedColor: String(item?.selectedColor || '').trim()
  })) : [];

  const canonical = {
    items,
    shipping: {
      name: String(input.shipping?.name || '').trim(),
      phone: String(input.shipping?.phone || '').replace(/\D/g, ''),
      email: String(input.shipping?.email || '').trim().toLowerCase(),
      address: String(input.shipping?.address || '').trim(),
      city: String(input.shipping?.city || '').trim(),
      state: String(input.shipping?.state || '').trim(),
      pincode: String(input.shipping?.pincode || '').replace(/\D/g, '')
    },
    payment_method: String(input.payment_method || 'cod'),
    redeem_points: Math.max(0, Math.floor(Number(input.redeem_points) || 0)),
    coupon_code: String(input.coupon_code || '').trim().toUpperCase(),
    gift_card_code: String(input.gift_card_code || '').trim().toUpperCase(),
    gift_wrap: input.gift_wrap === true,
    gift_message: String(input.gift_message || '').trim()
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

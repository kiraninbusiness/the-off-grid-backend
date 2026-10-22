import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2, ShieldCheck, Tag, LockKeyhole } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector('script[data-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });

export default function Checkout({ cart, setCart, user, onOrder }) {
  const nav = useNavigate();
  const paymentSucceededRef = useRef(false);
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: "",
    email: user?.email || "",
    address: "",
    city: "",
    state: "Karnataka",
    pincode: "",
  });
  const [method, setMethod] = useState("COD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponStatus, setCouponStatus] = useState("idle");
  const [couponMsg, setCouponMsg] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCard, setGiftCard] = useState(null);
  const [giftCardStatus, setGiftCardStatus] = useState("idle");
  const [giftCardMsg, setGiftCardMsg] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        name: current.name || user.name || "",
        email: current.email || user.email || "",
      }));
    }
  }, [user]);

  // Load saved addresses + loyalty balance so returning customers can check out
  // by picking a saved address instead of retyping it every time.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([api("/profile/addresses"), api("/auth/me")])
      .then(([addrs, me]) => {
        if (cancelled) return;
        const list = Array.isArray(addrs) ? addrs : [];
        setSavedAddresses(list);
        setLoyaltyPoints(Number(me?.loyalty_points) || 0);
        const def = list.find((a) => a.is_default) || list[0];
        if (def) {
          setSelectedAddressId(def.id);
          setForm((current) => ({
            ...current,
            name: def.name,
            phone: def.phone,
            address: def.address,
            city: def.city,
            state: def.state,
            pincode: def.pincode,
          }));
        } else {
          setShowManualForm(true);
        }
      })
      .catch(() => setShowManualForm(true));
    return () => { cancelled = true; };
  }, [user]);

  const pickAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setShowManualForm(false);
    setForm((current) => ({
      ...current,
      name: addr.name,
      phone: addr.phone,
      address: addr.address,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
    }));
  };

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0),
    [cart]
  );

  // Keep this aligned with the backend source of truth.
  const shipping = total >= 1499 ? 0 : 79;
  const couponDiscount = Number(coupon?.discount || 0);
  const maxRedeemable = Math.max(0, Math.min(loyaltyPoints, total - couponDiscount));
  const pointsDiscount = redeemPoints ? maxRedeemable : 0;
  const remainingAfterPointsAndCoupon = Math.max(0, total + shipping - couponDiscount - pointsDiscount);
  const giftCardDiscount = giftCard ? Math.min(giftCard.balance, remainingAfterPointsAndCoupon) : 0;
  const discount = couponDiscount + pointsDiscount + giftCardDiscount;
  const grand = Math.max(0, total + shipping - discount);

  const change = (index, delta) => {
    setCart((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const max = Math.max(1, Number(item.stock || 99));
        const nextQty = Math.max(1, Math.min(max, Number(item.qty || 1) + delta));
        // Sync to the server cart for logged-in users — previously this
        // only updated local state, so a quantity change made at
        // Checkout never reached the server and a second device could
        // still see the old quantity.
        if (user?.id) {
          api("/cart/item", {
            method: "PUT",
            body: JSON.stringify({
              product_id: item.id,
              quantity: nextQty,
              selected_size: item.selectedSize || null,
              selected_color: item.selectedColor || null,
            }),
          }).catch(() => {});
        }
        return { ...item, qty: nextQty };
      })
    );
  };

  const removeItem = (index) => {
    setCart((current) => {
      const item = current[index];
      // Same gap as quantity changes above — removing a line item here
      // now also deletes it from the server cart, not just locally.
      if (user?.id && item?.cartItemId) {
        api(`/cart/item/${item.cartItemId}`, { method: "DELETE" }).catch(() => {});
      }
      return current.filter((_, i) => i !== index);
    });
  };

  const applyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setCouponStatus("loading");
    setCouponMsg("");

    try {
      const res = await api("/coupons/validate", {
        method: "POST",
        body: JSON.stringify({
          code: couponCode.trim(),
          subtotal: total,
        }),
      });
      setCoupon(res);
      setCouponStatus("success");
    } catch (err) {
      setCoupon(null);
      setCouponStatus("error");
      setCouponMsg(err.message || "Invalid coupon code");
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponCode("");
    setCouponStatus("idle");
    setCouponMsg("");
  };

  const applyGiftCard = async (e) => {
    e.preventDefault();
    if (!giftCardCode.trim()) return;

    setGiftCardStatus("loading");
    setGiftCardMsg("");

    try {
      const res = await api("/gift-cards/check", {
        method: "POST",
        body: JSON.stringify({ code: giftCardCode.trim() }),
      });
      setGiftCard(res);
      setGiftCardStatus("success");
    } catch (err) {
      setGiftCard(null);
      setGiftCardStatus("error");
      setGiftCardMsg(err.message || "Invalid gift card code");
    }
  };

  const removeGiftCard = () => {
    setGiftCard(null);
    setGiftCardCode("");
    setGiftCardStatus("idle");
    setGiftCardMsg("");
  };

  const backendItems = () =>
    cart.map((item) => ({
      productId: Number(item.id),
      quantity: Number(item.qty || 1),
      selectedSize: item.selectedSize || null,
      selectedColor: item.selectedColor || null,
    }));

  const shippingPayload = {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim().toLowerCase(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim(),
  };

  const cancelUnpaidOnlineOrder = async (orderId) => {
    if (!orderId || paymentSucceededRef.current) return;
    try {
      await api(`/orders/${orderId}/payment-cancel`, { method: "PATCH" });
    } catch (err) {
      console.error("Unable to cancel unpaid payment order", err);
    }
  };

  const placeCodOrder = async () => {
    const response = await api("/orders/create", {
      method: "POST",
      body: JSON.stringify({
        items: backendItems(),
        shipping: shippingPayload,
        payment_method: "cod",
        coupon_code: coupon?.code || "",
        redeem_points: pointsDiscount,
        gift_card_code: giftCard?.code || "",
      }),
    });

    const order = response.order;
    const displayOrder = {
      ...order,
      items: cart,
      payment: "COD",
      date: order.created_at || new Date().toISOString(),
      customer: shippingPayload,
      shipping,
      subtotal: total,
      discount,
      total: Number(order.total || grand),
      status: order.status || "pending",
    };

    onOrder?.(displayOrder);
    setCart([]); api("/cart", { method: "DELETE" }).catch(() => {});
    nav("/success", { state: { order: displayOrder } });
  };

  const placeOnlineOrder = async () => {
    const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!key) {
      throw new Error("Online payment is not configured yet. Please choose Cash on Delivery.");
    }

    await loadRazorpay();

    const response = await api("/orders/create", {
      method: "POST",
      body: JSON.stringify({
        items: backendItems(),
        shipping: shippingPayload,
        payment_method: "online",
        coupon_code: coupon?.code || "",
        redeem_points: pointsDiscount,
        gift_card_code: giftCard?.code || "",
      }),
    });

    const order = response.order;
    if (!order?.razorpay_order_id) {
      throw new Error("Could not create the online payment order.");
    }

    paymentSucceededRef.current = false;

    await new Promise((resolve, reject) => {
      let settled = false;

      const finishReject = async (message, cancel = true) => {
        if (settled) return;
        settled = true;
        if (cancel) await cancelUnpaidOnlineOrder(order.id);
        reject(new Error(message));
      };

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const rzp = new window.Razorpay({
        key,
        amount: Math.round(Number(order.total) * 100),
        currency: "INR",
        name: "THE OFF GRID",
        description: "THE OFF GRID order",
        order_id: order.razorpay_order_id,
        prefill: {
          name: shippingPayload.name,
          email: shippingPayload.email,
          contact: shippingPayload.phone,
        },
        notes: {
          offgrid_order_id: String(order.id),
        },
        theme: {
          color: "#111111",
        },
        handler: async (payment) => {
          try {
            const verified = await api("/orders/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                orderId: order.id,
                razorpay_order_id: payment.razorpay_order_id,
                razorpay_payment_id: payment.razorpay_payment_id,
                razorpay_signature: payment.razorpay_signature,
              }),
            });

            paymentSucceededRef.current = true;

            const displayOrder = {
              ...verified,
              items: cart,
              payment: "ONLINE",
              date: verified.created_at || new Date().toISOString(),
              customer: shippingPayload,
              shipping,
              subtotal: total,
              discount,
              total: Number(verified.total || grand),
              status: verified.status || "processing",
            };

            onOrder?.(displayOrder);
            setCart([]); api("/cart", { method: "DELETE" }).catch(() => {});
            finishResolve();
            nav("/success", { state: { order: displayOrder } });
          } catch (err) {
            await finishReject(
              err.message || "Payment verification failed. Please contact support before retrying."
            );
          }
        },
        modal: {
          ondismiss: async () => {
            if (!paymentSucceededRef.current) {
              await finishReject("Payment was cancelled.");
            }
          },
        },
      });

      rzp.on("payment.failed", async (response) => {
        const message = response?.error?.description || "Payment failed. No payment was confirmed.";
        await finishReject(message);
      });

      rzp.open();
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!cart.length) return;
    if (!user) {
      setError("Please sign in before checkout so your order can be securely saved to your account.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (method === "COD") {
        await placeCodOrder();
      } else {
        await placeOnlineOrder();
      }
    } catch (err) {
      setError(err.message || "Could not place your order.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="checkout-page">
        <header className="simple-header">
          <Link to="/"><ArrowLeft /> THE OFF GRID</Link>
          <span>SECURE CHECKOUT</span>
        </header>
        <main className="checkout-auth-required">
          <LockKeyhole size={42} />
          <span>THE OFF GRID / CHECKOUT</span>
          <h1>SIGN IN TO<br /><em>CHECK OUT.</em></h1>
          <p>Your cart is saved. Sign in so we can securely create and track your order.</p>
          <button className="orange-btn" type="button" onClick={() => nav("/account")}>SIGN IN / CREATE ACCOUNT</button>
          <button className="text-button" type="button" onClick={() => nav("/")}>CONTINUE SHOPPING</button>
        </main>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <header className="simple-header">
        <Link to="/"><ArrowLeft /> KEEP SHOPPING</Link>
      </header>

      <main className="checkout-grid">
        <section className="checkout-main">
          <div className="checkout-title">
            <h1>CHECKOUT<em>.</em></h1>
          </div>

          <form id="checkout-form" onSubmit={submit}>
            <h2><span className="checkout-step-num">01 —</span> DELIVERY ADDRESS</h2>

            {savedAddresses.length > 0 && (
              <div className="checkout-saved-addresses">
                {savedAddresses.map((addr) => (
                  <button
                    type="button"
                    key={addr.id}
                    className={`checkout-address-card ${selectedAddressId === addr.id && !showManualForm ? "active" : ""}`}
                    onClick={() => pickAddress(addr)}
                  >
                    <strong>{addr.label}{addr.is_default ? " · DEFAULT" : ""}</strong>
                    <span>{addr.name} · {addr.phone}</span>
                    <span>{addr.address}, {addr.city}, {addr.state} — {addr.pincode}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`checkout-address-card checkout-address-new ${showManualForm ? "active" : ""}`}
                  onClick={() => { setShowManualForm(true); setSelectedAddressId(null); }}
                >
                  + USE A DIFFERENT ADDRESS
                </button>
              </div>
            )}

            {(showManualForm || !savedAddresses.length) && (
              <div className="checkout-address-form">
                <div className="checkout-form-row">
                  <input required value={form.name} placeholder="FULL NAME" onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
                  <input required value={form.phone} placeholder="PHONE" type="text" inputMode="numeric" maxLength={10} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} />
                </div>
                <input required value={form.email} placeholder="EMAIL" type="email" onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} />
                <input required value={form.address} placeholder="ADDRESS LINE 1" onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} />
                <div className="checkout-form-row">
                  <input required value={form.city} placeholder="CITY" onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} />
                  <input required value={form.state} placeholder="STATE" onChange={(e) => setForm((c) => ({ ...c, state: e.target.value }))} />
                </div>
                <input required value={form.pincode} placeholder="PINCODE" type="text" inputMode="numeric" maxLength={6} onChange={(e) => setForm((c) => ({ ...c, pincode: e.target.value }))} />
              </div>
            )}

            <h2><span className="checkout-step-num">02 —</span> PAYMENT</h2>
            <div className="payment-options payment-options-stacked">
              <button type="button" className={method === "COD" ? "active" : ""} onClick={() => setMethod("COD")}>
                <strong>Cash on Delivery</strong>
                <span>Pay when it lands at your door</span>
              </button>
              <button type="button" className={method === "ONLINE" ? "active" : ""} onClick={() => setMethod("ONLINE")}>
                <strong>UPI / Cards — Razorpay</strong>
                <span>Instant, secure. UPI, cards, netbanking</span>
              </button>
            </div>
            <p className="payment-note">
              <ShieldCheck /> {method === "ONLINE" ? "Secure Razorpay payment. Your card/UPI details are handled by Razorpay." : "Pay when your order is delivered."}
            </p>

            {loyaltyPoints > 0 && (
              <>
                <h2><span className="checkout-step-num">03 —</span> GRID POINTS</h2>
                <label className="checkout-points-row">
                  <input type="checkbox" checked={redeemPoints} onChange={(e) => setRedeemPoints(e.target.checked)} />
                  <span>Use {maxRedeemable} of your {loyaltyPoints} points (₹{maxRedeemable} off)</span>
                </label>
              </>
            )}

            {error && <p className="notify-me-error">{error}</p>}
          </form>
        </section>

        <aside className="checkout-sidebar">
          <h2>YOUR BAG</h2>

          {!cart.length ? (
            <div className="empty-box">
              <h2>YOUR BAG IS EMPTY.</h2>
              <Link className="orange-btn" to="/">SHOP NOW</Link>
            </div>
          ) : (
            <>
              <div className="checkout-sidebar-items">
                {cart.map((item, index) => (
                  <article className="checkout-item" key={`${item.id}-${item.selectedSize || ""}-${item.selectedColor || ""}`}>
                    <img src={item.image} alt={item.name} />
                    <div>
                      <h3>{item.name}</h3>
                      {item.selectedSize && <p>SIZE: {item.selectedSize}</p>}{item.selectedColor && <p>COLOR: {item.selectedColor}</p>}
                      <strong>{money(item.price)}</strong>
                      <div className="quantity-line">
                        <button type="button" onClick={() => change(index, -1)}><Minus /></button>
                        <span>{item.qty || 1}</span>
                        <button type="button" onClick={() => change(index, 1)}><Plus /></button>
                        <button type="button" onClick={() => removeItem(index)}><Trash2 /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="checkout-sidebar-codes">
                {coupon ? (
                  <div className="coupon-applied">
                    <span><Tag size={13} /> {coupon.code} applied</span>
                    <button type="button" onClick={removeCoupon}>REMOVE</button>
                  </div>
                ) : (
                  <div className="coupon-row">
                    <input
                      value={couponCode}
                      placeholder="COUPON CODE"
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        if (couponStatus === "error") { setCouponStatus("idle"); setCouponMsg(""); }
                      }}
                    />
                    <button type="button" onClick={applyCoupon} disabled={couponStatus === "loading"}>{couponStatus === "loading" ? "..." : "APPLY"}</button>
                  </div>
                )}
                {couponStatus === "error" && <p className="notify-me-error">{couponMsg}</p>}

                {giftCard ? (
                  <div className="coupon-applied">
                    <span><Tag size={13} /> {giftCard.code} · ₹{giftCard.balance} available</span>
                    <button type="button" onClick={removeGiftCard}>REMOVE</button>
                  </div>
                ) : (
                  <div className="coupon-row">
                    <input
                      value={giftCardCode}
                      placeholder="GIFT CARD CODE"
                      onChange={(e) => {
                        setGiftCardCode(e.target.value.toUpperCase());
                        if (giftCardStatus === "error") { setGiftCardStatus("idle"); setGiftCardMsg(""); }
                      }}
                    />
                    <button type="button" onClick={applyGiftCard} disabled={giftCardStatus === "loading"}>{giftCardStatus === "loading" ? "..." : "APPLY"}</button>
                  </div>
                )}
                {giftCardStatus === "error" && <p className="notify-me-error">{giftCardMsg}</p>}
              </div>

              <div className="order-total">
                <span>SUBTOTAL <b>{money(total)}</b></span>
                <span>SHIPPING <b>{shipping ? money(shipping) : "FREE"}</b></span>
                {couponDiscount > 0 && <span>COUPON <b>-{money(couponDiscount)}</b></span>}
                {pointsDiscount > 0 && <span>POINTS <b>-{money(pointsDiscount)}</b></span>}
                {giftCardDiscount > 0 && <span>GIFT CARD <b>-{money(giftCardDiscount)}</b></span>}
                <strong>TOTAL <b>{money(grand)}</b></strong>
              </div>

              <button form="checkout-form" className="orange-btn checkout-submit" disabled={loading || !cart.length}>
                {loading ? (method === "ONLINE" ? "OPENING PAYMENT..." : "PLACING ORDER...") : method === "ONLINE" ? `PAY ${money(grand)}` : "PLACE ORDER — COD"}
              </button>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

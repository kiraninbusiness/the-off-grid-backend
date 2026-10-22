import React from "react";
import { useNavigate } from "react-router-dom";
import { X, Minus, Plus, Trash2, ArrowRight } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const FREE_SHIPPING_THRESHOLD = 1499;

/*
  Slide-out mini-cart — previously the bag icon jumped straight to the
  full /checkout page with no way to glance at your bag and keep
  browsing. This mirrors the "add to bag without losing your place"
  pattern used across most fashion D2C sites (and matches the
  reference design supplied): a right-side drawer with a free-shipping
  progress bar, per-item quantity controls, and a subtotal that
  defers exact shipping/discount math to the real checkout page.
*/
export default function CartDrawer({ open, onClose, cart, setCart, user }) {
  const navigate = useNavigate();

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  const change = (index, delta) => {
    setCart((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const max = Math.max(1, Number(item.stock || 99));
        const nextQty = Math.max(1, Math.min(max, Number(item.qty || 1) + delta));
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
      if (user?.id && item?.cartItemId) {
        api(`/cart/item/${item.cartItemId}`, { method: "DELETE" }).catch(() => {});
      }
      return current.filter((_, i) => i !== index);
    });
  };

  if (!open) return null;

  return (
    <div className="cart-drawer-overlay" onClick={onClose}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-drawer-head">
          <div>
            <span>THE OFF GRID</span>
            <h2>YOUR BAG</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close bag"><X size={20} /></button>
        </div>

        <div className="cart-drawer-shipping">
          <span>{remaining > 0 ? `ADD ${money(remaining)} MORE FOR FREE SHIPPING` : "FREE SHIPPING UNLOCKED"}</span>
          <div className="cart-drawer-progress"><div style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="cart-drawer-items">
          {!cart.length ? (
            <div className="cart-drawer-empty">
              <p>YOUR BAG IS EMPTY.</p>
              <button className="text-button" type="button" onClick={() => { onClose(); navigate("/"); }}>KEEP SHOPPING</button>
            </div>
          ) : (
            cart.map((item, index) => (
              <div className="cart-drawer-item" key={`${item.id}-${item.selectedSize || ""}-${item.selectedColor || ""}`}>
                <img src={item.image} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  {(item.selectedSize || item.selectedColor) && (
                    <span className="cart-drawer-variant">
                      {[item.selectedSize && `SIZE ${item.selectedSize}`, item.selectedColor].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <div className="quantity-line">
                    <button type="button" onClick={() => change(index, -1)}><Minus size={13} /></button>
                    <span>{item.qty || 1}</span>
                    <button type="button" onClick={() => change(index, 1)}><Plus size={13} /></button>
                    <button type="button" onClick={() => removeItem(index)}><Trash2 size={13} /></button>
                  </div>
                </div>
                <b>{money(Number(item.price) * Number(item.qty || 1))}</b>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-drawer-subtotal">
              <span>SUBTOTAL</span>
              <b>{money(subtotal)}</b>
            </div>
            <p className="cart-drawer-note">Shipping calculated at checkout.</p>
            <button
              className="orange-btn cart-drawer-checkout"
              type="button"
              onClick={() => { onClose(); navigate("/checkout"); }}
            >
              PROCEED TO CHECKOUT <ArrowRight size={16} />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

/*
  Content for the storefront's informational pages — legal/policy
  pages, Contact, and FAQ. Kept as data so InfoPage.jsx stays one
  reusable renderer instead of six near-identical page components.

  NOTE: content contains placeholder business details in [ ] — replace
  with your real details before launch. Razorpay requires Privacy,
  Terms, Shipping and Refund/Cancellation policies to be live on your
  domain to approve/maintain a merchant account, but the content has
  to reflect your actual policies, not generic boilerplate.
*/

export const INFO_PAGES = {
  "shipping-policy": {
    eyebrow: "THE OFF GRID / SHIPPING",
    title: "SHIPPING POLICY.",
    sections: [
      { heading: "Processing time", body: "Orders are processed and dispatched within 1–2 business days of confirmation. You'll get an email once your order ships, with tracking details." },
      { heading: "Delivery time", body: "Standard delivery takes 3–7 business days depending on your location. Metro cities are typically faster; remote areas may take longer." },
      { heading: "Shipping charges", body: "Free shipping on orders above ₹1,499. Orders below that are charged a flat ₹79 shipping fee, shown at checkout before you pay." },
      { heading: "Order tracking", body: "Once shipped, track your order any time from My Orders." },
      { heading: "Delivery partners", body: "We ship pan-India through [Delivery partner name(s)]. Serviceability at your pincode is checked at checkout." }
    ]
  },
  "returns-policy": {
    eyebrow: "THE OFF GRID / RETURNS",
    title: "RETURN & REFUND POLICY.",
    sections: [
      { heading: "Return window", body: "We accept returns within 10 days of delivery, provided the item is unused, unwashed, and in its original packaging with tags attached." },
      { heading: "How to start a return", body: "Go to My Orders, select the order, and choose 'Request Return'. Our team will arrange a pickup or share drop-off instructions." },
      { heading: "Refunds", body: "Once your return is approved and the item is received, refunds for online payments are processed back to your original payment method through Razorpay within 5–7 business days. COD orders are refunded via bank transfer." },
      { heading: "Exchanges", body: "Need a different size? Choose 'Exchange' instead of 'Return' from My Orders — we'll ship the new size once the original is picked up." },
      { heading: "Non-returnable items", body: "Innerwear, socks, and items marked 'Final Sale' cannot be returned or exchanged for hygiene/pricing reasons." }
    ]
  },
  "cancellation-policy": {
    eyebrow: "THE OFF GRID / CANCELLATIONS",
    title: "CANCELLATION POLICY.",
    sections: [
      { heading: "Before dispatch", body: "You can cancel an order for free any time before it ships — go to My Orders and select 'Cancel Order'. Online payments are refunded in full within 5–7 business days." },
      { heading: "After dispatch", body: "Once an order has shipped, it can no longer be cancelled — you're welcome to return it after delivery instead, following our Return & Refund Policy." },
      { heading: "Order changes", body: "We're unable to modify size, color, or address on an order once placed — cancel and reorder instead, as long as it hasn't shipped yet." }
    ]
  },
  "privacy-policy": {
    eyebrow: "THE OFF GRID / PRIVACY",
    title: "PRIVACY POLICY.",
    sections: [
      { heading: "What we collect", body: "Name, email, phone number, shipping address, and order history — collected when you create an account, check out, or contact support." },
      { heading: "How we use it", body: "To process and deliver your orders, send order updates, provide customer support, and (only with your consent) send marketing emails you can unsubscribe from at any time." },
      { heading: "Payment information", body: "We never store your card, UPI, or banking details. All payments are processed securely by Razorpay, which is PCI-DSS compliant." },
      { heading: "Sharing", body: "We share your shipping details only with our delivery partners, and never sell your personal information to third parties." },
      { heading: "Your rights", body: "You can request a copy of your data, ask us to correct it, or request account deletion any time by writing to [support email]." },
      { heading: "Contact", body: "Questions about this policy can be sent to [support email] or [company address]." }
    ]
  },
  "cookie-policy": {
    eyebrow: "THE OFF GRID / COOKIES",
    title: "COOKIE POLICY.",
    sections: [
      { heading: "What cookies we use", body: "We use essential cookies/local storage to keep you signed in and remember your cart. We don't currently use third-party advertising or tracking cookies." },
      { heading: "Why", body: "Essential cookies are required for the site to function — signing in, checkout, and cart persistence all depend on them, so they can't be disabled while still using the site." },
      { heading: "Analytics", body: "If we add analytics tools in the future (e.g. Google Analytics), this policy will be updated to reflect them before they go live." }
    ]
  },
  "terms-of-service": {
    eyebrow: "THE OFF GRID / TERMS",
    title: "TERMS & CONDITIONS.",
    sections: [
      { heading: "About these terms", body: "By using theoffgrid.in and placing an order, you agree to these terms. [Company legal name] operates this website from [company address]." },
      { heading: "Orders & pricing", body: "All prices are listed in INR and inclusive of applicable taxes unless stated otherwise. We reserve the right to cancel an order if a pricing or stock error is discovered before dispatch — you'll be notified and refunded in full." },
      { heading: "Payments", body: "We accept Cash on Delivery and online payments (cards, UPI, netbanking, wallets) via Razorpay. Online orders are confirmed only after successful payment verification." },
      { heading: "Intellectual property", body: "All logos, designs, product photography, and site content are the property of THE OFF GRID and may not be reproduced without written permission." },
      { heading: "Limitation of liability", body: "We are not liable for delays caused by circumstances beyond our reasonable control, including courier delays, weather, or force majeure events." },
      { heading: "Governing law", body: "These terms are governed by the laws of India, and any disputes are subject to the jurisdiction of the courts in [city]." }
    ]
  }
};

export const FAQ_ITEMS = [
  { q: "How long does delivery take?", a: "Most orders arrive within 3–7 business days after dispatch. Track it any time from My Orders." },
  { q: "Do you offer Cash on Delivery?", a: "Yes, COD is available on eligible orders and shown as an option at checkout." },
  { q: "What's your return policy?", a: "Unused items in original packaging can be returned within 10 days of delivery. See our Return & Refund Policy for details." },
  { q: "How do I track my order?", a: "Go to My Orders and select the order to see live status and tracking." },
  { q: "How do I know my size?", a: "Every product page has a Size Guide link next to the size selector with detailed measurements." },
  { q: "Can I cancel my order?", a: "Yes, as long as it hasn't shipped yet — go to My Orders and select 'Cancel Order'." },
  { q: "How do gift cards work?", a: "Purchase one from the Gift Cards page for any amount — the recipient gets an emailed code redeemable at checkout." },
  { q: "How do I use a coupon or loyalty points?", a: "Both can be applied directly at checkout before you pay." }
];

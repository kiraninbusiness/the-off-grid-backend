# Mobile V3 customer API additions

Added `/api/customer` endpoints:
- GET `/loyalty` — server-backed points balance, delivered spend, referral code and order activity
- GET `/referrals` — referral code and referred members
- GET `/recommendations?product_id=` — category-aware product recommendations
- POST `/stock-alerts` — authenticated restock subscription
- GET `/serviceability/:pincode` — store-level delivery estimate/COD check

The existing backend already contained loyalty point awarding, referral reward logic, exchange lifecycle, stock-alert storage, notifications, analytics, gift cards, combo deals and abandoned-cart infrastructure. This release exposes the customer-facing pieces to the mobile app rather than creating a second data source.

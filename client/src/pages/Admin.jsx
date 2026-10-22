import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Package,
  ShoppingBag,
  IndianRupee,
  Clock3,
  Pencil,
  Trash2,
  Truck,
  CheckCircle2,
  XCircle,
  UserRound,
  MapPin,
  RefreshCw,
  Plus,
  Search,
  AlertTriangle,
  Boxes,
  TrendingUp,
  Eye,
  RotateCcw,
  X
} from "lucide-react";
import { api, apiUpload } from "../api";
import AdminExtras from "../components/AdminExtras";

const empty = {
  name: "",
  description: "",
  category: "Essentials",
  gender: "Unisex",
  size: "M",
  condition: "New Arrival",
  price: "",
  old_price: "",
  image: "",
  extraImages: "",
  stock: 1,
  color: "",
  fit: "",
  video: "",
  material: "",
  care_instructions: "",
  model_details: "",
  meta_title: "",
  meta_description: "",
  size_chart: []
};

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN")}`;

const categories = [
  "Essentials",
  "Streetwear",
  "Casual",
  "Jackets"
];

const genders = [
  "Unisex",
  "Men",
  "Women"
];

const conditions = [
  "New Arrival",
  "Bestseller",
  "Limited Edition",
  "Restocked"
];

/* ================================
   STATUS BADGE
================================ */

function StatusBadge({ status }) {
  const icons = {
    pending: Clock3,
    processing: Package,
    shipped: Truck,
    delivered: CheckCircle2,
    cancelled: XCircle
  };

  const Icon = icons[status] || Clock3;

  return (
    <span className={`admin-status status-${status}`}>
      <Icon size={14} />
      {status}
    </span>
  );
}

/* ================================
   ORDER PROGRESS
================================ */

function OrderProgress({ status }) {
  if (status === "cancelled") {
    return (
      <div className="admin-cancelled">
        <XCircle size={18} />
        Order cancelled
      </div>
    );
  }

  const steps = [
    ["pending", "Placed"],
    ["processing", "Processing"],
    ["shipped", "Shipped"],
    ["delivered", "Delivered"]
  ];

  const current = steps.findIndex(
    ([key]) => key === status
  );

  return (
    <div className="admin-progress">
      {steps.map(([key, label], index) => (
        <React.Fragment key={key}>
          <div
            className={
              index <= current
                ? "progress-item active"
                : "progress-item"
            }
          >
            <div className="progress-dot">
              {index < current ? (
                <CheckCircle2 size={14} />
              ) : (
                index + 1
              )}
            </div>

            <span>{label}</span>
          </div>

          {index < steps.length - 1 && (
            <div
              className={
                index < current
                  ? "progress-line active"
                  : "progress-line"
              }
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ================================
   ADMIN
================================ */

export default function Admin({ user }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);

  const [productSearch, setProductSearch] =
    useState("");

  const [productCategory, setProductCategory] =
    useState("All");

  const [stockFilter, setStockFilter] =
    useState("All");

  const [orderSearch, setOrderSearch] =
    useState("");

  const [orderFilter, setOrderFilter] =
    useState("All");

  const [f, setF] = useState(empty);

  const [editing, setEditing] =
    useState(null);

  const [err, setErr] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileRef = useRef(null);
  const extraImageFileRef = useRef(null);
  const videoFileRef = useRef(null);

  async function handleFileUpload(e, targetField) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setErr("");
    try {
      const { url } = await apiUpload(file);
      if (targetField === "extraImages") {
        setF((cur) => ({ ...cur, extraImages: cur.extraImages ? `${cur.extraImages}\n${url}` : url }));
      } else {
        setF((cur) => ({ ...cur, [targetField]: url }));
      }
    } catch (e) {
      setErr(e.message || "Upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  /* ================================
     COUPON FORM STATE
  ================================ */

  const emptyCoupon = {
    code: "",
    type: "percent",
    value: "",
    min_order: "0",
    max_discount: "",
    usage_limit: "",
    expires_at: ""
  };

  const [couponForm, setCouponForm] =
    useState(emptyCoupon);

  const [couponBusy, setCouponBusy] =
    useState(false);

  const [couponErr, setCouponErr] =
    useState("");

  /* ================================
     LOAD DATA
  ================================ */

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        productData,
        orderData,
        couponData
      ] = await Promise.all([
        api("/products"),
        api("/orders"),
        api("/coupons")
      ]);

      setProducts(
        Array.isArray(productData)
          ? productData
          : []
      );

      setOrders(
        Array.isArray(orderData)
          ? orderData
          : []
      );

      setCoupons(
        Array.isArray(couponData)
          ? couponData
          : []
      );
    } catch (e) {
      setErr(
        e?.message ||
          "Unable to load admin data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") {
      load();
    }
  }, [user]);

  /* ================================
     ACCESS CONTROL
  ================================ */

  if (user?.role !== "admin") {
    return (
      <main className="page">
        <p className="eyebrow">
          THE OFF GRID
        </p>

        <h1>
          Admin access required.
        </h1>

        <p className="muted">
          Sign in with the administrator
          account to manage the store.
        </p>
      </main>
    );
  }

  /* ================================
     FORM CHANGE
  ================================ */

  const change = (key, value) => {
    setF((current) => ({
      ...current,
      [key]: value
    }));
  };

  /* ================================
     SAVE PRODUCT
  ================================ */

  async function save(e) {
    e.preventDefault();

    setBusy(true);
    setErr("");
    setSuccess("");

    const price = Number(f.price);
    const oldPrice =
      f.old_price === ""
        ? null
        : Number(f.old_price);

    const stock = Number(f.stock);

    if (!f.name.trim()) {
      setErr("Product name is required.");
      setBusy(false);
      return;
    }

    if (!f.image.trim()) {
      setErr("Product image URL is required.");
      setBusy(false);
      return;
    }

    if (price < 0 || Number.isNaN(price)) {
      setErr("Please enter a valid price.");
      setBusy(false);
      return;
    }

    if (
      oldPrice !== null &&
      (oldPrice < 0 ||
        Number.isNaN(oldPrice))
    ) {
      setErr(
        "Please enter a valid original price."
      );
      setBusy(false);
      return;
    }

    if (
      oldPrice !== null &&
      oldPrice <= price
    ) {
      setErr(
        "Original price should be higher than selling price."
      );
      setBusy(false);
      return;
    }

    if (
      stock < 0 ||
      Number.isNaN(stock)
    ) {
      setErr(
        "Stock cannot be negative."
      );
      setBusy(false);
      return;
    }

    try {
      const images = f.extraImages
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);

      const { extraImages, ...rest } = f;

      const body = {
        ...rest,
        name: f.name.trim(),
        description:
          f.description.trim(),
        image: f.image.trim(),
        images,
        price,
        old_price: oldPrice,
        stock,
        size_chart: (f.size_chart || []).filter((row) => row.size && String(row.size).trim())
      };

      if (editing) {
        await api(
          `/products/${editing}`,
          {
            method: "PATCH",
            body: JSON.stringify(body)
          }
        );

        setSuccess(
          "Product updated successfully."
        );
      } else {
        await api(
          "/products",
          {
            method: "POST",
            body: JSON.stringify(body)
          }
        );

        setSuccess(
          "Product added successfully."
        );
      }

      setF(empty);
      setEditing(null);

      await load();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch (e) {
      setErr(
        e?.message ||
          "Unable to save product."
      );
    } finally {
      setBusy(false);
    }
  }

  /* ================================
     DELETE PRODUCT
  ================================ */

  async function remove(id) {
    const product = products.find(
      (p) => p.id === id
    );

    const confirmed = window.confirm(
      `Delete "${product?.name || "this product"}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setErr("");
      setSuccess("");

      await api(
        `/products/${id}`,
        {
          method: "DELETE"
        }
      );

      if (editing === id) {
        setEditing(null);
        setF(empty);
      }

      setSuccess(
        "Product deleted successfully."
      );

      await load();
    } catch (e) {
      setErr(
        e?.message ||
          "Unable to delete product."
      );
    }
  }

  /* ================================
     COUPONS — CREATE
  ================================ */

  async function saveCoupon(e) {
    e.preventDefault();

    if (!couponForm.code.trim() || !couponForm.value) {
      setCouponErr("Code and value are required.");
      return;
    }

    try {
      setCouponBusy(true);
      setCouponErr("");

      await api("/coupons", {
        method: "POST",
        body: JSON.stringify({
          code: couponForm.code.trim(),
          type: couponForm.type,
          value: Number(couponForm.value),
          min_order: Number(couponForm.min_order) || 0,
          max_discount:
            couponForm.max_discount === ""
              ? null
              : Number(couponForm.max_discount),
          usage_limit:
            couponForm.usage_limit === ""
              ? null
              : Number(couponForm.usage_limit),
          expires_at: couponForm.expires_at || null
        })
      });

      setCouponForm(emptyCoupon);
      await load();
    } catch (e) {
      setCouponErr(
        e?.message || "Unable to create coupon."
      );
    } finally {
      setCouponBusy(false);
    }
  }

  /* ================================
     COUPONS — TOGGLE ACTIVE
  ================================ */

  async function toggleCoupon(coupon) {
    try {
      await api(`/coupons/${coupon.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          active: !coupon.active
        })
      });
      await load();
    } catch (e) {
      setCouponErr(
        e?.message || "Unable to update coupon."
      );
    }
  }

  /* ================================
     COUPONS — DELETE
  ================================ */

  async function removeCoupon(coupon) {
    const confirmed = window.confirm(
      `Delete coupon "${coupon.code}"?`
    );
    if (!confirmed) return;

    try {
      await api(`/coupons/${coupon.id}`, {
        method: "DELETE"
      });
      await load();
    } catch (e) {
      setCouponErr(
        e?.message || "Unable to delete coupon."
      );
    }
  }

  /* ================================
     EDIT PRODUCT
  ================================ */

  function edit(product) {
    setEditing(product.id);

    setF({
      name: product.name || "",
      description:
        product.description || "",
      category:
        product.category || "Essentials",
      gender:
        product.gender || "Unisex",
      size:
        product.size || "M",
      condition:
        product.condition || "New Arrival",
      price:
        product.price ?? "",
      old_price:
        product.old_price ?? "",
      image:
        product.image || "",
      extraImages: Array.isArray(product.images)
        ? product.images.join("\n")
        : "",
      stock:
        product.stock ?? 0,
      color:
        product.color || "",
      fit:
        product.fit || "",
      video: product.video || "",
      material: product.material || "",
      care_instructions: product.care_instructions || "",
      model_details: product.model_details || "",
      meta_title: product.meta_title || "",
      meta_description: product.meta_description || "",
      size_chart: Array.isArray(product.size_chart) ? product.size_chart : []
    });

    setErr("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  /* ================================
     CANCEL EDIT
  ================================ */

  function cancelEdit() {
    setEditing(null);
    setF(empty);
    setErr("");
    setSuccess("");
  }

  /* ================================
     ORDER STATUS
  ================================ */

  async function status(
    id,
    newStatus
  ) {
    try {
      setErr("");
      setSuccess("");

      await api(
        `/orders/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus
          })
        }
      );

      setSuccess(
        `Order #${id} updated to ${newStatus}.`
      );

      await load();
    } catch (e) {
      setErr(
        e?.message ||
          "Unable to update order."
      );
    }
  }

  /* ================================
     RESET FILTERS
  ================================ */

  function resetProductFilters() {
    setProductSearch("");
    setProductCategory("All");
    setStockFilter("All");
  }

  function resetOrderFilters() {
    setOrderSearch("");
    setOrderFilter("All");
  }

  /* ================================
     PRODUCT FILTER
  ================================ */

  const filteredProducts =
    useMemo(() => {
      const search =
        productSearch
          .toLowerCase()
          .trim();

      return products.filter((p) => {
        const searchable = `
          ${p.name || ""}
          ${p.category || ""}
          ${p.gender || ""}
          ${p.size || ""}
          ${p.condition || ""}
        `.toLowerCase();

        const matchesSearch =
          !search ||
          searchable.includes(search);

        const matchesCategory =
          productCategory === "All" ||
          p.category === productCategory;

        const stock =
          Number(p.stock || 0);

        const matchesStock =
          stockFilter === "All" ||
          (stockFilter ===
            "In Stock" &&
            stock > 2) ||
          (stockFilter ===
            "Low Stock" &&
            stock > 0 &&
            stock <= 2) ||
          (stockFilter ===
            "Sold Out" &&
            stock === 0);

        return (
          matchesSearch &&
          matchesCategory &&
          matchesStock
        );
      });
    }, [
      products,
      productSearch,
      productCategory,
      stockFilter
    ]);

  /* ================================
     ORDER FILTER
  ================================ */

  const filteredOrders =
    useMemo(() => {
      const search =
        orderSearch
          .toLowerCase()
          .trim();

      return orders.filter((o) => {
        const searchable = `
          ${o.id || ""}
          ${o.name || ""}
          ${o.email || ""}
          ${o.shipping_address || ""}
          ${o.status || ""}
        `.toLowerCase();

        const matchesSearch =
          !search ||
          searchable.includes(search);

        const matchesStatus =
          orderFilter === "All" ||
          o.status === orderFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      });
    }, [
      orders,
      orderSearch,
      orderFilter
    ]);

  /* ================================
     DASHBOARD STATS
  ================================ */

  const revenue = orders
    .filter(
      (o) =>
        o.status !== "cancelled"
    )
    .reduce(
      (sum, o) =>
        sum + Number(o.total || 0),
      0
    );

  const pending = orders.filter(
    (o) =>
      o.status === "pending"
  ).length;

  const processing = orders.filter(
    (o) =>
      o.status === "processing"
  ).length;

  const shipped = orders.filter(
    (o) =>
      o.status === "shipped"
  ).length;

  const delivered = orders.filter(
    (o) =>
      o.status === "delivered"
  ).length;

  const cancelled = orders.filter(
    (o) =>
      o.status === "cancelled"
  ).length;

  const totalStock = products.reduce(
    (sum, p) =>
      sum + Number(p.stock || 0),
    0
  );

  const lowStockProducts =
    products.filter(
      (p) =>
        Number(p.stock || 0) > 0 &&
        Number(p.stock || 0) <= 2
    ).length;

  const soldOutProducts =
    products.filter(
      (p) =>
        Number(p.stock || 0) === 0
    ).length;

  const discountedProducts =
    products.filter(
      (p) =>
        Number(p.old_price || 0) >
        Number(p.price || 0)
    ).length;

  /* ================================
     RENDER
  ================================ */

  return (
    <main className="admin-page">

      {/* =================================
          HEADER
      ================================= */}

      <section className="admin-header">

        <div>
          <p className="eyebrow">
            THE OFF GRID · CONTROL CENTER
          </p>

          <h1>
            Admin Dashboard
          </h1>

          <p className="admin-subtitle">
            Manage products, inventory and
            customer orders from one place.
          </p>
        </div>

        <div className="admin-header-actions">

          <div className="admin-user">

            <div className="admin-user-icon">
              <UserRound size={20} />
            </div>

            <div>
              <strong>
                {user.name}
              </strong>

              <span>
                Administrator
              </span>
            </div>

          </div>

          <button
            type="button"
            className="admin-refresh"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "spin"
                  : ""
              }
            />

            {loading
              ? "REFRESHING"
              : "REFRESH"}
          </button>

        </div>

      </section>


      {/* =================================
          MESSAGES
      ================================= */}

      {err && (
        <div className="admin-error">
          <XCircle size={18} />
          <span>{err}</span>

          <button
            type="button"
            onClick={() =>
              setErr("")
            }
          >
            <X size={15} />
          </button>
        </div>
      )}

      {success && (
        <div className="admin-success">
          <CheckCircle2 size={18} />
          <span>{success}</span>

          <button
            type="button"
            onClick={() =>
              setSuccess("")
            }
          >
            <X size={15} />
          </button>
        </div>
      )}


      {/* =================================
          MAIN STATS
      ================================= */}

      <section className="admin-stats">

        <div className="admin-stat-card">

          <div className="admin-stat-icon">
            <ShoppingBag size={20} />
          </div>

          <div>
            <span>ORDERS</span>
            <strong>
              {orders.length}
            </strong>
            <small>
              Total orders
            </small>
          </div>

        </div>


        <div className="admin-stat-card">

          <div className="admin-stat-icon">
            <Clock3 size={20} />
          </div>

          <div>
            <span>PENDING</span>
            <strong>
              {pending}
            </strong>
            <small>
              Need attention
            </small>
          </div>

        </div>


        <div className="admin-stat-card">

          <div className="admin-stat-icon">
            <Package size={20} />
          </div>

          <div>
            <span>PRODUCTS</span>
            <strong>
              {products.length}
            </strong>
            <small>
              Listed products
            </small>
          </div>

        </div>


        <div className="admin-stat-card">

          <div className="admin-stat-icon">
            <IndianRupee size={20} />
          </div>

          <div>
            <span>REVENUE</span>
            <strong>
              {money(revenue)}
            </strong>
            <small>
              Non-cancelled orders
            </small>
          </div>

        </div>

      </section>


      {/* =================================
          INVENTORY SUMMARY
      ================================= */}

      <section className="admin-mini-stats">

        <div>
          <Boxes size={18} />

          <span>
            TOTAL STOCK
          </span>

          <strong>
            {totalStock}
          </strong>
        </div>


        <div>
          <AlertTriangle size={18} />

          <span>
            LOW STOCK
          </span>

          <strong>
            {lowStockProducts}
          </strong>
        </div>


        <div>
          <XCircle size={18} />

          <span>
            SOLD OUT
          </span>

          <strong>
            {soldOutProducts}
          </strong>
        </div>


        <div>
          <TrendingUp size={18} />

          <span>
            DISCOUNTED
          </span>

          <strong>
            {discountedProducts}
          </strong>
        </div>

      </section>


      {/* =================================
          PRODUCT AREA
      ================================= */}

      <section className="admin-content">

        {/* =================================
            ADD / EDIT PRODUCT
        ================================= */}

        <div className="admin-form-panel">

          <div className="admin-panel-header">

            <div>
              <p className="eyebrow">
                INVENTORY
              </p>

              <h2>
                {editing
                  ? "Edit Product"
                  : "Add Product"}
              </h2>
            </div>

            {editing && (
              <button
                type="button"
                className="admin-text-button"
                onClick={cancelEdit}
              >
                <RotateCcw size={14} />
                Cancel
              </button>
            )}

          </div>


          <form
            className="admin-product-form"
            onSubmit={save}
          >

            <label>
              PRODUCT NAME

              <input
                required
                placeholder="e.g. Oversized Cargo Jacket"
                value={f.name}
                onChange={(e) =>
                  change(
                    "name",
                    e.target.value
                  )
                }
              />
            </label>


            <label>
              IMAGE URL

              <div className="admin-upload-row">
                <input
                  required
                  type="url"
                  placeholder="https://..."
                  value={f.image}
                  onChange={(e) =>
                    change(
                      "image",
                      e.target.value
                    )
                  }
                />
                <button type="button" className="admin-upload-btn" disabled={uploadingImage} onClick={() => imageFileRef.current?.click()}>
                  {uploadingImage ? "..." : "UPLOAD"}
                </button>
                <input ref={imageFileRef} type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, "image")} />
              </div>

              {f.image && (
                <div className="admin-image-preview">
                  <img
                    src={f.image}
                    alt="Product preview"
                    onError={(e) => {
                      e.currentTarget.style.display =
                        "none";
                    }}
                  />
                </div>
              )}
            </label>


            <label>
              ADDITIONAL PHOTOS (OPTIONAL)

              <div className="admin-upload-row">
                <textarea
                  placeholder={"One image URL per line\ne.g. back view, close-up of fabric"}
                  rows={3}
                value={f.extraImages}
                onChange={(e) =>
                  change(
                    "extraImages",
                    e.target.value
                  )
                }
              />
                <button type="button" className="admin-upload-btn" disabled={uploadingImage} onClick={() => extraImageFileRef.current?.click()}>
                  {uploadingImage ? "..." : "UPLOAD"}
                </button>
                <input ref={extraImageFileRef} type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, "extraImages")} />
              </div>
            </label>


            <label>
              VIDEO URL (OPTIONAL)

              <div className="admin-upload-row">
                <input
                  type="url"
                  placeholder="https://... (mp4/webm)"
                  value={f.video}
                  onChange={(e) => change("video", e.target.value)}
                />
                <button type="button" className="admin-upload-btn" disabled={uploadingImage} onClick={() => videoFileRef.current?.click()}>
                  {uploadingImage ? "..." : "UPLOAD"}
                </button>
                <input ref={videoFileRef} type="file" accept="video/*" hidden onChange={(e) => handleFileUpload(e, "video")} />
              </div>
            </label>

            <div className="admin-two">
              <label>
                MATERIAL (OPTIONAL)
                <input placeholder="e.g. 240 GSM Cotton" value={f.material} onChange={(e) => change("material", e.target.value)} />
              </label>
              <label>
                MODEL DETAILS (OPTIONAL)
                <input placeholder="e.g. Model is 6'0, wearing size M" value={f.model_details} onChange={(e) => change("model_details", e.target.value)} />
              </label>
            </div>

            <label>
              CARE INSTRUCTIONS (OPTIONAL)
              <textarea rows={2} placeholder="e.g. Machine wash cold, do not bleach, tumble dry low" value={f.care_instructions} onChange={(e) => change("care_instructions", e.target.value)} />
            </label>

            <div className="admin-seo-block">
              <span className="admin-seo-label">SEO (OPTIONAL — falls back to product name/description if left blank)</span>
              <label>
                SEO TITLE
                <input maxLength={70} placeholder={f.name ? `${f.name} | THE OFF GRID` : "SEO title"} value={f.meta_title} onChange={(e) => change("meta_title", e.target.value)} />
              </label>
              <label>
                META DESCRIPTION
                <textarea rows={2} maxLength={160} placeholder="Shown in Google search results — keep it under 160 characters" value={f.meta_description} onChange={(e) => change("meta_description", e.target.value)} />
              </label>
            </div>

            <div className="admin-seo-block">
              <span className="admin-seo-label">SIZE CHART (OPTIONAL — leave empty to use the generic size guide. Measurements in CM; customers can toggle to inches automatically.)</span>
              {f.size_chart.map((row, i) => (
                <div className="admin-size-chart-row" key={i}>
                  <input placeholder="SIZE (e.g. M)" value={row.size || ""} onChange={(e) => {
                    const next = [...f.size_chart]; next[i] = { ...next[i], size: e.target.value }; change("size_chart", next);
                  }} />
                  <input type="number" placeholder="CHEST (CM)" value={row.chest_cm ?? ""} onChange={(e) => {
                    const next = [...f.size_chart]; next[i] = { ...next[i], chest_cm: e.target.value === "" ? null : Number(e.target.value) }; change("size_chart", next);
                  }} />
                  <input type="number" placeholder="LENGTH (CM)" value={row.length_cm ?? ""} onChange={(e) => {
                    const next = [...f.size_chart]; next[i] = { ...next[i], length_cm: e.target.value === "" ? null : Number(e.target.value) }; change("size_chart", next);
                  }} />
                  <input type="number" placeholder="SHOULDER (CM)" value={row.shoulder_cm ?? ""} onChange={(e) => {
                    const next = [...f.size_chart]; next[i] = { ...next[i], shoulder_cm: e.target.value === "" ? null : Number(e.target.value) }; change("size_chart", next);
                  }} />
                  <button type="button" className="admin-size-chart-remove" onClick={() => change("size_chart", f.size_chart.filter((_, idx) => idx !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="text-button" onClick={() => change("size_chart", [...f.size_chart, { size: "", chest_cm: null, length_cm: null, shoulder_cm: null }])}>
                <Plus size={13} /> ADD SIZE ROW
              </button>
            </div>


            <div className="admin-two">

              <label>
                SELLING PRICE

                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={f.price}
                  onChange={(e) =>
                    change(
                      "price",
                      e.target.value
                    )
                  }
                />
              </label>


              <label>
                ORIGINAL PRICE

                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Optional"
                  value={f.old_price}
                  onChange={(e) =>
                    change(
                      "old_price",
                      e.target.value
                    )
                  }
                />
              </label>

            </div>


            <div className="admin-two">

              <label>
                SIZE

                <input
                  required
                  placeholder="S / M / L / XL"
                  value={f.size}
                  onChange={(e) =>
                    change(
                      "size",
                      e.target.value
                    )
                  }
                />
              </label>


              <label>
                STOCK

                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={f.stock}
                  onChange={(e) =>
                    change(
                      "stock",
                      e.target.value
                    )
                  }
                />
              </label>

            </div>


            <div className="admin-two">

              <label>
                CATEGORY

                <select
                  value={f.category}
                  onChange={(e) =>
                    change(
                      "category",
                      e.target.value
                    )
                  }
                >
                  {categories.map(
                    (category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>
                    )
                  )}
                </select>
              </label>


              <label>
                GENDER

                <select
                  value={f.gender}
                  onChange={(e) =>
                    change(
                      "gender",
                      e.target.value
                    )
                  }
                >
                  {genders.map(
                    (gender) => (
                      <option
                        key={gender}
                        value={gender}
                      >
                        {gender}
                      </option>
                    )
                  )}
                </select>
              </label>

            </div>


            <div className="admin-two">

              <label>
                COLOR

                <input
                  placeholder="e.g. Olive, Black, Rust"
                  value={f.color}
                  onChange={(e) =>
                    change(
                      "color",
                      e.target.value
                    )
                  }
                />
              </label>


              <label>
                FIT

                <select
                  value={f.fit}
                  onChange={(e) =>
                    change(
                      "fit",
                      e.target.value
                    )
                  }
                >
                  <option value="">Not specified</option>
                  <option value="Slim">Slim</option>
                  <option value="Regular">Regular</option>
                  <option value="Relaxed">Relaxed</option>
                  <option value="Oversized">Oversized</option>
                </select>
              </label>

            </div>


            <label>
              PRODUCT TAG

              <select
                value={f.condition}
                onChange={(e) =>
                  change(
                    "condition",
                    e.target.value
                  )
                }
              >
                {conditions.map(
                  (condition) => (
                    <option
                      key={condition}
                      value={condition}
                    >
                      {condition}
                    </option>
                  )
                )}
              </select>
            </label>


            <label>
              DESCRIPTION

              <textarea
                rows="5"
                placeholder="Describe the product, fit, material, details..."
                value={f.description}
                onChange={(e) =>
                  change(
                    "description",
                    e.target.value
                  )
                }
              />
            </label>


            <button
              type="submit"
              disabled={busy}
              className="admin-save-button"
            >
              {busy ? (
                <>
                  <RefreshCw
                    size={16}
                    className="spin"
                  />
                  SAVING...
                </>
              ) : editing ? (
                <>
                  <CheckCircle2 size={16} />
                  SAVE CHANGES
                </>
              ) : (
                <>
                  <Plus size={17} />
                  ADD PRODUCT
                </>
              )}
            </button>

          </form>

        </div>


        {/* =================================
            PRODUCT LIST
        ================================= */}

        <div className="admin-products-panel">

          <div className="admin-panel-header">

            <div>
              <p className="eyebrow">
                YOUR COLLECTION
              </p>

              <h2>
                Products
                <span>
                  {products.length}
                </span>
              </h2>
            </div>

          </div>


          {/* PRODUCT FILTERS */}

          <div className="admin-product-controls">

            <div className="admin-search-control">

              <Search size={16} />

              <input
                type="search"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) =>
                  setProductSearch(
                    e.target.value
                  )
                }
              />

            </div>


            <select
              value={productCategory}
              onChange={(e) =>
                setProductCategory(
                  e.target.value
                )
              }
            >
              <option value="All">
                All Categories
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                )
              )}
            </select>


            <select
              value={stockFilter}
              onChange={(e) =>
                setStockFilter(
                  e.target.value
                )
              }
            >
              <option value="All">
                All Stock
              </option>

              <option value="In Stock">
                In Stock
              </option>

              <option value="Low Stock">
                Low Stock
              </option>

              <option value="Sold Out">
                Sold Out
              </option>
            </select>

          </div>


          <div className="admin-product-results">

            <span>
              Showing{" "}
              <strong>
                {filteredProducts.length}
              </strong>{" "}
              of{" "}
              <strong>
                {products.length}
              </strong>{" "}
              products
            </span>

            {(productSearch ||
              productCategory !== "All" ||
              stockFilter !== "All") && (
              <button
                type="button"
                onClick={
                  resetProductFilters
                }
              >
                CLEAR FILTERS
              </button>
            )}

          </div>


          {/* PRODUCT LIST */}

          <div className="admin-product-list">

            {filteredProducts.length === 0 ? (

              <div className="admin-empty">

                <ShoppingBag size={28} />

                <h3>
                  No products found
                </h3>

                <p>
                  Try changing your
                  search or filters.
                </p>

                <button
                  type="button"
                  onClick={
                    resetProductFilters
                  }
                >
                  RESET FILTERS
                </button>

              </div>

            ) : (

              filteredProducts.map(
                (p) => {

                  const stock =
                    Number(
                      p.stock || 0
                    );

                  const price =
                    Number(
                      p.price || 0
                    );

                  const oldPrice =
                    Number(
                      p.old_price || 0
                    );

                  const discount =
                    oldPrice > price
                      ? Math.round(
                          ((oldPrice -
                            price) /
                            oldPrice) *
                            100
                        )
                      : 0;

                  return (
                    <article
                      className={`admin-product-card ${
                        stock === 0
                          ? "admin-product-sold"
                          : ""
                      }`}
                      key={p.id}
                    >

                      <div className="admin-product-image-wrap">

                        <img
                          src={p.image}
                          alt={p.name}
                        />

                        {discount > 0 && (
                          <span className="admin-discount">
                            -{discount}%
                          </span>
                        )}

                      </div>


                      <div className="admin-product-details">

                        <div className="admin-product-title">

                          <h3>
                            {p.name}
                          </h3>

                          <span>
                            {p.category}
                            {" · "}
                            {p.gender}
                            {" · "}
                            {p.size}
                          </span>

                        </div>


                        <strong className="admin-product-price">
                          {money(price)}

                          {oldPrice >
                            price && (
                            <del>
                              {money(
                                oldPrice
                              )}
                            </del>
                          )}
                        </strong>


                        <small
                          className={
                            stock === 0
                              ? "stock sold"
                              : stock <= 2
                              ? "stock low"
                              : "stock good"
                          }
                        >
                          {stock === 0
                            ? "SOLD OUT"
                            : stock <= 2
                            ? `ONLY ${stock} LEFT`
                            : `${stock} IN STOCK`}
                        </small>


                        <div className="admin-product-actions">

                          <button
                            type="button"
                            onClick={() =>
                              edit(p)
                            }
                          >
                            <Pencil
                              size={15}
                            />
                            Edit
                          </button>


                          <button
                            type="button"
                            className="delete"
                            onClick={() =>
                              remove(p.id)
                            }
                          >
                            <Trash2
                              size={15}
                            />
                            Delete
                          </button>

                        </div>

                      </div>

                    </article>
                  );
                }
              )

            )}

          </div>

        </div>

      </section>


      {/* =================================
          ORDER MANAGEMENT
      ================================= */}

      <section className="admin-orders">

        <div className="admin-orders-header">

          <div>
            <p className="eyebrow">
              ORDER MANAGEMENT
            </p>

            <h2>
              Customer Orders
            </h2>

            <p className="admin-orders-description">
              Track customer purchases and
              update delivery status.
            </p>
          </div>

          <div className="orders-summary">
            <strong>
              {delivered}
            </strong>{" "}
            delivered
          </div>

        </div>


        {/* ORDER CONTROLS */}

        <div className="admin-order-controls">

          <div className="admin-search-control">

            <Search size={16} />

            <input
              type="search"
              placeholder="Search order, customer or email..."
              value={orderSearch}
              onChange={(e) =>
                setOrderSearch(
                  e.target.value
                )
              }
            />

          </div>


          <select
            value={orderFilter}
            onChange={(e) =>
              setOrderFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Orders
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="processing">
              Processing
            </option>

            <option value="shipped">
              Shipped
            </option>

            <option value="delivered">
              Delivered
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>

          {(orderSearch ||
            orderFilter !== "All") && (
            <button
              type="button"
              className="admin-clear-orders"
              onClick={
                resetOrderFilters
              }
            >
              CLEAR
            </button>
          )}

        </div>


        {/* ORDER SUMMARY */}

        <div className="admin-order-summary">

          <span>
            Pending{" "}
            <strong>
              {pending}
            </strong>
          </span>

          <span>
            Processing{" "}
            <strong>
              {processing}
            </strong>
          </span>

          <span>
            Shipped{" "}
            <strong>
              {shipped}
            </strong>
          </span>

          <span>
            Delivered{" "}
            <strong>
              {delivered}
            </strong>
          </span>

          <span>
            Cancelled{" "}
            <strong>
              {cancelled}
            </strong>
          </span>

        </div>


        <div className="admin-order-list">

          {!filteredOrders.length ? (

            <div className="admin-empty">

              <ShoppingBag size={32} />

              <h3>
                No orders found
              </h3>

              <p>
                Customer orders matching
                your filters will appear
                here.
              </p>

            </div>

          ) : (

            filteredOrders.map(
              (o) => (

                <article
                  className="admin-order-card"
                  key={o.id}
                >

                  {/* ORDER HEADER */}

                  <div className="order-card-top">

                    <div className="admin-order-number">

                      <div className="admin-order-icon">
                        <Package
                          size={19}
                        />
                      </div>

                      <div>

                        <span>
                          ORDER
                        </span>

                        <strong>
                          #{o.id}
                        </strong>

                        <small>
                          {o.created_at
                            ? new Date(
                                o.created_at
                              ).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric"
                                }
                              )
                            : "Date unavailable"}
                        </small>

                      </div>

                    </div>


                    <StatusBadge
                      status={
                        o.status
                      }
                    />

                  </div>


                  {/* ORDER INFORMATION */}

                  <div className="admin-order-info">

                    <div>
                      <UserRound
                        size={16}
                      />

                      <span>
                        <small>
                          CUSTOMER
                        </small>

                        <strong>
                          {o.name ||
                            "Customer"}
                        </strong>

                        <em>
                          {o.email ||
                            "Email unavailable"}
                        </em>
                      </span>
                    </div>


                    <div>
                      <MapPin
                        size={16}
                      />

                      <span>
                        <small>
                          DELIVERY ADDRESS
                        </small>

                        <strong>
                          {o.shipping_address ||
                            "Address not available"}
                        </strong>
                      </span>
                    </div>


                    <div>
                      <IndianRupee
                        size={16}
                      />

                      <span>
                        <small>
                          ORDER TOTAL
                        </small>

                        <strong>
                          {money(o.total)}
                        </strong>
                      </span>
                    </div>

                  </div>


                  {/* PROGRESS */}

                  <OrderProgress
                    status={
                      o.status
                    }
                  />


                  {/* ORDER FOOTER */}

                  <div className="admin-order-footer">

                    <span>
                      UPDATE ORDER
                    </span>

                    <select
                      value={
                        o.status
                      }
                      onChange={(e) =>
                        status(
                          o.id,
                          e.target.value
                        )
                      }
                    >
                      <option value="pending">
                        Pending
                      </option>

                      <option value="processing">
                        Processing
                      </option>

                      <option value="shipped">
                        Shipped
                      </option>

                      <option value="delivered">
                        Delivered
                      </option>

                      <option value="cancelled">
                        Cancelled
                      </option>
                    </select>

                  </div>

                </article>

              )
            )

          )}

        </div>

      </section>


      {/* =================================
          COUPON MANAGEMENT
      ================================= */}

      <section className="admin-content">

        <div className="admin-form-panel">

          <div className="admin-panel-header">
            <div>
              <p className="eyebrow">
                PROMOTIONS
              </p>

              <h2>
                Add Coupon
              </h2>
            </div>
          </div>

          <form
            className="admin-product-form"
            onSubmit={saveCoupon}
          >

            <label>
              COUPON CODE
              <input
                type="text"
                placeholder="e.g. OFFGRID20"
                value={couponForm.code}
                onChange={(e) =>
                  setCouponForm((c) => ({
                    ...c,
                    code: e.target.value.toUpperCase()
                  }))
                }
              />
            </label>

            <div className="admin-two">

              <label>
                DISCOUNT TYPE
                <select
                  value={couponForm.type}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      type: e.target.value
                    }))
                  }
                >
                  <option value="percent">Percent off</option>
                  <option value="flat">Flat amount off</option>
                </select>
              </label>

              <label>
                {couponForm.type === "percent"
                  ? "VALUE (%)"
                  : "VALUE (₹)"}
                <input
                  type="number"
                  min="1"
                  value={couponForm.value}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      value: e.target.value
                    }))
                  }
                />
              </label>

            </div>

            <div className="admin-two">

              <label>
                MIN. ORDER VALUE (₹)
                <input
                  type="number"
                  min="0"
                  value={couponForm.min_order}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      min_order: e.target.value
                    }))
                  }
                />
              </label>

              <label>
                MAX DISCOUNT (₹, optional)
                <input
                  type="number"
                  min="0"
                  placeholder="No cap"
                  value={couponForm.max_discount}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      max_discount: e.target.value
                    }))
                  }
                />
              </label>

            </div>

            <div className="admin-two">

              <label>
                USAGE LIMIT (optional)
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={couponForm.usage_limit}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      usage_limit: e.target.value
                    }))
                  }
                />
              </label>

              <label>
                EXPIRES ON (optional)
                <input
                  type="date"
                  value={couponForm.expires_at}
                  onChange={(e) =>
                    setCouponForm((c) => ({
                      ...c,
                      expires_at: e.target.value
                    }))
                  }
                />
              </label>

            </div>

            {couponErr && (
              <p className="admin-form-error">
                {couponErr}
              </p>
            )}

            <button
              type="submit"
              className="admin-save-button"
              disabled={couponBusy}
            >
              <Plus size={15} />
              {couponBusy ? "Creating…" : "Create Coupon"}
            </button>

          </form>

        </div>


        <div className="admin-products-panel">

          <div className="admin-panel-header">
            <div>
              <p className="eyebrow">
                {coupons.length} COUPON
                {coupons.length === 1 ? "" : "S"}
              </p>

              <h2>
                All Coupons
              </h2>
            </div>
          </div>

          <div className="admin-product-list">

          {!coupons.length && (
            <div className="admin-empty">
              <p>
                No coupons yet. Create your first one on the left.
              </p>
            </div>
          )}

          {coupons.map((c) => (

            <article
              key={c.id}
              className={`admin-product-card ${!c.active ? "admin-product-sold" : ""}`}
            >

              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{c.code}</strong>
                </div>
                <p className="muted">
                  {c.type === "percent"
                    ? `${c.value}% off`
                    : `₹${c.value} off`}
                  {c.min_order > 0 &&
                    ` · min ₹${c.min_order}`}
                  {c.max_discount &&
                    ` · capped ₹${c.max_discount}`}
                  {c.usage_limit &&
                    ` · ${c.used_count}/${c.usage_limit} used`}
                  {!c.usage_limit &&
                    ` · used ${c.used_count}×`}
                  {c.expires_at &&
                    ` · expires ${new Date(c.expires_at).toLocaleDateString("en-IN")}`}
                </p>

                <div className="admin-product-actions">

                  <button
                    type="button"
                    onClick={() => toggleCoupon(c)}
                  >
                    {c.active ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    type="button"
                    className="delete"
                    onClick={() => removeCoupon(c)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>

                </div>
              </div>

            </article>

          ))}

          </div>

        </div>

      </section>

      <AdminExtras user={user} />

    </main>
  );
}

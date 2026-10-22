import React, { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X, ChevronDown, Search, Sparkles } from "lucide-react";
import ProductCard from "./ProductCard";

const SORTS = ["FEATURED", "PRICE LOW", "PRICE HIGH", "NEWEST", "SALE", "BESTSELLERS"];
const PRICES = ["ALL", "UNDER 1500", "1500-2500", "2500-3500", "3500+"];
const QUICK_TABS = ["ALL", "NEW", "BESTSELLERS", "SALE"];
const STOCKS = ["ALL", "IN STOCK", "LOW STOCK", "SOLD OUT"];
const SIZES = ["ALL", "XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "ONE SIZE"];

const salePercent = (p) => {
  const oldPrice = Number(p.old_price || 0);
  const price = Number(p.price || 0);
  return oldPrice > price && oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
};

const stockState = (p) => {
  const stock = Number(p.stock);
  if (!Number.isFinite(stock) || stock <= 0) return "SOLD OUT";
  if (stock <= 5) return "LOW STOCK";
  return "IN STOCK";
};

const isNew = (p) => {
  const condition = String(p.condition || "").toUpperCase();
  return condition === "NEW" || condition === "BESTSELLER" || condition === "NEW DROP";
};

export default function ProductDiscovery({ products = [], add, wishlist = [], toggle, initialCategory = "ALL", searchText = "", setSearchText }) {
  const [category, setCategory] = useState(initialCategory || "ALL");
  const [gender, setGender] = useState("ALL");
  const [fit, setFit] = useState("ALL");
  const [color, setColor] = useState("ALL");
  const [size, setSize] = useState("ALL");
  const [stock, setStock] = useState("ALL");
  const [saleOnly, setSaleOnly] = useState(false);
  const [sort, setSort] = useState("FEATURED");
  const [price, setPrice] = useState("ALL");
  const [quickTab, setQuickTab] = useState("ALL");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setCategory(initialCategory || "ALL"), [initialCategory]);

  const categories = useMemo(() => ["ALL", ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const genders = useMemo(() => ["ALL", ...new Set(products.map((p) => p.gender).filter(Boolean))], [products]);
  const fits = useMemo(() => ["ALL", ...new Set(products.map((p) => p.fit).filter(Boolean))], [products]);
  const colors = useMemo(() => ["ALL", ...new Set(products.flatMap((p) => Array.isArray(p.colors) && p.colors.length ? p.colors : [p.color]).filter(Boolean))], [products]);
  const sizes = useMemo(() => ["ALL", ...new Set(products.flatMap((p) => Array.isArray(p.sizes) && p.sizes.length ? p.sizes : String(p.size || "").split("/").map((s) => s.trim())).filter(Boolean))], [products]);

  const result = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    let list = products.filter((p) => {
      if (category !== "ALL" && String(p.category || "").toUpperCase() !== category.toUpperCase()) return false;
      if (gender !== "ALL" && String(p.gender || "").toUpperCase() !== gender.toUpperCase()) return false;
      if (fit !== "ALL" && String(p.fit || "").toUpperCase() !== fit.toUpperCase()) return false;
      if (color !== "ALL") {
        const productColors = Array.isArray(p.colors) && p.colors.length ? p.colors : [p.color];
        if (!productColors.some((c) => String(c || "").toUpperCase() === color.toUpperCase())) return false;
      }
      if (size !== "ALL") {
        const productSizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : String(p.size || "").split("/").map((s) => s.trim());
        if (!productSizes.some((s) => String(s).toUpperCase() === size.toUpperCase())) return false;
      }
      const state = stockState(p);
      if (stock !== "ALL" && state !== stock) return false;
      const value = Number(p.price || 0);
      if (price === "UNDER 1500" && value >= 1500) return false;
      if (price === "1500-2500" && (value < 1500 || value > 2500)) return false;
      if (price === "2500-3500" && (value < 2500 || value > 3500)) return false;
      if (price === "3500+" && value < 3500) return false;
      if (saleOnly && salePercent(p) <= 0) return false;
      if (quickTab === "NEW" && !isNew(p)) return false;
      if (quickTab === "BESTSELLERS" && String(p.condition || "").toUpperCase() !== "BESTSELLER") return false;
      if (quickTab === "SALE" && salePercent(p) <= 0) return false;
      if (query) {
        const haystack = [p.name, p.category, p.gender, p.color, ...(Array.isArray(p.colors) ? p.colors : []), p.fit, p.description, p.material, ...(Array.isArray(p.details) ? p.details : [])].filter(Boolean).join(" ").toLowerCase();
        const tokens = query.split(/\s+/).filter(Boolean);
        if (!tokens.every((token) => haystack.includes(token))) return false;
      }
      return true;
    });
    list = [...list];
    if (sort === "PRICE LOW") list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sort === "PRICE HIGH") list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    if (sort === "NEWEST") list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    if (sort === "SALE") list.sort((a, b) => salePercent(b) - salePercent(a));
    if (sort === "BESTSELLERS") list.sort((a, b) => Number(String(b.condition || "").toUpperCase() === "BESTSELLER") - Number(String(a.condition || "").toUpperCase() === "BESTSELLER"));
    if (sort === "FEATURED") list.sort((a, b) => {
      const featuredA = (String(a.condition || "").toUpperCase() === "BESTSELLER" ? 20 : 0) + salePercent(a) + (Number(a.stock || 0) > 0 ? 3 : 0);
      const featuredB = (String(b.condition || "").toUpperCase() === "BESTSELLER" ? 20 : 0) + salePercent(b) + (Number(b.stock || 0) > 0 ? 3 : 0);
      return featuredB - featuredA;
    });
    return list;
  }, [products, category, gender, fit, color, size, stock, saleOnly, price, sort, quickTab, searchText]);

  const activeFilters = [category, gender, fit, color, size, stock, price].filter((v) => v !== "ALL").length + (saleOnly ? 1 : 0);
  const hasSearch = String(searchText || "").trim().length > 0;
  const clearFilters = () => { setGender("ALL"); setFit("ALL"); setColor("ALL"); setSize("ALL"); setStock("ALL"); setSaleOnly(false); setPrice("ALL"); setSort("FEATURED"); setQuickTab("ALL"); setCategory(initialCategory || "ALL"); };
  const clearAll = () => { clearFilters(); setSearchText?.(""); };
  const setQuick = (tab) => { setQuickTab(tab); if (tab === "NEW") setSort("NEWEST"); else if (tab === "BESTSELLERS") setSort("BESTSELLERS"); else if (tab === "SALE") setSort("SALE"); else setSort("FEATURED"); if (tab === "SALE") setSaleOnly(true); else setSaleOnly(false); };

  return (
    <div className="product-discovery">
      <div className="discovery-intro">
        <div><span>02 / NEW DROP</span><h2>EVERYDAY <em>ESSENTIALS.</em></h2></div>
        <p>BUILT FOR REPEAT WEAR.</p>
      </div>

      <div className="discovery-quick-tabs" role="tablist" aria-label="Collection filters">
        {QUICK_TABS.map((tab) => <button key={tab} type="button" className={quickTab === tab ? "active" : ""} onClick={() => setQuick(tab)}>{tab}</button>)}
      </div>

      <div className="discovery-toolbar">
        <div className="discovery-filter-label"><span>FILTER / REFINE</span>{activeFilters > 0 && <b>{activeFilters}</b>}</div>
        <button className={`discovery-mobile-filter${activeFilters ? " has-filters" : ""}`} type="button" onClick={() => setMobileOpen(true)}><SlidersHorizontal size={16} /> FILTERS{activeFilters ? ` (${activeFilters})` : ""}</button>
        <div className="discovery-sort"><span>SORT BY</span><div><select value={sort} onChange={(e) => { const value = e.target.value; setSort(value); if (value === "BESTSELLERS") { setQuickTab("BESTSELLERS"); setSaleOnly(false); } else if (value === "SALE") { setQuickTab("SALE"); setSaleOnly(true); } else { setQuickTab("ALL"); setSaleOnly(false); } }} aria-label="Sort products">{SORTS.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div></div>
      </div>

      <div className="discovery-filters desktop-filters">
        <Filter label="CATEGORY" value={category} setValue={setCategory} options={categories} />
        <Filter label="GENDER" value={gender} setValue={setGender} options={genders} />
        <Filter label="FIT" value={fit} setValue={setFit} options={fits} />
        <Filter label="COLOUR" value={color} setValue={setColor} options={colors} />
        <Filter label="SIZE" value={size} setValue={setSize} options={sizes.length > 1 ? sizes : SIZES} />
        <Filter label="STOCK" value={stock} setValue={setStock} options={STOCKS} />
        <Filter label="PRICE" value={price} setValue={setPrice} options={PRICES} />
        <button type="button" className={`discovery-sale-toggle${saleOnly ? " active" : ""}`} onClick={() => { setSaleOnly((v) => !v); setQuickTab("ALL"); setSort("FEATURED"); }}>{saleOnly ? "SALE ONLY ✓" : "SALE ONLY"}</button>
        {(activeFilters > 0 || sort !== "FEATURED" || hasSearch) && <button className="discovery-clear" type="button" onClick={clearAll}>CLEAR ALL <X size={13} /></button>}
      </div>

      {mobileOpen && <div className="discovery-drawer-backdrop" onClick={(e) => e.target === e.currentTarget && setMobileOpen(false)}><aside className="discovery-drawer"><div className="discovery-drawer-head"><strong>FILTERS / REFINE</strong><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close filters"><X /></button></div><Filter label="CATEGORY" value={category} setValue={setCategory} options={categories} /><Filter label="GENDER" value={gender} setValue={setGender} options={genders} /><Filter label="FIT" value={fit} setValue={setFit} options={fits} /><Filter label="COLOUR" value={color} setValue={setColor} options={colors} /><Filter label="SIZE" value={size} setValue={setSize} options={sizes.length > 1 ? sizes : SIZES} /><Filter label="STOCK" value={stock} setValue={setStock} options={STOCKS} /><Filter label="PRICE" value={price} setValue={setPrice} options={PRICES} /><button type="button" className={`discovery-sale-toggle drawer-sale${saleOnly ? " active" : ""}`} onClick={() => { setSaleOnly((v) => !v); setQuickTab("ALL"); setSort("FEATURED"); }}>{saleOnly ? "SALE ONLY ✓" : "SALE ONLY"}</button><button className="orange-btn discovery-apply" type="button" onClick={() => setMobileOpen(false)}>SHOW {result.length} PRODUCTS</button><button className="discovery-clear drawer-clear" type="button" onClick={clearAll}>CLEAR ALL</button></aside></div>}

      <div className="discovery-results-head"><span>{hasSearch ? <><Search size={13} /> SEARCH RESULTS FOR “{searchText}”</> : quickTab === "NEW" ? "NEW ARRIVALS" : quickTab === "BESTSELLERS" ? "BESTSELLERS" : quickTab === "SALE" || saleOnly ? "SALE EDIT" : "THE OFF GRID COLLECTION"}</span><strong>{result.length} {result.length === 1 ? "PRODUCT" : "PRODUCTS"}</strong></div>

      {result.length ? <div className="products discovery-grid">{result.map((product) => <ProductCard key={product.id} p={product} add={add} wish={wishlist} toggle={toggle} />)}</div> : <div className="discovery-empty"><Sparkles size={18} /><span>NO MATCHES</span><h3>NOTHING HERE.</h3><p>Try clearing a filter or searching for another piece.</p><button type="button" onClick={clearAll}>VIEW ALL PRODUCTS</button></div>}
      <div className="shop-count">SHOWING <strong>{result.length}</strong> OF <strong>{products.length}</strong> PRODUCTS</div>
    </div>
  );
}

function Filter({ label, value, setValue, options }) { return <label className="discovery-filter"><span>{label}</span><div><select value={value} onChange={(e) => setValue(e.target.value)} aria-label={label}>{options.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></div></label>; }

import React from "react";
import ProductDiscovery from "./ProductDiscovery";

export default function Shop({ products, add, wishlist, toggle, initialCategory = "ALL" }) {
  return (
    <section className="shop section" id="shop">
      <div className="section-title shop-title">
        <div>
          <span>02 / NEW DROP</span>
          <h2>EVERYDAY<br /><em>ESSENTIALS.</em></h2>
        </div>
        <p>BUILT FOR REPEAT WEAR.</p>
      </div>
      <ProductDiscovery
        products={products}
        add={add}
        wishlist={wishlist}
        toggle={toggle}
        initialCategory={initialCategory}
      />
    </section>
  );
}

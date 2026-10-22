import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

export default function ProductGallery({ product }) {
  const images = Array.from(new Set([
    product?.image,
    ...(Array.isArray(product?.images) ? product.images : [])
  ].filter(Boolean)));
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const current = images[active] || product?.image;

  const move = (dir) => {
    if (images.length < 2) return;
    setActive((i) => (i + dir + images.length) % images.length);
  };

  if (!current) return <div className="product-gallery-empty" />;

  return (
    <>
      <div className="product-gallery">
        <div className="product-gallery-thumbs">
          {images.map((src, i) => (
            <button key={`${src}-${i}`} className={i === active ? "active" : ""} onClick={() => setActive(i)} aria-label={`View image ${i + 1}`}>
              <img src={src} alt={`${product.name} view ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} />
            </button>
          ))}
        </div>
        <div className="product-gallery-main">
          <img src={current} alt={product.name} onClick={() => setZoom(true)} />
          <div className="product-gallery-tools">
            <button onClick={() => setZoom(true)} aria-label="Zoom product image"><Maximize2 size={16} /></button>
          </div>
          {images.length > 1 && <>
            <button className="gallery-arrow gallery-prev" onClick={() => move(-1)} aria-label="Previous image"><ChevronLeft /></button>
            <button className="gallery-arrow gallery-next" onClick={() => move(1)} aria-label="Next image"><ChevronRight /></button>
          </>}
          <div className="gallery-count">{String(active + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</div>
        </div>
      </div>

      {zoom && <div className="gallery-lightbox" onClick={(e) => e.target === e.currentTarget && setZoom(false)}>
        <button className="gallery-lightbox-close" onClick={() => setZoom(false)} aria-label="Close image viewer"><X /></button>
        <img src={current} alt={product.name} />
        {images.length > 1 && <>
          <button className="gallery-lightbox-arrow gallery-lightbox-prev" onClick={() => move(-1)}><ChevronLeft /></button>
          <button className="gallery-lightbox-arrow gallery-lightbox-next" onClick={() => move(1)}><ChevronRight /></button>
        </>}
      </div>}
    </>
  );
}

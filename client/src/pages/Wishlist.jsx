import React from "react";
import {Link} from "react-router-dom";
import ProductCard from "../components/ProductCard";
export default function Wishlist({products,wishlist,toggle,add}) {
 const list=products.filter(p=>wishlist.some(x=>String(x)===String(p.id)));
 return <div className="page"><div className="page-head"><span>THE OFF GRID / SAVED</span><h1>YOUR <em>WISHLIST.</em></h1></div>{list.length?<div className="products">{list.map(p=><ProductCard key={p.id} p={p} add={add} wish={wishlist} toggle={toggle}/>)}</div>:<div className="empty-box"><h2>NOTHING SAVED YET.</h2><Link className="orange-btn" to="/">DISCOVER PRODUCTS</Link></div>}</div>
}

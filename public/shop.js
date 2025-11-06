async function loadShop() {
  const shopEl = document.getElementById("shop");
  shopEl.innerHTML = `<p>Loading products...</p>`;

  const res = await fetch("/api/products");
  const products = await res.json();

  if (!products.length) {
    shopEl.innerHTML = `<p>No products found.</p>`;
    return;
  }

  shopEl.innerHTML = products.map(p => `
    <div class="shop-item">
      <img src="${p.img}" alt="${p.name}" class="shop-img"/>
      <h2>${p.name}</h2>
      <p>${p.desc || "No description."}</p>
      <div class="shop-price">$${p.price}</div>
      <button onclick="checkout('${p.priceId}')">Buy Now</button>
    </div>
  `).join("");
}

async function checkout(priceId) {
  const res = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId })
  });
  const data = await res.json();
  if (data.url) window.location = data.url;
}

loadShop();

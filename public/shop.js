async function loadProducts() {
  const res = await fetch("/api/products");
  const products = await res.json();
  const container = document.getElementById("products");

  products.forEach(p => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${p.image || 'https://utilix.support/assets/placeholder.png'}" alt="${p.name}">
      <h3>${p.name}</h3>
      <p>${p.description || 'No description'}</p>
      <div class="price">$${p.price.toFixed(2)}</div>
      <button class="discord-btn" data-price-id="${p.priceId}">Buy Now</button>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Loading...";
      const priceId = btn.dataset.priceId;
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId })
      });
      const { url } = await res.json();
      window.location = url;
    });
  });
}
loadProducts();

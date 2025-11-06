import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/products", async (req, res) => {
  try {
    const products = await stripe.products.list({ limit: 50 });
    const prices = await stripe.prices.list({ limit: 50 });

    const list = products.data.map(p => ({
      name: p.name,
      desc: p.description,
      img: p.images[0],
      price: prices.data.find(x => x.product === p.id)?.unit_amount / 100,
      priceId: prices.data.find(x => x.product === p.id)?.id,
    }));

    res.json(list);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: req.body.priceId, quantity: 1 }],
      success_url: "https://utilix.support/shop/success",
      cancel_url: "https://utilix.support/shop/cancel",
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Default route → testshop.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "testshop.html"));
});

// Handle 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(4242, () => console.log("🛍️ Utilix Test Shop running at http://localhost:4242"));

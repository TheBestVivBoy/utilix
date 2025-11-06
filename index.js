import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Get all products + prices
app.get("/api/products", async (req, res) => {
  try {
    const products = await stripe.products.list({ limit: 100, expand: ["data.default_price"] });
    const list = products.data.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      image: p.images[0] || "",
      price: p.default_price.unit_amount / 100,
      currency: p.default_price.currency,
      priceId: p.default_price.id
    }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Create checkout session
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { priceId } = req.body;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/cancel.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

const PORT = 4242;
app.listen(PORT, () => console.log(`Shop running → http://localhost:${PORT}`));

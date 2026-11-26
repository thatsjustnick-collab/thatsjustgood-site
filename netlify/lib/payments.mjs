// Stripe: deposits (Checkout), balance invoices, and community "chip in" payments.
// Without a Stripe key (local development), payments are simulated so every flow can be tested.
import { SITE } from "./util.mjs";

let stripeClient;
async function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    const { default: Stripe } = await import("stripe");
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export const paymentsLive = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** One-time payment page. kind: "deposit" | "chip_in". Returns { id, url }. */
export async function createCheckout({ kind, amountCents, name, description, email, metadata, successPath, cancelPath }) {
  const s = await stripe();
  if (!s) {
    const id = "cs_dev_" + Math.random().toString(36).slice(2, 10);
    const q = new URLSearchParams({ session: id, kind, ...metadata, amount: String(amountCents), next: successPath });
    return { id, url: `${SITE()}/api/dev/checkout-complete?${q}` };
  }
  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name, description } } }],
    metadata: { kind, ...metadata },
    payment_intent_data: { metadata: { kind, ...metadata }, description: name },
    success_url: `${SITE()}${successPath}${successPath.includes("?") ? "&" : "?"}paid=1`,
    cancel_url: `${SITE()}${cancelPath}`,
  });
  return { id: session.id, url: session.url };
}

/** Email the client an invoice for the remaining balance, due on dueDate (YYYY-MM-DD). Returns { id, url, customerId }. */
export async function sendBalanceInvoice({ booking, amountCents, dueDate }) {
  const s = await stripe();
  if (!s) return { id: "in_dev_" + booking.ref, url: `${SITE()}/booking?ref=${booking.ref}&dev_invoice=1`, customerId: "cus_dev" };
  let customerId = booking.stripe_customer_id;
  if (!customerId) {
    const c = await s.customers.create({ email: booking.email, name: booking.org_name, metadata: { booking_ref: booking.ref, contact: booking.contact_name } });
    customerId = c.id;
  }
  const due = Math.max(Math.floor(new Date(dueDate + "T17:00:00Z").getTime() / 1000), Math.floor(Date.now() / 1000) + 86400);
  const inv = await s.invoices.create({
    customer: customerId, collection_method: "send_invoice", due_date: due, auto_advance: false,
    description: `That's Just Good team building event (${booking.ref}). Balance after deposit.`,
    metadata: { kind: "balance", booking_id: booking.id, booking_ref: booking.ref },
  });
  await s.invoiceItems.create({ customer: customerId, invoice: inv.id, amount: amountCents, currency: "usd", description: `Team building event balance, ${booking.org_name}` });
  const finalized = await s.invoices.finalizeInvoice(inv.id);
  await s.invoices.sendInvoice(inv.id);
  return { id: inv.id, url: finalized.hosted_invoice_url, customerId };
}

/** Verify and parse an incoming Stripe webhook. Returns the event or throws. */
export async function readWebhook(req) {
  const s = await stripe();
  const raw = await req.text();
  if (!s || !process.env.STRIPE_WEBHOOK_SECRET) throw Object.assign(new Error("Stripe webhook not configured"), { status: 400 });
  return s.webhooks.constructEvent(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
}

export async function refundCheckout(sessionId) {
  const s = await stripe();
  if (!s || !sessionId || sessionId.startsWith("cs_dev_")) return { dev: true };
  const session = await s.checkout.sessions.retrieve(sessionId);
  if (!session.payment_intent) return { skipped: true };
  return s.refunds.create({ payment_intent: session.payment_intent });
}

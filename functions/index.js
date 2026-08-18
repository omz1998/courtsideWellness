// Courtside Wellness — Stripe webhook
//
// Stripe calls this URL directly the moment a payment succeeds. It verifies
// the request really came from Stripe (using the signing secret), then uses
// the Firebase Admin SDK to mark the matching booking or class package as
// "confirmed" — bypassing the client Firestore rules entirely, since this
// runs on the server, not in the customer's browser.
//
// This replaces having to manually click "Mark Paid" in admin.html for every
// purchase. That button still exists and still works — useful as a fallback
// for cash/bank-transfer payments, or if a webhook event is ever missed.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

// Set with: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
// (see README.md for the full setup steps)
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

exports.stripeWebhook = onRequest(
  { secrets: [stripeWebhookSecret], region: "australia-southeast1" },
  async (req, res) => {
    // No real Stripe API key is needed here — constructEvent only checks the
    // request signature against the webhook secret, it never calls Stripe's API.
    const stripe = new Stripe("sk_not_used_signature_check_only");

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        stripeWebhookSecret.value()
      );
    } catch (err) {
      logger.warn("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      const isCheckoutEvent =
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded";

      if (isCheckoutEvent) {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          await confirmFromReference(session.client_reference_id);
        } else {
          logger.info(`Session ${session.id} not yet paid (status: ${session.payment_status}) — skipping.`);
        }
      }
      res.status(200).send("ok");
    } catch (err) {
      logger.error("Error handling webhook event:", err);
      // Respond 200 anyway — a Stripe retry won't fix a bug on our end, and
      // the error is already logged in Functions logs for us to investigate.
      res.status(200).send("logged error");
    }
  }
);

async function confirmFromReference(ref) {
  if (!ref) {
    logger.warn("Checkout session had no client_reference_id — nothing to confirm.");
    return;
  }
  const [type, id] = ref.split(":");
  if (type === "booking" && id) {
    await db.collection("bookings").doc(id).update({ status: "confirmed" });
    logger.info(`Confirmed booking ${id}`);
  } else if (type === "package" && id) {
    await db.collection("packages").doc(id).update({ status: "confirmed" });
    logger.info(`Confirmed package ${id}`);
  } else {
    logger.warn(`Unrecognised client_reference_id: "${ref}"`);
  }
}

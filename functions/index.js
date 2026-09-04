// Courtside Wellness — Stripe webhook
//
// Stripe calls this URL directly the moment a payment succeeds (or a
// membership subscription changes state). It verifies the request really
// came from Stripe (using the signing secret), then uses the Firebase Admin
// SDK to update the matching booking, class package, or membership in
// Firestore — bypassing client Firestore rules entirely, since this runs on
// the server, not in the customer's browser.
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

// Same free Web3Forms access key already used by js/message.js for the
// "Message Us" popup — Web3Forms keys aren't sensitive (they're designed to
// be embedded in public HTML forms), so this can just be pasted in directly.
// Get one at https://web3forms.com if you haven't already (see README).
const WEB3FORMS_ACCESS_KEY = "PASTE_WEB3FORMS_ACCESS_KEY";

// Emails admin@courtsidewellness.com.au for new memberships and package
// purchases. Failures here are only logged, never thrown — a notification
// email going missing shouldn't stop the actual booking/package/membership
// from being confirmed.
async function notifyAdmin(subject, message) {
  if (WEB3FORMS_ACCESS_KEY === "PASTE_WEB3FORMS_ACCESS_KEY") {
    logger.warn("Skipping admin notification email — WEB3FORMS_ACCESS_KEY not set in functions/index.js yet.");
    return;
  }
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject,
        from_name: "Courtside Wellness Website",
        email: "admin@courtsidewellness.com.au",
        message
      })
    });
    const data = await res.json();
    if (!data.success) {
      logger.error("Web3Forms admin notification failed:", data.message || data);
    }
  } catch (err) {
    logger.error("Error sending admin notification email:", err);
  }
}

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
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;
          if (session.payment_status !== "paid") {
            logger.info(`Session ${session.id} not yet paid (status: ${session.payment_status}) — skipping.`);
            break;
          }
          const buyerName = session.customer_details?.name || "-";
          const buyerEmail = session.customer_details?.email || "-";

          if (session.mode === "subscription") {
            await activateMembership(session.client_reference_id, session.subscription, session.customer);
            await notifyAdmin(
              "New member joined Courtside Wellness",
              `A new membership just started.\n\nName: ${buyerName}\nEmail: ${buyerEmail}`
            );
          } else {
            const ref = session.client_reference_id || "";
            await confirmFromReference(ref);
            if (ref.startsWith("package_")) {
              const amount = session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)}` : "-";
              await notifyAdmin(
                "New class package purchased",
                `A class package was just purchased.\n\nName: ${buyerName}\nEmail: ${buyerEmail}\nAmount: ${amount}`
              );
            }
          }
          break;
        }

        // Membership renewals/failures/cancellations reference the Stripe
        // customer/subscription directly (no client_reference_id involved),
        // so these look the user up by the stripeCustomerId we saved at signup.
        case "invoice.paid": {
          const invoice = event.data.object;
          // invoice.subscription was removed in newer Stripe API versions —
          // this is the replacement way to tell it's a subscription invoice.
          if (invoice.parent?.type === "subscription_details") {
            await renewMembership(invoice.customer);
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          if (invoice.parent?.type === "subscription_details") {
            await markMembershipPastDue(invoice.customer);
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          await cancelMembership(sub.customer);
          break;
        }

        default:
          // We only ask Stripe to send the event types handled above, but
          // ignore anything else just in case.
          break;
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

// Confirms a one-off booking or class package payment (checkout mode: "payment").
async function confirmFromReference(ref) {
  if (!ref) {
    logger.warn("Checkout session had no client_reference_id — nothing to confirm.");
    return;
  }
  // Uses "_" rather than ":" as the separator — Stripe only allows
  // letters/numbers/dashes/underscores in client_reference_id and silently
  // drops anything else, which is why this used to arrive as null.
  if (ref.startsWith("booking_")) {
    const id = ref.slice("booking_".length);
    await db.collection("bookings").doc(id).update({ status: "confirmed" });
    logger.info(`Confirmed booking ${id}`);
  } else if (ref.startsWith("package_")) {
    const id = ref.slice("package_".length);
    await db.collection("packages").doc(id).update({ status: "confirmed" });
    logger.info(`Confirmed package ${id}`);
  } else {
    logger.warn(`Unrecognised client_reference_id: "${ref}"`);
  }
}

// One week in milliseconds — memberships renew weekly, so this is used both
// as the initial estimate on signup and refreshed on every successful
// renewal payment. Using our own fixed cadence instead of trying to read an
// exact period end back from Stripe sidesteps a moving target: Stripe has
// restructured where that date lives on the invoice object more than once.
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// First successful payment on a brand new membership subscription (checkout
// mode: "subscription").
async function activateMembership(ref, subscriptionId, customerId) {
  if (!ref || !ref.startsWith("member_")) {
    logger.warn(`Membership checkout had no/unrecognised client_reference_id: "${ref}"`);
    return;
  }
  const uid = ref.slice("member_".length);
  await db.collection("users").doc(uid).set({
    membership: {
      status: "active",
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      currentPeriodEnd: admin.firestore.Timestamp.fromMillis(Date.now() + ONE_WEEK_MS),
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }, { merge: true });
  logger.info(`Activated membership for user ${uid}`);
}

// Finds the users/{uid} doc for a given Stripe customer ID — used for
// subscription lifecycle events, which reference the customer/subscription
// directly rather than carrying a client_reference_id.
async function findUserByStripeCustomer(customerId) {
  const snap = await db.collection("users")
    .where("membership.stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) {
    logger.warn(`No user found for Stripe customer ${customerId}`);
    return null;
  }
  return snap.docs[0].ref;
}

// A weekly renewal payment succeeded — keep the membership active and push
// out the estimated next renewal date.
async function renewMembership(customerId) {
  const userRef = await findUserByStripeCustomer(customerId);
  if (!userRef) return;
  await userRef.update({
    "membership.status": "active",
    "membership.currentPeriodEnd": admin.firestore.Timestamp.fromMillis(Date.now() + ONE_WEEK_MS)
  });
  logger.info(`Renewed membership for Stripe customer ${customerId}`);
}

// A renewal payment failed — flag it so the member/admin can follow up.
// Stripe will retry automatically per its own retry schedule before giving up.
async function markMembershipPastDue(customerId) {
  const userRef = await findUserByStripeCustomer(customerId);
  if (!userRef) return;
  await userRef.update({ "membership.status": "past_due" });
  logger.info(`Marked membership past_due for Stripe customer ${customerId}`);
}

// The subscription was cancelled — membership benefits stop applying.
async function cancelMembership(customerId) {
  const userRef = await findUserByStripeCustomer(customerId);
  if (!userRef) return;
  await userRef.update({ "membership.status": "cancelled" });
  logger.info(`Cancelled membership for Stripe customer ${customerId}`);
}

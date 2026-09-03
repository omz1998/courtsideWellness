// Courtside Wellness — membership signup (membership.html)
// Requires firebase-config.js + auth.js loaded first.
// $40/week recurring membership via a Stripe subscription Payment Link.
// Unlike bookings/packages, joining doesn't create a Firestore doc up front —
// there's nothing to hold "pending". The Cloud Function webhook
// (functions/index.js) creates the membership record once Stripe confirms
// the first payment.

// Paste your Stripe Payment Link for the $40/week recurring membership here.
// Create it in Stripe as: Payment Links -> + New -> switch to "Recurring" ->
// Weekly -> $40 AUD -> name it "Courtside Wellness Membership".
const MEMBERSHIP_STRIPE_LINK = "https://buy.stripe.com/test_4gMcN44g5gh83YL5Tb5gc04";

let membershipUser = null;

function fmtMembershipDate(ts) {
  if (!ts) return "soon";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

async function loadMembershipStatus(uid) {
  const box = document.getElementById("membership-status");
  const joinBtn = document.getElementById("join-membership-btn");
  if (!box) return;

  try {
    const profile = await getUserProfile(uid);
    const m = profile && profile.membership;

    if (m && m.status === "active") {
      box.innerHTML = `<div class="notice">You're an active member. Enjoy unlimited classes and full Padel Spot Minto access. Next renewal: ${fmtMembershipDate(m.currentPeriodEnd)}.</div>`;
      if (joinBtn) joinBtn.classList.add("booking-hidden");
    } else if (m && m.status === "past_due") {
      box.innerHTML = `<div class="notice">Your last membership payment didn't go through. Please check your card details with Stripe, or <a href="contact.html" style="text-decoration: underline;">contact us</a> for help.</div>`;
    } else if (m && m.status === "cancelled") {
      box.innerHTML = `<div class="notice">Your membership has ended. You're welcome to rejoin any time below.</div>`;
    }
  } catch (err) {
    console.warn("Couldn't load membership status:", err);
  }
}

async function joinMembership() {
  const errorEl = document.getElementById("membership-error");
  errorEl.classList.add("booking-hidden");

  if (!membershipUser) {
    // Most people clicking Join Now won't have an account yet, so default to
    // sign up rather than login (existing members can still cross over to
    // login from the sign-up page).
    location.href = "signup.html?redirect=" + encodeURIComponent("membership.html");
    return;
  }

  if (MEMBERSHIP_STRIPE_LINK.startsWith("PASTE_")) {
    errorEl.textContent = "Membership isn't set up for payment yet. See the Stripe setup note in js/membership.js.";
    errorEl.classList.remove("booking-hidden");
    return;
  }

  const btn = document.getElementById("join-membership-btn");
  btn.disabled = true;
  btn.textContent = "Setting up…";

  try {
    const profile = await getUserProfile(membershipUser.uid);
    const email = (profile && profile.email) || membershipUser.email || "";

    const url = new URL(MEMBERSHIP_STRIPE_LINK);
    // "_" not ":" — Stripe only allows letters/numbers/dashes/underscores in
    // client_reference_id and silently drops anything else.
    url.searchParams.set("client_reference_id", "member_" + membershipUser.uid);
    url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  } catch (err) {
    errorEl.textContent = (err.message || "Something went wrong.").replace("Firebase: ", "")
      + " If this keeps happening, contact us directly.";
    errorEl.classList.remove("booking-hidden");
    btn.disabled = false;
    btn.textContent = "Join Now ($40/week)";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("membership-wrap")) return; // not on membership page

  onAuthReady((user) => {
    membershipUser = user || null;
    if (user) loadMembershipStatus(user.uid);
  });

  const joinBtn = document.getElementById("join-membership-btn");
  if (joinBtn) joinBtn.addEventListener("click", joinMembership);
});

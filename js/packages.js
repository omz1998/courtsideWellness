// Courtside Wellness — class packages (packages.html)
// Requires firebase-config.js + auth.js loaded first.
// Buying a pack requires an account, since credits are tied to your profile
// and get spent from the booking flow while logged in.

// Credits are generic — usable on any class type, regardless of which pack
// they came from. Both packs are the same 20% discount, priced off the
// standard $20 class rate.
const CLASS_PACKS = {
  pack5: {
    label: "5-Class Pack",
    credits: 5,
    price: 80,
    regularPrice: 100,
    // Paste your Stripe Payment Link for the $80 5-Class Pack here.
    stripeLink: "https://buy.stripe.com/test_3cI5kC13Tfd452P6Xf5gc02"
  },
  pack10: {
    label: "10-Class Pack",
    credits: 10,
    price: 160,
    regularPrice: 200,
    // Paste your Stripe Payment Link for the $160 10-Class Pack here.
    stripeLink: "https://buy.stripe.com/test_14AaEW9Ap2qifHt4P75gc03"
  }
};

let packagesUser = null;

async function loadMyCredits(uid) {
  const box = document.getElementById("my-credits");
  if (!box) return;
  try {
    const snap = await authDb.collection("packages")
      .where("uid", "==", uid)
      .where("status", "==", "confirmed")
      .get();
    let total = 0;
    snap.forEach((doc) => { total += doc.data().creditsRemaining || 0; });

    box.innerHTML = total > 0
      ? `<div class="notice">You have <strong>${total} class credit${total === 1 ? "" : "s"}</strong> ready to use — pick "Use a class credit" at checkout when you book.</div>`
      : "";
  } catch (err) {
    console.warn("Couldn't load class credits:", err);
  }
}

async function buyPackage(packKey) {
  const cfg = CLASS_PACKS[packKey];
  const errorEl = document.getElementById("packages-error");
  errorEl.classList.add("booking-hidden");

  if (!packagesUser) {
    location.href = "login.html?redirect=" + encodeURIComponent("packages.html");
    return;
  }

  if (cfg.stripeLink.startsWith("PASTE_")) {
    errorEl.textContent = "Packages aren't set up for payment yet — see the Stripe setup note in js/packages.js.";
    errorEl.classList.remove("booking-hidden");
    return;
  }

  const btn = document.getElementById(`buy-${packKey}`);
  btn.disabled = true;
  btn.textContent = "Setting up…";

  try {
    const profile = await getUserProfile(packagesUser.uid);
    const name = (profile && profile.name) || packagesUser.displayName || "";
    const email = (profile && profile.email) || packagesUser.email || "";
    const phone = (profile && profile.phone) || "";

    const pkgRef = await authDb.collection("packages").add({
      uid: packagesUser.uid,
      name, email, phone,
      packKey,
      label: cfg.label,
      credits: cfg.credits,
      creditsRemaining: cfg.credits,
      price: cfg.price,
      status: "pending_payment",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const url = new URL(cfg.stripeLink);
    // Prefixed so the Stripe webhook (functions/index.js) knows which
    // Firestore collection to auto-confirm this payment against.
    url.searchParams.set("client_reference_id", "package:" + pkgRef.id);
    url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  } catch (err) {
    console.error(err);
    // Surface the real Firebase error (e.g. "Missing or insufficient
    // permissions" if the packages Firestore rules aren't published yet)
    // instead of hiding it behind a generic message — makes this fixable
    // instead of a dead end.
    errorEl.textContent = (err.message || "Something went wrong setting up your purchase.").replace("Firebase: ", "")
      + " If this keeps happening, contact us directly.";
    errorEl.classList.remove("booking-hidden");
    btn.disabled = false;
    btn.textContent = "Buy Now";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("packages-wrap")) return; // not on the packages page

  onAuthReady((user) => {
    packagesUser = user || null;
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent("packages.html");
      return;
    }
    loadMyCredits(user.uid);
  });

  document.getElementById("buy-pack5").addEventListener("click", () => buyPackage("pack5"));
  document.getElementById("buy-pack10").addEventListener("click", () => buyPackage("pack10"));
});

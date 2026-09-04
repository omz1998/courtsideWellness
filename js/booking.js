// Courtside Wellness — booking flow
// Requires firebase-config.js + auth.js loaded first (auth.js handles Firebase init).
// Booking does NOT require login — guests can book directly. If someone is
// logged in, their details are prefilled and the booking is linked to their
// account so it shows up in "My Account". Guests won't see their booking
// there since there's no account to attach it to.

// Each class type has its own fixed session time(s), Mon-Fri. "times" uses
// 24hr "HH:MM" — these are the only times that will ever show as bookable
// for that class.
// Kids Fitness isn't in here — it launches as a school-holiday pilot rather
// than a regular Mon-Fri class, so it isn't part of the normal date-driven
// booking flow yet. See booking.html for its "register interest" note. Once
// real school-holiday dates are confirmed, it can be added back in here.
const CLASS_TYPES = {
  pilates: {
    label: "Mat Pilates",
    price: 20,
    capacity: 30,
    times: ["10:00"],
    // Live Stripe Payment Link: "Standard Class - Courtside Wellness" ($20).
    stripeLink: "https://buy.stripe.com/9B6aEZcoVcc6bvK7673ZK06"
  },
  mumsbubs: {
    label: "Mums and Bubs",
    price: 20,
    capacity: 30,
    times: ["11:00"],
    // Reuses the $20 Standard Class Stripe link (same price point).
    stripeLink: "https://buy.stripe.com/9B6aEZcoVcc6bvK7673ZK06"
  },
  strength: {
    label: "Women's Fitness & Strength",
    price: 20,
    capacity: 30,
    times: ["12:30"],
    // Reuses the $20 Standard Class Stripe link (same price point).
    stripeLink: "https://buy.stripe.com/9B6aEZcoVcc6bvK7673ZK06"
  },
  gymfitness: {
    label: "Women's Gym Fitness Classes",
    price: 20,
    capacity: 30,
    // Placeholder time slot — change this if a different time suits better.
    times: ["17:30"],
    // Reuses the $20 Standard Class Stripe link (same price point).
    stripeLink: "https://buy.stripe.com/9B6aEZcoVcc6bvK7673ZK06"
  }
};

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

let selectedClassType = null; // "pilates" | "mumsbubs" | "strength" | "gymfitness"
let selectedDate = null;      // "YYYY-MM-DD"
let selectedTime = null;      // "HH:MM" (24hr)
let sessionsCache = {};       // sessionKey -> { booked, capacity, min }
let bookingUser = null;       // Firebase user if logged in, else null
let availableCredits = 0;     // total class credits across the user's confirmed packages
let creditPackageId = null;   // the (oldest) package doc to redeem a credit from first
let hasActiveMembership = false; // true if the logged-in user has an active $40/week membership

// Membership covers unlimited bookings on all four women's classes. Kids
// Fitness isn't part of this list since it's a separate school-holiday
// pilot, not a regular bookable class yet.
const MEMBERSHIP_CLASS_TYPES = ["pilates", "mumsbubs", "strength", "gymfitness"];

// Class credits (from a 5- or 10-Class Pack) are generic — usable on any
// class type, regardless of which pack they came from.
async function loadAvailableCredits(uid) {
  availableCredits = 0;
  creditPackageId = null;
  if (!authReady || !uid) return;
  try {
    const snap = await authDb.collection("packages")
      .where("uid", "==", uid)
      .where("status", "==", "confirmed")
      .get();
    const packages = [];
    snap.forEach((doc) => packages.push({ id: doc.id, ...doc.data() }));
    packages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    for (const p of packages) {
      availableCredits += p.creditsRemaining || 0;
      if (!creditPackageId && (p.creditsRemaining || 0) > 0) creditPackageId = p.id;
    }
  } catch (err) {
    console.warn("Couldn't load class credits:", err);
  }
}

function sessionKey(classType, date, time) {
  return `${classType}_${date}_${time}`;
}

// Classes don't start until launch day — no bookable date will ever be
// offered before this, even once "tomorrow" catches up to it. Once launch
// day has passed, this has no effect and dates just start from tomorrow.
const FIRST_BOOKABLE_DATE = "2026-10-05";

function nextWeekdays(count) {
  const dates = [];
  let d = new Date();
  d.setDate(d.getDate() + 1); // start tomorrow
  const launch = new Date(FIRST_BOOKABLE_DATE + "T00:00:00");
  if (d < launch) d = launch;
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchSpots(classType, dateStr, time) {
  const cfg = CLASS_TYPES[classType];
  if (!authReady) return { booked: 0, capacity: cfg.capacity };
  const doc = await authDb.collection("sessions").doc(sessionKey(classType, dateStr, time)).get();
  if (doc.exists) return doc.data();
  return { booked: 0, capacity: cfg.capacity };
}

function selectClassType(type) {
  selectedClassType = type;
  document.querySelectorAll(".class-type-option").forEach((el) => {
    el.classList.toggle("selected", el.dataset.type === type);
  });
  document.getElementById("to-step-2").disabled = false;
}

function renderDateGrid() {
  const grid = document.getElementById("date-grid");
  if (!grid || !selectedClassType) return;

  const dates = nextWeekdays(10);
  const cfg = CLASS_TYPES[selectedClassType];
  document.getElementById("date-grid-label").textContent = `${cfg.label}: choose a date`;

  grid.innerHTML = dates.map((d) => {
    const key = dateKey(d);
    const dow = d.toLocaleDateString("en-AU", { weekday: "short" });
    const dnum = d.getDate();
    const month = d.toLocaleDateString("en-AU", { month: "short" });
    return `
      <div class="date-option" data-date="${key}">
        <div class="dow">${dow}</div>
        <div class="dnum">${dnum} ${month}</div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".date-option").forEach((el) => {
    el.addEventListener("click", () => {
      grid.querySelectorAll(".date-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedDate = el.dataset.date;
      selectedTime = null;
      document.getElementById("to-step-3").disabled = true;
      document.getElementById("capacity-status").classList.add("booking-hidden");
      renderTimeGrid();
    });
  });
}

async function renderTimeGrid() {
  const wrap = document.getElementById("time-grid-wrap");
  const grid = document.getElementById("time-grid");
  if (!wrap || !grid || !selectedDate || !selectedClassType) return;

  wrap.classList.remove("booking-hidden");
  grid.innerHTML = "<p>Loading times…</p>";

  const cfg = CLASS_TYPES[selectedClassType];
  const cards = [];

  for (const time of cfg.times) {
    const info = await fetchSpots(selectedClassType, selectedDate, time);
    sessionsCache[sessionKey(selectedClassType, selectedDate, time)] = info;

    const remaining = info.capacity - info.booked;
    let spotsLabel = `${remaining} spots left`;
    let spotsClass = "";
    if (remaining <= 0) { spotsLabel = "Full"; spotsClass = "full"; }
    else if (remaining <= 6) { spotsClass = "low"; }

    cards.push(`
      <div class="date-option" data-time="${time}" ${remaining <= 0 ? 'data-full="true"' : ""}>
        <div class="dnum">${formatTime(time)}</div>
        <div class="spots ${spotsClass}">${spotsLabel}</div>
      </div>
    `);
  }

  grid.innerHTML = cards.join("");

  grid.querySelectorAll(".date-option").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.full) return;
      grid.querySelectorAll(".date-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedTime = el.dataset.time;
      updateCapacityStatus();
      document.getElementById("to-step-3").disabled = false;
    });
  });

  // Only one time for this class (e.g. Mat Pilates) — auto-select it so
  // people aren't forced to click a single, obvious option.
  if (cfg.times.length === 1) {
    const only = grid.querySelector(".date-option");
    if (only && !only.dataset.full) only.click();
  }
}

function updateCapacityStatus() {
  const box = document.getElementById("capacity-status");
  if (!box || !selectedDate || !selectedTime || !selectedClassType) return;
  box.classList.remove("booking-hidden", "needs-more", "confirmed");
  box.classList.add("info");
  const info = sessionsCache[sessionKey(selectedClassType, selectedDate, selectedTime)];
  const remaining = Math.max(info.capacity - info.booked, 0);
  box.textContent = remaining <= 0
    ? "This session is full."
    : `${remaining} spot${remaining === 1 ? "" : "s"} left in this class.`;
}

function goToStep(step) {
  document.querySelectorAll(".booking-step").forEach((el) => el.classList.add("booking-hidden"));
  document.getElementById(`step-${step}`).classList.remove("booking-hidden");
  document.querySelectorAll(".booking-steps .step").forEach((el, i) => {
    el.classList.toggle("active", i === step - 1);
  });
  if (step === 2) renderDateGrid();
}

async function submitBooking(e) {
  e.preventDefault();
  const name = document.getElementById("b-name").value.trim();
  const email = document.getElementById("b-email").value.trim();
  const phone = document.getElementById("b-phone").value.trim();
  const errorEl = document.getElementById("form-error");

  if (!name || !email || !phone || !selectedDate || !selectedTime || !selectedClassType) {
    errorEl.textContent = "Please fill in all fields.";
    errorEl.classList.remove("booking-hidden");
    return;
  }
  if (!isValidAuPhone(phone)) {
    errorEl.textContent = "Please enter a valid Australian phone number, e.g. 0412 345 678.";
    errorEl.classList.remove("booking-hidden");
    return;
  }
  errorEl.classList.add("booking-hidden");

  const submitBtn = document.getElementById("submit-booking");
  submitBtn.disabled = true;
  submitBtn.textContent = "Processing…";

  const cfg = CLASS_TYPES[selectedClassType];
  let bookingId = "local-" + Date.now();

  try {
    if (authReady) {
      const bookingRef = await authDb.collection("bookings").add({
        uid: bookingUser ? bookingUser.uid : null,
        name, email, phone,
        classType: selectedClassType,
        classLabel: cfg.label,
        date: selectedDate,
        time: selectedTime,
        price: cfg.price,
        status: "pending_payment",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      bookingId = bookingRef.id;

      const sRef = authDb.collection("sessions").doc(sessionKey(selectedClassType, selectedDate, selectedTime));
      await authDb.runTransaction(async (tx) => {
        const doc = await tx.get(sRef);
        const current = doc.exists ? doc.data() : { booked: 0, capacity: cfg.capacity };
        tx.set(sRef, {
          booked: (current.booked || 0) + 1,
          capacity: current.capacity || cfg.capacity
        });
      });
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Something went wrong saving your booking. Please try again or contact us directly.";
    errorEl.classList.remove("booking-hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Continue to Payment";
    return;
  }

  document.getElementById("summary-class").textContent = cfg.label;
  document.getElementById("summary-name").textContent = name;
  document.getElementById("summary-date").textContent =
    new Date(selectedDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) + ` at ${formatTime(selectedTime)}`;
  document.getElementById("summary-price").textContent = `$${cfg.price}`;

  goToStep(4);

  const membershipRow = document.getElementById("use-membership-row");
  const membershipBtn = document.getElementById("use-membership-btn");
  const creditRow = document.getElementById("use-credit-row");
  const creditBtn = document.getElementById("use-credit-btn");
  const payBtn = document.getElementById("go-to-payment");
  const paymentNote = document.getElementById("payment-note");

  const membershipEligible = hasActiveMembership && MEMBERSHIP_CLASS_TYPES.includes(selectedClassType);

  if (membershipEligible) {
    // Free with membership — this is the only option, no need to also show
    // credits or a Pay Now button.
    membershipRow.classList.remove("booking-hidden");
    membershipBtn.disabled = false;
    membershipBtn.textContent = "Book Free (Membership)";
    membershipBtn.onclick = () => redeemMembership(bookingId);
    creditRow.classList.add("booking-hidden");
    payBtn.classList.add("booking-hidden");
    paymentNote.classList.add("booking-hidden");
    return;
  }

  membershipRow.classList.add("booking-hidden");
  payBtn.classList.remove("booking-hidden");
  paymentNote.classList.remove("booking-hidden");

  // Members never see the credit option, even on Kids Fitness (which
  // membership doesn't cover) — membership already replaces the need for
  // packages/credits entirely.
  if (availableCredits > 0 && creditPackageId && !hasActiveMembership) {
    creditRow.classList.remove("booking-hidden");
    creditBtn.textContent = `Use 1 Class Credit (${availableCredits} available)`;
    creditBtn.disabled = false;
    creditBtn.onclick = () => redeemCredit(bookingId, sessionKey(selectedClassType, selectedDate, selectedTime));
  } else {
    creditRow.classList.add("booking-hidden");
  }

  payBtn.disabled = false;
  payBtn.textContent = "Pay Now →";
  payBtn.onclick = () => {
    if (cfg.stripeLink.startsWith("PASTE_")) {
      alert("Stripe isn't connected yet for this class. This button will redirect to Stripe Checkout once the payment link is added in js/booking.js.");
      return;
    }
    const url = new URL(cfg.stripeLink);
    // Prefixed so the Stripe webhook (functions/index.js) knows which
    // Firestore collection to auto-confirm this payment against. Stripe only
    // allows letters/numbers/dashes/underscores in client_reference_id and
    // silently drops anything else (e.g. a colon), so this uses "_" as the
    // separator rather than ":".
    url.searchParams.set("client_reference_id", "booking_" + bookingId);
    url.searchParams.set("prefilled_email", email);
    window.location.href = url.toString();
  };
}

// Confirms the booking immediately using one of the member's pre-paid class
// credits instead of sending them to Stripe — decrements the credit and the
// booking status together in one transaction so they can't drift apart.
async function redeemCredit(bookingId, sKey) {
  const creditBtn = document.getElementById("use-credit-btn");
  const payBtn = document.getElementById("go-to-payment");
  const errorEl = document.getElementById("payment-error");
  errorEl.classList.add("booking-hidden");
  creditBtn.disabled = true;
  creditBtn.textContent = "Confirming…";

  const packageRef = authDb.collection("packages").doc(creditPackageId);
  const bookingRef = authDb.collection("bookings").doc(bookingId);

  try {
    await authDb.runTransaction(async (tx) => {
      const pkgDoc = await tx.get(packageRef);
      if (!pkgDoc.exists || (pkgDoc.data().creditsRemaining || 0) <= 0) {
        throw new Error("That credit isn't available anymore. Please pay for this class instead.");
      }
      tx.update(packageRef, { creditsRemaining: pkgDoc.data().creditsRemaining - 1 });
      tx.update(bookingRef, { status: "confirmed", paidWithCredit: true, packageId: creditPackageId });
    });

    document.getElementById("use-credit-row").classList.add("booking-hidden");
    payBtn.classList.add("booking-hidden");
    document.getElementById("payment-note").classList.add("booking-hidden");
    const successEl = document.getElementById("payment-success");
    successEl.textContent = "Booking confirmed using a class credit, see you there!";
    successEl.classList.remove("booking-hidden");
  } catch (err) {
    errorEl.textContent = err.message.replace("Firebase: ", "");
    errorEl.classList.remove("booking-hidden");
    creditBtn.disabled = false;
    creditBtn.textContent = "Use 1 Class Credit";
  }
}

// Confirms the booking immediately using the member's active membership —
// no Stripe redirect, no credits to track, since membership covers
// unlimited bookings on eligible class types.
async function redeemMembership(bookingId) {
  const membershipBtn = document.getElementById("use-membership-btn");
  const payBtn = document.getElementById("go-to-payment");
  const errorEl = document.getElementById("payment-error");
  errorEl.classList.add("booking-hidden");
  membershipBtn.disabled = true;
  membershipBtn.textContent = "Confirming…";

  try {
    await authDb.collection("bookings").doc(bookingId).update({
      status: "confirmed",
      paidWithMembership: true
    });

    document.getElementById("use-membership-row").classList.add("booking-hidden");
    document.getElementById("use-credit-row").classList.add("booking-hidden");
    payBtn.classList.add("booking-hidden");
    document.getElementById("payment-note").classList.add("booking-hidden");
    const successEl = document.getElementById("payment-success");
    successEl.textContent = "Booking confirmed with your membership, see you there!";
    successEl.classList.remove("booking-hidden");
  } catch (err) {
    errorEl.textContent = err.message.replace("Firebase: ", "");
    errorEl.classList.remove("booking-hidden");
    membershipBtn.disabled = false;
    membershipBtn.textContent = "Book Free (Membership)";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("date-grid")) return; // not on booking page

  // BOOKINGS_OPEN is set in js/script.js. While false, show a holding
  // message instead of the booking form, so visiting this page directly
  // (not just clicking a disabled nav button) doesn't skip the gate.
  if (typeof BOOKINGS_OPEN !== "undefined" && !BOOKINGS_OPEN) {
    const card = document.querySelector(".booking-card");
    if (card) {
      card.innerHTML = `
        <div class="notice" style="text-align: center; padding: 40px 20px;">
          <h3 style="margin-bottom: 10px;">Bookings open soon</h3>
          <p>We're putting the finishing touches on our timetable. Bookings open shortly before launch on Monday 5 October 2026. <a href="contact.html" style="text-decoration: underline;">Get in touch</a> to be notified, or check back soon.</p>
        </div>
      `;
    }
    return;
  }

  document.querySelectorAll(".class-type-option").forEach((el) => {
    el.addEventListener("click", () => selectClassType(el.dataset.type));
  });

  onAuthReady(async (user) => {
    bookingUser = user || null;

    if (user) {
      const profile = await getUserProfile(user.uid);
      if (profile) {
        document.getElementById("b-name").value = profile.name || "";
        document.getElementById("b-email").value = profile.email || user.email || "";
        document.getElementById("b-phone").value = profile.phone || "";
      } else {
        document.getElementById("b-email").value = user.email || "";
      }
      document.getElementById("guest-note").classList.add("booking-hidden");
      hasActiveMembership = !!(profile && profile.membership && profile.membership.status === "active");
      await loadAvailableCredits(user.uid);
    }
  });

  document.getElementById("to-step-2").addEventListener("click", () => goToStep(2));
  document.getElementById("back-to-1").addEventListener("click", () => goToStep(1));
  document.getElementById("to-step-3").addEventListener("click", () => goToStep(3));
  document.getElementById("back-to-2").addEventListener("click", () => goToStep(2));
  document.getElementById("booking-form").addEventListener("submit", submitBooking);
});

// Courtside Wellness: free members-only Padel sessions (padel.html)
// Requires firebase-config.js, auth.js and booking.js (for CLASS_TYPES,
// formatTime, dateKey, sessionKey, nextClassDates). Uses its own element ids
// so booking.js's page-specific startup code doesn't run here.
//
// Rules of the session: Tuesdays and Thursdays 10:00am, 90 minutes, max 4
// players. Members only. Bookings are confirmed instantly. The Firestore rules
// already verify membership server-side for the "confirmed" update.

const PADEL = CLASS_TYPES.padel;

let padelUser = null;
let padelProfile = null;
let padelIsMember = false;
let padelSelectedDate = null;
let padelSpots = {}; // dateKey -> { booked, capacity }

function padelEndTime(time) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + PADEL.durationMins;
  return formatTime(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
}

function showPadelState(id) {
  ["padel-login", "padel-nonmember", "padel-booking"].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("booking-hidden", s !== id);
  });
}

async function padelFetchSpots(dateStr, time) {
  const doc = await authDb.collection("sessions").doc(sessionKey("padel", dateStr, time)).get();
  const data = doc.exists ? doc.data() : { booked: 0 };
  return { booked: data.booked || 0, capacity: PADEL.capacity };
}

async function renderPadelDates() {
  const grid = document.getElementById("padel-date-grid");
  grid.innerHTML = "<p>Loading sessions…</p>";
  const time = PADEL.schedule[2][0];
  const dates = nextClassDates("padel", 8);

  if (!dates.length) {
    grid.innerHTML = `<div class="notice">Free padel sessions are on hold for now. <a href="contact.html?topic=interest" style="text-decoration: underline; color: var(--pink-dark); font-weight: 600;">Register your interest</a> and we'll let you know when they're back.</div>`;
    return;
  }

  const infos = await Promise.all(dates.map((d) => padelFetchSpots(dateKey(d), time)));

  grid.innerHTML = dates.map((d, i) => {
    const key = dateKey(d);
    padelSpots[key] = infos[i];
    const left = Math.max(infos[i].capacity - infos[i].booked, 0);
    const label = left <= 0 ? "Full" : `${left} of ${infos[i].capacity} spots left`;
    const cls = left <= 0 ? "full" : (left <= 2 ? "low" : "");
    const dow = d.toLocaleDateString("en-AU", { weekday: "short" });
    const month = d.toLocaleDateString("en-AU", { month: "short" });
    return `
      <div class="date-option" data-date="${key}" ${left <= 0 ? 'data-full="true"' : ""}>
        <div class="dow">${dow}</div>
        <div class="dnum">${d.getDate()} ${month}</div>
        <div class="spots ${cls}">${label}</div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".date-option").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.full) return;
      grid.querySelectorAll(".date-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      padelSelectedDate = el.dataset.date;
      document.getElementById("padel-confirm").disabled = false;
      document.getElementById("padel-error").classList.add("booking-hidden");
    });
  });
}

async function confirmPadelBooking() {
  const btn = document.getElementById("padel-confirm");
  const errorEl = document.getElementById("padel-error");
  const successEl = document.getElementById("padel-success");
  errorEl.classList.add("booking-hidden");
  if (!padelSelectedDate || !padelUser || !padelIsMember) return;

  btn.disabled = true;
  btn.textContent = "Confirming…";
  const time = PADEL.schedule[2][0];
  const sRef = authDb.collection("sessions").doc(sessionKey("padel", padelSelectedDate, time));
  let reserved = false;

  try {
    // One padel booking per member per session.
    const mine = await authDb.collection("bookings").where("uid", "==", padelUser.uid).get();
    const dup = mine.docs.some((d) => {
      const b = d.data();
      return b.classType === "padel" && b.date === padelSelectedDate && b.status !== "cancelled";
    });
    if (dup) throw new Error("You're already booked into this session.");

    // Reserve a spot first, atomically, so two people can't take the last one.
    await authDb.runTransaction(async (tx) => {
      const doc = await tx.get(sRef);
      const booked = doc.exists ? (doc.data().booked || 0) : 0;
      if (booked >= PADEL.capacity) throw new Error("Sorry, that session just filled up. Please pick another date.");
      tx.set(sRef, { booked: booked + 1, capacity: PADEL.capacity });
    });
    reserved = true;

    const name = (padelProfile && padelProfile.name) || padelUser.displayName || "";
    const ref = await authDb.collection("bookings").add({
      uid: padelUser.uid,
      name,
      email: (padelProfile && padelProfile.email) || padelUser.email || "",
      phone: (padelProfile && padelProfile.phone) || "",
      classType: "padel",
      classLabel: PADEL.label,
      date: padelSelectedDate,
      time,
      price: 0,
      status: "pending_payment",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await ref.update({ status: "confirmed", paidWithMembership: true });

    const d = new Date(padelSelectedDate + "T00:00:00");
    successEl.textContent = `You're in! ${d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}, ${formatTime(time)} to ${padelEndTime(time)}. You can view or cancel this in My Account.`;
    successEl.classList.remove("booking-hidden");
    btn.textContent = "Booked";
    padelSelectedDate = null;
    await renderPadelDates();
  } catch (err) {
    console.error(err);
    if (reserved) {
      // Booking failed after we took a spot: hand it back.
      try {
        await authDb.runTransaction(async (tx) => {
          const doc = await tx.get(sRef);
          if (doc.exists) tx.set(sRef, { booked: Math.max(0, (doc.data().booked || 0) - 1), capacity: PADEL.capacity });
        });
      } catch (e) { console.warn("Couldn't release spot:", e); }
    }
    errorEl.textContent = (err.message || "Something went wrong. Please try again or contact us.").replace("Firebase: ", "");
    errorEl.classList.remove("booking-hidden");
    btn.disabled = false;
    btn.textContent = "Confirm Free Padel Booking";
    if (err.message && err.message.includes("filled up")) renderPadelDates();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("padel-date-grid")) return;

  document.getElementById("padel-confirm").addEventListener("click", confirmPadelBooking);

  onAuthReady(async (user) => {
    padelUser = user || null;
    if (!user) { showPadelState("padel-login"); return; }
    padelProfile = await getUserProfile(user.uid);
    padelIsMember = !!(padelProfile && padelProfile.membership && padelProfile.membership.status === "active");
    if (!padelIsMember) { showPadelState("padel-nonmember"); return; }
    showPadelState("padel-booking");
    renderPadelDates();
  });
});

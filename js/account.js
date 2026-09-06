// Courtside Wellness — account dashboard logic
// Requires auth.js loaded first.

let currentUser = null;

// Self-service cancel/reschedule from the account page is switched off for
// now — bookings just display, read-only. All the logic underneath is still
// here; flip this back to true to re-enable the buttons and panels.
const MANAGE_BOOKINGS_ENABLED = false;

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return ` at ${h12}:${String(m).padStart(2, "0")}${period}`;
}

async function loadProfile(uid) {
  // Falls back to the Firebase Auth user object (always available) if there's
  // no Firestore profile doc yet, or it's missing a field — previously this
  // bailed out entirely when the doc didn't exist, leaving name/email blank
  // even though Firebase already knew them.
  const profile = await getUserProfile(uid);
  const fallbackName = currentUser.displayName || "";
  const fallbackEmail = currentUser.email || "";
  const nameVal = (profile && profile.name) || fallbackName;
  const phoneVal = (profile && profile.phone) || "";
  document.getElementById("p-name").value = nameVal;
  document.getElementById("p-email").value = (profile && profile.email) || fallbackEmail;
  document.getElementById("p-phone").value = phoneVal;

  // Self-heal: if sign-up's Firestore write never landed (no doc, or a doc
  // missing name entirely), quietly write what we already know from Firebase
  // Auth right now — so admin sees this member without them needing to
  // manually open this page and click Save first.
  if (!profile || !profile.name) {
    try {
      await updateUserProfile(uid, { name: fallbackName, email: fallbackEmail });
    } catch (e) {
      console.warn("Couldn't self-heal profile doc:", e);
    }
  }
}

// A booking can be moved by its owner if it's upcoming, not cancelled, and
// starts more than 24 hours from now.
function classDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function canReschedule(b, isPast, isCancelled) {
  if (isPast || isCancelled || !CLASS_TYPES[b.classType]) return false;
  const start = classDateTime(b.date, b.time);
  return (start.getTime() - Date.now()) > 24 * 60 * 60 * 1000;
}

function fmtMembershipDate(ts) {
  if (!ts) return "soon";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

// Returns true if the user has an active membership, so the caller can also
// hide the credits stat and other member-only UI without a second Firestore read.
async function loadMembershipBox(uid) {
  const box = document.getElementById("membership-status");
  try {
    const profile = await getUserProfile(uid);
    const m = profile && profile.membership;
    const isMember = !!(m && m.status === "active");
    if (!box) return isMember;

    if (isMember) {
      box.innerHTML = `<div class="notice">Active member, unlimited classes plus full Padel Spot Minto access. Next renewal: ${fmtMembershipDate(m.currentPeriodEnd)}. <a href="contact.html" style="text-decoration: underline;">Contact us</a> to cancel.</div>`;
    } else if (m && m.status === "past_due") {
      box.innerHTML = `<div class="notice">Your last membership payment didn't go through. <a href="contact.html" style="text-decoration: underline;">Contact us</a> for help.</div>`;
    } else if (m && m.status === "cancelled") {
      box.innerHTML = `<div class="notice">Your membership has ended. <a href="membership.html" style="text-decoration: underline;">Rejoin any time</a>.</div>`;
    }
    return isMember;
  } catch (err) {
    console.warn("Couldn't load membership status:", err);
    return false;
  }
}

async function loadCredits(uid) {
  if (!authReady || !uid) return 0;
  try {
    const snap = await authDb.collection("packages")
      .where("uid", "==", uid)
      .where("status", "==", "confirmed")
      .get();
    let total = 0;
    snap.forEach((doc) => { total += doc.data().creditsRemaining || 0; });
    return total;
  } catch (err) {
    console.warn("Couldn't load class credits:", err);
    return 0;
  }
}

function renderStats(bookings, credits, isMember) {
  const box = document.getElementById("member-stats");
  if (!box) return;
  const today = new Date().toISOString().slice(0, 10);
  const attended = bookings.filter((b) => b.status === "confirmed" && b.date < today).length;
  const upcoming = bookings.filter((b) => b.date >= today && b.status !== "cancelled").length;

  // Members don't need a credits count shown, since membership already
  // covers unlimited bookings on eligible class types. Swap the grid to two
  // columns in that case so there's no empty gap where the card would be.
  box.className = isMember ? "stats stats-2" : "stats stats-3";
  const creditsCard = isMember ? "" : `
    <div class="stat-card">
      <div class="stat-number">${credits}</div>
      <div class="stat-label">Class credits</div>
    </div>
  `;

  box.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${attended}</div>
      <div class="stat-label">Classes attended</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${upcoming}</div>
      <div class="stat-label">Upcoming bookings</div>
    </div>
    ${creditsCard}
  `;
}

function reschedulePanel(b) {
  const cfg = CLASS_TYPES[b.classType];
  const dates = nextWeekdays(10);
  const dateOptions = dates.map((d) => {
    const key = dateKey(d);
    const label = d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    return `<option value="${key}" ${key === b.date ? "selected" : ""}>${label}</option>`;
  }).join("");
  const timeOptions = cfg.times.map((t) =>
    `<option value="${t}" ${t === b.time ? "selected" : ""}>${formatTime(t)}</option>`
  ).join("");

  return `
    <div class="reschedule-panel booking-hidden" id="resched-${b.id}" style="width: 100%; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--cream-dark); display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
      <div>
        <label style="display:block; font-size:0.8rem; margin-bottom:4px;">New date</label>
        <select class="resched-date">${dateOptions}</select>
      </div>
      <div>
        <label style="display:block; font-size:0.8rem; margin-bottom:4px;">New time</label>
        <select class="resched-time">${timeOptions}</select>
      </div>
      <button type="button" class="btn btn-primary confirm-resched" data-id="${b.id}" data-date="${b.date}" data-time="${b.time}" data-classtype="${b.classType}">Confirm Move</button>
      <button type="button" class="btn btn-outline cancel-resched-panel" data-id="${b.id}">Never mind</button>
      <p class="resched-error form-error booking-hidden" style="width: 100%;"></p>
    </div>
  `;
}

async function loadBookings(uid, isMember) {
  const list = document.getElementById("bookings-list");
  list.innerHTML = "<p>Loading your bookings…</p>";

  const [snap, credits] = await Promise.all([
    authDb.collection("bookings").where("uid", "==", uid).get(),
    loadCredits(uid)
  ]);

  const bookings = [];
  snap.forEach((doc) => bookings.push({ id: doc.id, ...doc.data() }));
  bookings.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  renderStats(bookings, credits, isMember);

  if (snap.empty) {
    list.innerHTML = "<p>No bookings yet. <a href=\"booking.html\" style=\"text-decoration: underline; color: var(--pink-dark);\">Book a class</a>.</p>";
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  list.innerHTML = bookings.map((b) => {
    const isPast = b.date < today;
    const isCancelled = b.status === "cancelled";
    let statusLabel = "Pending payment";
    if (b.status === "confirmed") statusLabel = "Confirmed";
    if (b.status === "cancelled") statusLabel = "Cancelled";

    const canCancel = MANAGE_BOOKINGS_ENABLED && !isPast && !isCancelled;
    const canMove = MANAGE_BOOKINGS_ENABLED && canReschedule(b, isPast, isCancelled);

    return `
      <div class="info-block">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap;">
          <div>
            <h3>${fmtDate(b.date)}${formatTime(b.time)}</h3>
            <p>${b.classLabel || "Class"} &middot; $${b.price || 20} &middot; ${statusLabel}${isPast ? " &middot; Past" : ""}</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${canMove ? `<button class="btn btn-outline reschedule-btn" data-id="${b.id}">Reschedule</button>` : ""}
            ${canCancel ? `<button class="btn btn-outline cancel-btn" data-id="${b.id}" data-date="${b.date}" data-time="${b.time}" data-classtype="${b.classType}">Cancel Booking</button>` : ""}
          </div>
        </div>
        ${canMove ? reschedulePanel(b) : ""}
      </div>
    `;
  }).join("");

  if (!MANAGE_BOOKINGS_ENABLED) return;

  list.querySelectorAll(".cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.id, btn.dataset.date, btn.dataset.time, btn.dataset.classtype));
  });

  list.querySelectorAll(".reschedule-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`resched-${btn.dataset.id}`).classList.toggle("booking-hidden");
    });
  });

  list.querySelectorAll(".cancel-resched-panel").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`resched-${btn.dataset.id}`).classList.add("booking-hidden");
    });
  });

  list.querySelectorAll(".confirm-resched").forEach((btn) => {
    btn.addEventListener("click", () => rescheduleBooking(
      btn.dataset.id, btn.dataset.classtype, btn.dataset.date, btn.dataset.time
    ));
  });
}

async function rescheduleBooking(bookingId, classType, oldDate, oldTime) {
  const panel = document.getElementById(`resched-${bookingId}`);
  const newDate = panel.querySelector(".resched-date").value;
  const newTime = panel.querySelector(".resched-time").value;
  const errEl = panel.querySelector(".resched-error");
  const btn = panel.querySelector(".confirm-resched");

  if (newDate === oldDate && newTime === oldTime) {
    errEl.textContent = "That's already your booked time.";
    errEl.classList.remove("booking-hidden");
    return;
  }

  const start = classDateTime(oldDate, oldTime);
  if ((start.getTime() - Date.now()) <= 24 * 60 * 60 * 1000) {
    errEl.textContent = "This booking is now less than 24 hours away and can't be moved online. Contact us directly.";
    errEl.classList.remove("booking-hidden");
    return;
  }

  errEl.classList.add("booking-hidden");
  btn.disabled = true;
  btn.textContent = "Moving…";

  const cfg = CLASS_TYPES[classType];
  const oldSessionRef = authDb.collection("sessions").doc(sessionKey(classType, oldDate, oldTime));
  const newSessionRef = authDb.collection("sessions").doc(sessionKey(classType, newDate, newTime));
  const bookingRef = authDb.collection("bookings").doc(bookingId);

  try {
    await authDb.runTransaction(async (tx) => {
      const [oldDoc, newDoc] = await Promise.all([tx.get(oldSessionRef), tx.get(newSessionRef)]);

      const newData = newDoc.exists ? newDoc.data() : { booked: 0, capacity: cfg.capacity, min: cfg.min };
      if ((newData.booked || 0) >= (newData.capacity || cfg.capacity)) {
        throw new Error("That time is full. Please pick another.");
      }

      if (oldDoc.exists) {
        const oldData = oldDoc.data();
        tx.update(oldSessionRef, { booked: Math.max(0, (oldData.booked || 0) - 1) });
      }

      tx.set(newSessionRef, {
        booked: (newData.booked || 0) + 1,
        capacity: newData.capacity || cfg.capacity,
        min: newData.min || cfg.min
      });

      tx.update(bookingRef, { date: newDate, time: newTime });
    });

    loadBookings(currentUser.uid);
  } catch (err) {
    errEl.textContent = err.message.replace("Firebase: ", "");
    errEl.classList.remove("booking-hidden");
    btn.disabled = false;
    btn.textContent = "Confirm Move";
  }
}

async function cancelBooking(bookingId, dateStr, timeStr, classType) {
  if (!confirm("Cancel this booking? This can't be undone.")) return;

  try {
    await authDb.collection("bookings").doc(bookingId).update({ status: "cancelled" });

    const sessionRef = authDb.collection("sessions").doc(`${classType}_${dateStr}_${timeStr}`);
    await authDb.runTransaction(async (tx) => {
      const doc = await tx.get(sessionRef);
      if (!doc.exists) return;
      const current = doc.data();
      tx.update(sessionRef, { booked: Math.max(0, (current.booked || 0) - 1) });
    });

    loadBookings(currentUser.uid);
  } catch (err) {
    alert("Couldn't cancel booking: " + err.message.replace("Firebase: ", ""));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("bookings-list")) return; // not on account page

  onAuthReady(async (user) => {
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent("account.html");
      return;
    }
    currentUser = user;
    loadProfile(user.uid);
    const isMember = await loadMembershipBox(user.uid);
    loadBookings(user.uid, isMember);
  });

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("p-name").value.trim();
    const phone = document.getElementById("p-phone").value.trim();
    const btn = document.getElementById("profile-save");
    const errEl = document.getElementById("profile-error");

    if (!isValidAuPhone(phone)) {
      errEl.textContent = "Please enter a valid Australian phone number, e.g. 0412 345 678.";
      errEl.classList.remove("booking-hidden");
      return;
    }
    errEl.classList.add("booking-hidden");

    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      // Include email so this write creates a complete users/{uid} doc even
      // if one was never created (e.g. a sign-up where the Firestore write
      // failed) — merge: true means this both creates and updates safely.
      await updateUserProfile(currentUser.uid, { name, phone, email: currentUser.email });
      await currentUser.updateProfile({ displayName: name });
      btn.textContent = "Saved ✓";
      setTimeout(() => { btn.textContent = "Save Changes"; btn.disabled = false; }, 1500);
    } catch (err) {
      alert("Couldn't save: " + err.message.replace("Firebase: ", ""));
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logOut();
    location.href = "index.html";
  });
});

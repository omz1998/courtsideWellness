// Courtside Wellness — admin dashboard logic
// Requires auth.js loaded first.

const DEMO_MODE = !authReady;

const DEMO_BOOKINGS = [
  { id: "demo1", name: "Sarah Chen", email: "sarah.chen@example.com", phone: "0412 345 678", classType: "pilates", classLabel: "Mat Pilates", date: nextWeekday(1), time: "09:30", price: 20, status: "confirmed" },
  { id: "demo2", name: "Priya Nair", email: "priya.nair@example.com", phone: "0423 456 789", classType: "pilates", classLabel: "Mat Pilates", date: nextWeekday(1), time: "09:30", price: 20, status: "confirmed" },
  { id: "demo3", name: "Jess Taylor", email: "jess.taylor@example.com", phone: "0434 567 890", classType: "kids", classLabel: "Kids Fitness", date: nextWeekday(1), time: "13:30", price: 15, status: "pending_payment" },
  { id: "demo4", name: "Amelia Ward", email: "amelia.ward@example.com", phone: "0445 678 901", classType: "kids", classLabel: "Kids Fitness", date: nextWeekday(3), time: "11:30", price: 15, status: "pending_payment" },
  { id: "demo5", name: "Grace Kim", email: "grace.kim@example.com", phone: "0456 789 012", classType: "pilates", classLabel: "Mat Pilates", date: nextWeekday(3), time: "10:30", price: 20, status: "confirmed" },
  { id: "demo6", name: "Olivia Brooks", email: "olivia.brooks@example.com", phone: "0467 890 123", classType: "pilates", classLabel: "Mat Pilates", date: nextWeekday(-2), time: "09:30", price: 20, status: "cancelled" },
  { id: "demo7", name: "Mia Robertson", email: "mia.robertson@example.com", phone: "0478 901 234", classType: "kids", classLabel: "Kids Fitness", date: nextWeekday(-2), time: "13:30", price: 15, status: "confirmed" },
];

const DEMO_PACKAGES = [
  { id: "pkgdemo1", name: "Sarah Chen", email: "sarah.chen@example.com", phone: "0412 345 678", label: "10-Class Pack", price: 160, credits: 10, creditsRemaining: 6, status: "confirmed", createdAt: demoTimestamp(-20) },
  { id: "pkgdemo2", name: "Priya Nair", email: "priya.nair@example.com", phone: "0423 456 789", label: "5-Class Pack", price: 80, credits: 5, creditsRemaining: 5, status: "pending_payment", createdAt: demoTimestamp(-1) },
  { id: "pkgdemo3", name: "Grace Kim", email: "grace.kim@example.com", phone: "0456 789 012", label: "5-Class Pack", price: 80, credits: 5, creditsRemaining: 2, status: "confirmed", createdAt: demoTimestamp(-15) },
];

const DEMO_CUSTOMERS = [
  { name: "Sarah Chen", email: "sarah.chen@example.com", phone: "0412 345 678", createdAt: demoTimestamp(-40) },
  { name: "Priya Nair", email: "priya.nair@example.com", phone: "0423 456 789", createdAt: demoTimestamp(-33) },
  { name: "Jess Taylor", email: "jess.taylor@example.com", phone: "0434 567 890", createdAt: demoTimestamp(-21) },
  { name: "Amelia Ward", email: "amelia.ward@example.com", phone: "0445 678 901", createdAt: demoTimestamp(-14) },
  { name: "Grace Kim", email: "grace.kim@example.com", phone: "0456 789 012", createdAt: demoTimestamp(-9) },
  { name: "Olivia Brooks", email: "olivia.brooks@example.com", phone: "0467 890 123", createdAt: demoTimestamp(-5) },
  { name: "Mia Robertson", email: "mia.robertson@example.com", phone: "0478 901 234", createdAt: demoTimestamp(-2) },
];

function nextWeekday(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function demoTimestamp(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return { toDate: () => d };
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `, ${h12}:${String(m).padStart(2, "0")}${period}`;
}

function fmtCreated(ts) {
  if (!ts || !ts.toDate) return "—";
  return ts.toDate().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function loadStats(bookings) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.date >= today && b.status !== "cancelled");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const pending = bookings.filter((b) => b.status === "pending_payment");
  const revenue = confirmed.reduce((sum, b) => sum + (b.price || 0), 0);

  document.getElementById("stat-upcoming").textContent = upcoming.length;
  document.getElementById("stat-pending").textContent = pending.length;
  document.getElementById("stat-confirmed").textContent = confirmed.length;
  document.getElementById("stat-revenue").textContent = `$${revenue}`;
}

function renderBookingsTable(bookings, interactive) {
  const tbody = document.getElementById("bookings-tbody");

  if (bookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">No bookings yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = bookings.map((b) => {
    const statusLabel = {
      pending_payment: "Pending payment",
      confirmed: "Confirmed",
      cancelled: "Cancelled"
    }[b.status] || b.status;

    return `
      <tr>
        <td>${fmtDate(b.date)}${formatTime(b.time)}</td>
        <td>${b.classLabel || "—"}</td>
        <td>${b.name || "—"}</td>
        <td><a href="mailto:${b.email}">${b.email || "—"}</a></td>
        <td><a href="tel:${b.phone}">${b.phone || "—"}</a></td>
        <td>$${b.price || 20}</td>
        <td><span class="admin-status admin-status-${b.status}">${statusLabel}</span></td>
        <td>
          ${interactive ? `
            ${b.status !== "confirmed" ? `<button class="btn btn-outline admin-action" data-action="confirm" data-id="${b.id}">Mark Paid</button>` : ""}
            ${b.status !== "cancelled" ? `<button class="btn btn-outline admin-action" data-action="cancel" data-id="${b.id}" data-date="${b.date}" data-time="${b.time}" data-classtype="${b.classType}">Cancel</button>` : ""}
          ` : `<span style="color: var(--ink-soft); font-size: 0.85rem;">Sample data</span>`}
        </td>
      </tr>
    `;
  }).join("");

  if (interactive) {
    tbody.querySelectorAll(".admin-action").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action, btn.dataset.id, btn.dataset.date, btn.dataset.time, btn.dataset.classtype));
    });
  }
}

function renderPackagesTable(packages, interactive) {
  const tbody = document.getElementById("packages-tbody");

  if (packages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">No package purchases yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = packages.map((p) => {
    const statusLabel = {
      pending_payment: "Pending payment",
      confirmed: "Confirmed",
      cancelled: "Cancelled"
    }[p.status] || p.status;

    return `
      <tr>
        <td>${fmtCreated(p.createdAt)}</td>
        <td>${p.label || "—"}</td>
        <td>${p.name || "—"}</td>
        <td><a href="mailto:${p.email}">${p.email || "—"}</a></td>
        <td><a href="tel:${p.phone}">${p.phone || "—"}</a></td>
        <td>$${p.price || 0}</td>
        <td>${p.status === "confirmed" ? `${p.creditsRemaining ?? p.credits} of ${p.credits}` : "—"}</td>
        <td><span class="admin-status admin-status-${p.status}">${statusLabel}</span></td>
        <td>
          ${interactive ? `
            ${p.status !== "confirmed" ? `<button class="btn btn-outline admin-package-action" data-action="confirm" data-id="${p.id}">Mark Paid</button>` : ""}
            ${p.status !== "cancelled" ? `<button class="btn btn-outline admin-package-action" data-action="cancel" data-id="${p.id}">Cancel</button>` : ""}
          ` : `<span style="color: var(--ink-soft); font-size: 0.85rem;">Sample data</span>`}
        </td>
      </tr>
    `;
  }).join("");

  if (interactive) {
    tbody.querySelectorAll(".admin-package-action").forEach((btn) => {
      btn.addEventListener("click", () => handlePackageAction(btn.dataset.action, btn.dataset.id));
    });
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById("customers-tbody");

  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No customers yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map((c) => `
    <tr>
      <td>${c.name || "—"}</td>
      <td><a href="mailto:${c.email}">${c.email || "—"}</a></td>
      <td><a href="tel:${c.phone}">${c.phone || "—"}</a></td>
      <td>${fmtCreated(c.createdAt)}</td>
    </tr>
  `).join("");
}

async function loadBookings() {
  const snap = await authDb.collection("bookings").get();
  const bookings = [];
  snap.forEach((doc) => bookings.push({ id: doc.id, ...doc.data() }));
  bookings.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  loadStats(bookings);
  renderBookingsTable(bookings, true);
}

async function loadPackages() {
  const snap = await authDb.collection("packages").get();
  const packages = [];
  snap.forEach((doc) => packages.push({ id: doc.id, ...doc.data() }));
  packages.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderPackagesTable(packages, true);
}

async function handlePackageAction(action, packageId) {
  try {
    if (action === "confirm") {
      await authDb.collection("packages").doc(packageId).update({ status: "confirmed" });
    } else if (action === "cancel") {
      if (!confirm("Cancel this package? Any remaining credits on it will stop being usable.")) return;
      await authDb.collection("packages").doc(packageId).update({ status: "cancelled" });
    }
    loadPackages();
  } catch (err) {
    alert("Action failed: " + err.message.replace("Firebase: ", ""));
  }
}

async function loadCustomers() {
  const snap = await authDb.collection("users").get();
  const customers = [];
  snap.forEach((doc) => customers.push({ id: doc.id, ...doc.data() }));
  customers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  renderCustomersTable(customers);
}

async function handleAction(action, bookingId, dateStr, timeStr, classType) {
  try {
    if (action === "confirm") {
      await authDb.collection("bookings").doc(bookingId).update({ status: "confirmed" });
    } else if (action === "cancel") {
      if (!confirm("Cancel this booking? This frees up their spot.")) return;
      await authDb.collection("bookings").doc(bookingId).update({ status: "cancelled" });
      if (dateStr && timeStr && classType) {
        const sessionRef = authDb.collection("sessions").doc(`${classType}_${dateStr}_${timeStr}`);
        await authDb.runTransaction(async (tx) => {
          const doc = await tx.get(sessionRef);
          if (!doc.exists) return;
          const current = doc.data();
          tx.update(sessionRef, { booked: Math.max(0, (current.booked || 0) - 1) });
        });
      }
    }
    loadBookings();
  } catch (err) {
    alert("Action failed: " + err.message.replace("Firebase: ", ""));
  }
}

function loadDemo() {
  const banner = document.createElement("div");
  banner.className = "notice";
  banner.style.marginBottom = "30px";
  banner.innerHTML = "<strong>Preview mode.</strong> Firebase isn't connected yet, so this is sample data so you can see the layout. Follow the README to connect Firebase and this becomes your real dashboard.";
  document.getElementById("admin-wrap").prepend(banner);

  loadStats(DEMO_BOOKINGS);
  renderBookingsTable(DEMO_BOOKINGS, false);
  renderPackagesTable(DEMO_PACKAGES, false);
  renderCustomersTable(DEMO_CUSTOMERS);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("bookings-tbody")) return; // not on admin page

  if (DEMO_MODE) {
    loadDemo();
    return;
  }

  onAuthReady(async (user) => {
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent("admin.html");
      return;
    }
    const isAdmin = await checkIsAdmin(user.uid);
    if (!isAdmin) {
      document.getElementById("admin-wrap").innerHTML =
        '<div class="notice">This account doesn\'t have admin access. If this is a mistake, add your account to the "admins" collection in Firestore — see README.md.</div>';
      return;
    }
    loadBookings();
    loadPackages();
    loadCustomers();
  });
});

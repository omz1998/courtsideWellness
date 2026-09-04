// Courtside Wellness — shared auth helpers
// Requires firebase-config.js + firebase-app/auth/firestore compat SDKs loaded first.

let authReady = false;

try {
  if (typeof firebase !== "undefined" && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    authReady = true;
  }
} catch (e) {
  console.warn("Firebase auth not configured yet:", e);
}

const auth = authReady ? firebase.auth() : null;
const authDb = authReady ? firebase.firestore() : null;

// Accepts Australian mobile or landline numbers, with or without spaces,
// as +61, 0061, or a leading 0 (e.g. "0412 345 678", "+61 2 9876 5432").
// Used on booking, signup, and account forms — shared here since auth.js
// loads before every other script on every page.
function isValidAuPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(?:\+?61|0)[2-478]\d{8}$/.test(cleaned);
}

function requireAuthReady() {
  if (!authReady) {
    throw new Error("Firebase isn't configured yet. Add your project details to js/firebase-config.js first.");
  }
}

async function signUp(name, email, phone, password) {
  requireAuthReady();
  const cred = await auth.createUserWithEmailAndPassword(email, password);

  // Set displayName on the Auth user first — this always succeeds once the
  // account exists, so name/email are available even if the Firestore write
  // below fails (e.g. rules not published yet). Previously this ran after
  // the Firestore write, so a rules hiccup left the account with no name
  // anywhere and no users/{uid} doc, even though sign-up looked like it worked.
  await cred.user.updateProfile({ displayName: name });

  try {
    await authDb.collection("users").doc(cred.user.uid).set({
      name, email, phone,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    // Don't block sign-up on this — the account still works, and the profile
    // doc gets created next time they save changes on their account page.
    console.warn("Couldn't create Firestore profile doc during sign-up:", e);
  }

  return cred.user;
}

async function logIn(email, password) {
  requireAuthReady();
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

async function logOut() {
  requireAuthReady();
  await auth.signOut();
}

async function resetPassword(email) {
  requireAuthReady();
  await auth.sendPasswordResetEmail(email);
}

async function getUserProfile(uid) {
  requireAuthReady();
  const doc = await authDb.collection("users").doc(uid).get();
  return doc.exists ? doc.data() : null;
}

async function updateUserProfile(uid, data) {
  requireAuthReady();
  const ref = authDb.collection("users").doc(uid);
  // Backfills "joined" date for accounts whose profile doc was never created
  // at sign-up (e.g. a rules hiccup at the time), so admin can still show a
  // real Joined date instead of "-" once they've saved anything here.
  const existing = await ref.get();
  const needsCreatedAt = !existing.exists || !existing.data().createdAt;
  await ref.set(
    needsCreatedAt ? { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() } : data,
    { merge: true }
  );
}

// Returns true if this uid has a doc in the "admins" collection.
// Admin status is granted manually via the Firebase console (see README) —
// there's no sign-up path for it, on purpose.
async function checkIsAdmin(uid) {
  if (!authReady || !uid) return false;
  try {
    const doc = await authDb.collection("admins").doc(uid).get();
    return doc.exists;
  } catch (e) {
    return false;
  }
}

// Redirect helper: call on pages that require login.
// Usage: onAuthReady(user => { if (!user) location.href = "login.html?redirect=" + encodeURIComponent(location.pathname); });
function onAuthReady(callback) {
  if (!authReady) {
    callback(null);
    return;
  }
  auth.onAuthStateChanged(callback);
}

// Nav helper: swap "My Account" link based on auth state, and show an
// "Admin" link if the signed-in user has admin access (used on every page).
function wireAccountNavLink() {
  const link = document.getElementById("account-nav-link");
  onAuthReady(async (user) => {
    if (link) {
      if (user) {
        link.textContent = "My Account";
        link.href = "account.html";
      } else {
        link.textContent = "Login";
        link.href = "login.html";
      }
    }

    const adminSlot = document.getElementById("admin-nav-slot");
    if (adminSlot && user) {
      const isAdmin = await checkIsAdmin(user.uid);
      if (isAdmin) {
        adminSlot.innerHTML = '<li><a href="admin.html">Admin</a></li>';
      }
    }
  });
}

// Active members don't need class packages or credits, since membership
// already covers unlimited bookings on eligible class types. Elements marked
// class="member-hide" (nav links, buttons, promo notices) get hidden once we
// know the signed-in user has an active membership.
function hideMemberOnlyElements() {
  onAuthReady(async (user) => {
    if (!user) return;
    try {
      const profile = await getUserProfile(user.uid);
      const isMember = !!(profile && profile.membership && profile.membership.status === "active");
      if (isMember) {
        document.querySelectorAll(".member-hide").forEach((el) => { el.style.display = "none"; });
      }
    } catch (e) {
      // If this check fails, leave elements visible rather than break the page.
    }
  });
}

document.addEventListener("DOMContentLoaded", wireAccountNavLink);
document.addEventListener("DOMContentLoaded", hideMemberOnlyElements);

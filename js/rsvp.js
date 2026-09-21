// Courtside Wellness — Open Day RSVP (open-day.html)
// No account needed — writes straight to Firestore's "rsvps" collection as a
// guest (see the Firestore rule needed for this in README.md), and also
// emails admin@courtsidewellness.com.au via Web3Forms so it shows up
// immediately without needing to check Firestore.
const RSVP_WEB3FORMS_ACCESS_KEY = "d24bdd7e-adbe-479c-b7c0-d7ff45af0bc3";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("rsvp-form");
  if (!form) return; // not on a page with the RSVP form

  const attendingSelect = document.getElementById("r-attending");
  const headcountWrap = document.getElementById("r-headcount-wrap");

  function syncHeadcountVisibility() {
    headcountWrap.classList.toggle("booking-hidden", attendingSelect.value !== "yes");
  }
  attendingSelect.addEventListener("change", syncHeadcountVisibility);
  syncHeadcountVisibility();

  // If they're logged in, prefill from their account so they don't have to
  // retype it, still just a plain guest write to "rsvps" either way.
  onAuthReady(async (user) => {
    if (!user) return;
    try {
      const profile = await getUserProfile(user.uid);
      if (profile) {
        document.getElementById("r-name").value = profile.name || "";
        document.getElementById("r-phone").value = profile.phone || "";
      }
    } catch (e) {
      // Not logged in / lookup failed — leave the fields blank, no big deal.
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const errorEl = document.getElementById("rsvp-error");
    const successEl = document.getElementById("rsvp-success");
    const btn = document.getElementById("rsvp-submit");
    errorEl.classList.add("booking-hidden");
    successEl.classList.add("booking-hidden");

    const name = document.getElementById("r-name").value.trim();
    const phone = document.getElementById("r-phone").value.trim();
    const attending = attendingSelect.value;
    const headcount = attending === "yes"
      ? Math.max(1, parseInt(document.getElementById("r-headcount").value, 10) || 1)
      : 0;

    if (!name || !phone || !attending) {
      errorEl.textContent = "Please fill in all fields.";
      errorEl.classList.remove("booking-hidden");
      return;
    }
    if (!isValidAuPhone(phone)) {
      errorEl.textContent = "Please enter a valid Australian phone number, e.g. 0412 345 678.";
      errorEl.classList.remove("booking-hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending…";

    try {
      if (authReady) {
        await authDb.collection("rsvps").add({
          name,
          phone,
          attending: attending === "yes",
          headcount,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      if (RSVP_WEB3FORMS_ACCESS_KEY !== "PASTE_WEB3FORMS_ACCESS_KEY") {
        await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            access_key: RSVP_WEB3FORMS_ACCESS_KEY,
            subject: "Open Day RSVP",
            from_name: "Courtside Wellness Website",
            message: `Name: ${name}\nPhone: ${phone}\nAttending: ${attending === "yes" ? "Yes" : "Can't make it"}\nHeadcount: ${headcount || "-"}`
          })
        });
      }

      successEl.classList.remove("booking-hidden");
      form.reset();
      syncHeadcountVisibility();
      btn.textContent = "Send RSVP";
      btn.disabled = false;
    } catch (err) {
      errorEl.textContent = (err.message || "Something went wrong.").replace("Firebase: ", "") + " If this keeps happening, message us on WhatsApp instead.";
      errorEl.classList.remove("booking-hidden");
      btn.disabled = false;
      btn.textContent = "Send RSVP";
    }
  });
});

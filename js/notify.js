// Courtside Wellness — "Notify Me" pre-launch email capture (coming-soon.html)
// Same Web3Forms setup as js/message.js: emails the address straight to your
// inbox, no backend needed. Uses the same access key already in use there.
const NOTIFY_WEB3FORMS_ACCESS_KEY = "d24bdd7e-adbe-479c-b7c0-d7ff45af0bc3";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("notify-form");
  if (!form) return; // not on a page with the notify form

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById("notify-email");
    const errorEl = document.getElementById("notify-error");
    const successEl = document.getElementById("notify-success");
    const btn = document.getElementById("notify-submit");
    const email = emailInput.value.trim();

    errorEl.classList.add("booking-hidden");
    successEl.classList.add("booking-hidden");

    if (NOTIFY_WEB3FORMS_ACCESS_KEY === "PASTE_WEB3FORMS_ACCESS_KEY") {
      errorEl.textContent = "Notifications aren't set up yet.";
      errorEl.classList.remove("booking-hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending…";

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: NOTIFY_WEB3FORMS_ACCESS_KEY,
          subject: "New pre-launch signup (Notify Me)",
          from_name: "Courtside Wellness Website",
          email,
          replyto: email,
          message: `${email} asked to be notified about Open Day and new classes.`
        })
      });
      const data = await res.json();

      if (data.success) {
        successEl.classList.remove("booking-hidden");
        form.reset();
        btn.textContent = "Notify Me";
        btn.disabled = false;
      } else {
        throw new Error(data.message || "Something went wrong.");
      }
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong. Please try again or email us directly.";
      errorEl.classList.remove("booking-hidden");
      btn.disabled = false;
      btn.textContent = "Notify Me";
    }
  });
});

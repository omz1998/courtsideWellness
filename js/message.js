// Courtside Wellness — "Message Us" popup
// Sends the message straight to your inbox via Web3Forms (https://web3forms.com),
// a free form-to-email service that needs no backend of its own.
//
// Setup (one-time):
//   1. Go to https://web3forms.com and enter admin@courtsidewellness.com.au.
//   2. They'll email you an "Access Key" — copy it.
//   3. Paste it below in place of "PASTE_WEB3FORMS_ACCESS_KEY".
// Until that's done, the form will show a message explaining it isn't set up yet
// instead of silently failing.
const WEB3FORMS_ACCESS_KEY = "PASTE_WEB3FORMS_ACCESS_KEY";

function openMessageModal() {
  const modal = document.getElementById("message-modal");
  if (!modal) return;
  modal.classList.remove("booking-hidden");
  document.body.style.overflow = "hidden";
  const nameInput = document.getElementById("m-name");
  if (nameInput) nameInput.focus();
}

function closeMessageModal() {
  const modal = document.getElementById("message-modal");
  if (!modal) return;
  modal.classList.add("booking-hidden");
  document.body.style.overflow = "";
}

async function submitMessage(e) {
  e.preventDefault();

  const errorEl = document.getElementById("message-error");
  const successEl = document.getElementById("message-success");
  const btn = document.getElementById("message-submit");
  errorEl.classList.add("booking-hidden");
  successEl.classList.add("booking-hidden");

  // Honeypot — real visitors never check this (it's hidden). If it's ticked,
  // quietly pretend it worked rather than tipping off whatever filled it in.
  if (document.getElementById("m-botcheck").checked) {
    successEl.classList.remove("booking-hidden");
    document.getElementById("message-form").reset();
    return;
  }

  if (WEB3FORMS_ACCESS_KEY === "PASTE_WEB3FORMS_ACCESS_KEY") {
    errorEl.textContent = "Messaging isn't set up yet. See the WEB3FORMS_ACCESS_KEY note in js/message.js.";
    errorEl.classList.remove("booking-hidden");
    return;
  }

  const name = document.getElementById("m-name").value.trim();
  const email = document.getElementById("m-email").value.trim();
  const message = document.getElementById("m-message").value.trim();

  if (!name || !email || !message) {
    errorEl.textContent = "Please fill in all fields.";
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
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: "New message from the Courtside Wellness website",
        from_name: "Courtside Wellness Website",
        name,
        email,
        replyto: email,
        message
      })
    });
    const data = await res.json();

    if (data.success) {
      successEl.classList.remove("booking-hidden");
      document.getElementById("message-form").reset();
      btn.textContent = "Send Message";
      btn.disabled = false;
      setTimeout(closeMessageModal, 2000);
    } else {
      throw new Error(data.message || "Something went wrong sending your message.");
    }
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong. Please try again or email us directly.";
    errorEl.classList.remove("booking-hidden");
    btn.disabled = false;
    btn.textContent = "Send Message";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("message-us-btn");
  const modal = document.getElementById("message-modal");
  if (!openBtn || !modal) return; // not on a page with the message popup

  openBtn.addEventListener("click", openMessageModal);
  document.getElementById("message-modal-close").addEventListener("click", closeMessageModal);

  // Click on the dark backdrop (not the modal box itself) closes it too.
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeMessageModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("booking-hidden")) closeMessageModal();
  });

  document.getElementById("message-form").addEventListener("submit", submitMessage);
});

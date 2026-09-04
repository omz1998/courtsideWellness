// Courtside Wellness — shared interactivity

// Bookings toggle — flip to true once bookings should go live (e.g. closer
// to 5 October 2026). While false, every "Book a Class" link/button
// site-wide (nav button, Classes page buttons, Contact page button) is
// automatically relabelled to "Bookings Open Soon" and disabled, and
// booking.html itself shows a holding message instead of the booking form.
// No other file needs to change when you flip this back to true.
const BOOKINGS_OPEN = false;

document.addEventListener("DOMContentLoaded", () => {
  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  const cta = document.querySelector(".nav-cta");

  if (!BOOKINGS_OPEN) {
    document.querySelectorAll('a[href="booking.html"]').forEach((el) => {
      el.textContent = "Bookings Open Soon";
      el.removeAttribute("href");
      el.classList.add("btn-disabled");
      el.setAttribute("aria-disabled", "true");
    });
  }

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
      if (cta) cta.classList.toggle("open");
    });
  }

  // Close mobile nav when a link is clicked
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      links.classList.remove("open");
      if (cta) cta.classList.remove("open");
    });
  });

  // Scroll reveal
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  // Mark active nav link based on current page
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });
});

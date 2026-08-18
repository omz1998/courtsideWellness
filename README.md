# Courtside Wellness

Static site for Courtside Wellness, a women's fitness and wellness community in Minto NSW, hosted inside Padel Spot Minto (Mat Pilates, Mums and Bubs, Fitness Class $20 · Kids Fitness $15, open to all kids) — HTML/CSS/JS, no build step. Includes guest + member booking, live capacity tracking, member accounts, and an admin dashboard.

Classes start Monday 7 September 2026 — `FIRST_BOOKABLE_DATE` in `js/booking.js` stops the date picker from offering anything earlier. Once that date passes it has no effect.

## Files

- `index.html`, `classes.html`, `coming-soon.html`, `contact.html` — content pages
- `booking.html` — the booking flow: choose class → date → details → payment. **No login required** — guests can book directly.
- `login.html`, `signup.html` — optional member sign in / sign up
- `account.html` — member profile + their own bookings, with cancel (only for bookings made while logged in)
- `admin.html` — **owner-only**: every booking and every customer, with mark-paid / cancel actions
- `css/style.css` — all styling (pink/cream palette matching the logo)
- `js/script.js` — mobile nav toggle + scroll animations
- `js/firebase-config.js` — **you fill this in** (see Setup below)
- `js/auth.js` — shared sign up / log in / log out / profile / admin-check helpers
- `js/booking.js` — booking logic (class type, capacity, form, Stripe redirect) — has the `CLASS_TYPES` prices/Stripe links to fill in
- `js/account.js` — member dashboard logic (profile edit, cancel booking)
- `js/admin.js` — admin dashboard logic (all bookings/customers/packages, mark paid, cancel)
- `js/message.js` — "Message Us" popup on `contact.html` — sends to your inbox via Web3Forms, needs a one-time access key (see below)
- `packages.html` / `js/packages.js` — buy a 5 or 10-class pack (members only) — has the `CLASS_PACKS` Stripe links to fill in
- `functions/index.js` — Cloud Function that auto-confirms bookings/packages when Stripe reports a successful payment (see **4c** below to switch it on)
- `firebase.json`, `.firebaserc` — config for deploying the function above via the Firebase CLI
- `images/logo-icon.png` — compact monogram, used in the header nav on every page and as the favicon source
- `images/logo-full.png` — full logo with wordmark, used prominently in the homepage hero
- `images/favicon.png` — browser tab icon (generated from the monogram)
- `CNAME` — tells GitHub Pages to serve this site at courtsidewellness.com.au

## 1. Logo

`images/logo-icon.png` (nav + favicon) and `images/logo-full.png` (homepage hero) are cropped from your uploaded logo. If you want to swap in a different version, replace those two files directly — keep the exact lowercase filenames. (Important: GitHub Pages is case-sensitive, unlike Windows, so a file named e.g. `Logo.png` won't match an `<img src="images/logo.png">` reference — always use lowercase, no-space filenames for anything referenced in the HTML.)

## 2. Instagram link

Every footer currently links to `https://instagram.com/courtsidewellness` as a placeholder guess. If that's not your real handle, find-and-replace it across all `.html` files with your actual profile URL.

## 3. Set up Firebase (guest + member bookings, live spot counts, admin)

1. Go to https://console.firebase.google.com and create a free project.
2. Click the `</>` (web app) icon to register a web app. Copy the config into `js/firebase-config.js`.
3. **Build → Authentication → Sign-in method → Email/Password → Enable → Save** (this is for the optional member accounts; guest booking doesn't need it, but login/signup pages do).
4. **Build → Firestore Database → Create database.** Production mode, nearby region (e.g. `australia-southeast1`).
5. **Rules** tab, replace with: (if you've already published rules before, you need to republish this version — the `bookings` update rule below was fixed to allow credit redemption, which previously failed with "Missing or insufficient permissions")

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       function isAdmin() {
         return request.auth != null &&
           exists(/databases/$(database)/documents/admins/$(request.auth.uid));
       }

       match /users/{userId} {
         allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
         allow write: if request.auth != null && request.auth.uid == userId;
       }

       match /sessions/{sessionId} {
         allow read: if true;
         allow write: if request.resource.data.booked is int
                      && request.resource.data.booked >= 0
                      && request.resource.data.booked <= 30;
       }

       match /bookings/{bookingId} {
         // Guests (request.auth == null) can create a booking with uid: null.
         // Logged-in members must set uid to their own uid.
         allow create: if (request.auth == null && request.resource.data.uid == null)
                       || (request.auth != null && request.resource.data.uid == request.auth.uid);

         allow read: if isAdmin()
                     || (request.auth != null && resource.data.uid == request.auth.uid);

         allow update: if isAdmin()
                       // Cancelling: only the status field changes.
                       || (request.auth != null
                           && resource.data.uid == request.auth.uid
                           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"]))
                       // Redeeming a class credit: status + the two credit-tracking
                       // fields change together, and only to these exact values.
                       || (request.auth != null
                           && resource.data.uid == request.auth.uid
                           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "paidWithCredit", "packageId"])
                           && request.resource.data.status == "confirmed"
                           && request.resource.data.paidWithCredit == true);

         allow delete: if false;
       }

       match /admins/{uid} {
         allow read: if request.auth != null && request.auth.uid == uid;
         allow write: if false; // only ever added manually via the Firebase console
       }

       match /packages/{packageId} {
         // Members create their own pending purchase; only they or an admin
         // can read it. Once confirmed, the owner can decrement their own
         // creditsRemaining when redeeming a credit during booking — nothing
         // else about the doc is editable by them.
         allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;

         allow read: if isAdmin()
                     || (request.auth != null && resource.data.uid == request.auth.uid);

         allow update: if isAdmin()
                       || (request.auth != null
                           && resource.data.uid == request.auth.uid
                           && resource.data.status == "confirmed"
                           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["creditsRemaining"]));

         allow delete: if false;
       }
     }
   }
   ```

   Click **Publish**.

   Note the trade-off: `sessions` writes are open to anyone (including guests) so spot counts can update without login — reasonable for a small studio, but someone technical could inflate counts if they wanted to. If that becomes a real concern, the fix is a Cloud Function to own the increment logic server-side.

6. **Grant yourself admin access**: sign up for a member account on the live site once, copy your UID from **Authentication → Users**, then in **Firestore → Data**, create a collection called `admins` with a document whose ID is your UID (any field inside, e.g. `role: "owner"`). Log out and back in — an "Admin" link appears in the nav.

Without step 5 published, bookings/login/admin will show a "Firebase isn't configured" or permission error.

## 4. Set up Stripe (two payment links — one per class price)

1. Free account at https://dashboard.stripe.com/register.
2. **Payment links → + New** → one-time, **$20 AUD**, name it "Mat Pilates Class". Copy the link.
3. **Payment links → + New** again → one-time, **$15 AUD**, name it "Kids Fitness Class". Copy that link too.
4. In `js/booking.js`, find the `CLASS_TYPES` object near the top and paste each link into the matching `stripeLink` field. `pilates`, `mumsbubs`, and `fitness` all share the $20 link; `kids` gets the $15 link. (Mums and Bubs / Fitness Class currently reuse the Mat Pilates link since they're the same price — set up separate links for them if you'd rather each class show its own name on the Stripe checkout page.)

Bookings save as `status: "pending_payment"` until payment is confirmed. Once you set up the webhook in **4c** below, this happens automatically within seconds of a successful Stripe payment. Until then (or if a webhook event is ever missed), check Stripe's dashboard for who's paid and click **Mark Paid** on that booking in `admin.html` — that manual option always stays available as a fallback.

## 4b. Set up Stripe for class packages

1. **Payment links → + New** → one-time, **$80 AUD**, name it "5-Class Pack". Copy the link.
2. **Payment links → + New** again → one-time, **$160 AUD**, name it "10-Class Pack". Copy that link too.
3. In `js/packages.js`, find the `CLASS_PACKS` object near the top and paste each link into the matching `stripeLink` field (`pack5` gets the $80 link, `pack10` gets the $160 link).

Same as class bookings — package purchases save as `status: "pending_payment"` until confirmed, which happens automatically once **4c** below is set up. Until then, check Stripe's dashboard for who's paid and click **Mark Paid** on that package in the **Class Packages** table in `admin.html`. Marking it paid is what makes the credits usable — nothing is redeemable until you do.

## 4c. Automatic payment confirmation (Stripe webhook)

By default this site is "no server" — static HTML/JS hosted on GitHub Pages, with Firebase as the only backend. That means it can send people to Stripe Checkout, but it can't see whether they actually paid; someone has to check Stripe's dashboard and click **Mark Paid** by hand.

This step adds one small piece of real server code — a Firebase **Cloud Function** — that Stripe calls directly the instant a payment succeeds. It verifies the request is genuinely from Stripe, then confirms the matching booking or package in Firestore automatically. The code for this already exists in the `functions/` folder; the steps below are what you need to run once to switch it on. Nothing else about the site changes, and **Mark Paid still works** as a manual override afterward (e.g. for cash or bank transfer).

**You'll need:** the Firebase CLI installed on your computer, and your Firebase project upgraded from the free Spark plan to the pay-as-you-go **Blaze** plan (required for any Cloud Function, even one that costs nothing in practice — Cloud Functions has a generous free monthly allowance, so a studio this size shouldn't see any charge).

1. **Upgrade to Blaze:** in the [Firebase console](https://console.firebase.google.com), open the `courtside-wellness` project → the gear icon → **Usage and billing** → **Modify plan** → select **Blaze**. You'll attach a billing account, but nothing is charged unless usage goes well beyond a small business's needs.

2. **Install Node.js** (v20, from https://nodejs.org) if you don't already have it, then install the Firebase CLI:
   ```
   npm install -g firebase-tools
   ```

3. **Log in** with the same Google account that owns the Firebase project:
   ```
   firebase login
   ```

4. From the project's root folder (where `firebase.json` is), **install the function's dependencies**:
   ```
   cd functions
   npm install
   cd ..
   ```

5. **Set a placeholder secret** so the first deploy succeeds (you'll replace it with the real one in step 7):
   ```
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```
   When prompted, type anything (e.g. `placeholder`) and press enter.

6. **Deploy the function:**
   ```
   firebase deploy --only functions
   ```
   When it finishes, it prints a URL that looks like:
   `https://australia-southeast1-courtside-wellness.cloudfunctions.net/stripeWebhook`
   Copy that URL.

7. **Create the webhook in Stripe:** in the [Stripe dashboard](https://dashboard.stripe.com), go to **Developers → Webhooks → + Add endpoint**. Paste the URL from step 6 as the endpoint URL. Under events to send, select:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`

   Save, then click into the new endpoint and **Reveal** the **Signing secret** (starts with `whsec_`). Copy it.

8. **Set the real secret**, pasting in the `whsec_...` value from step 7:
   ```
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

9. **Redeploy** so the function picks up the real secret:
   ```
   firebase deploy --only functions
   ```

10. **Test it:** make a test booking or package purchase and pay with a Stripe test card. Within a few seconds it should flip to "Confirmed" in `admin.html` on its own — no Mark Paid click needed. If it doesn't, check the logs with `firebase functions:log`, or in the Firebase console under **Functions → Logs**.

Note: Stripe test mode and live mode each have their own separate webhook endpoint and signing secret. If you switch from testing to accepting real payments, repeat steps 7–9 for the live-mode endpoint (the function itself doesn't need to change).

## How booking works now

- **No account needed.** Anyone can go to `booking.html`, pick a class, pick a date and time, enter their name/email/phone, and pay — no sign-up required.
- **Session times are per class**, Mon–Fri: Mat Pilates 10:00am, Mums and Bubs 11:00am, Kids Fitness 10:00am & 11:00am, Fitness Class 12:30pm. To change times, edit the `times` array on each class in `CLASS_TYPES` near the top of `js/booking.js`.
- **Pricing:** $20 flat for Mat Pilates, Mums and Bubs, and Fitness Class; $15 for Kids Fitness.
- **Optional login benefit:** if someone logs in first (or has an account), their details prefill and the booking is tied to their profile so it shows up in `account.html`. For now this is read-only — members can see their bookings but not cancel or reschedule them there; contact you directly and you handle it from `admin.html`.
- **Self-service cancel/reschedule is built but switched off for now.** Set `MANAGE_BOOKINGS_ENABLED = true` near the top of `js/account.js` to turn it back on — all the logic (24-hour cutoff, spot count updates) is already in place.
- **Capacity is tracked per class type, per date, per time slot**, 30 max / 8 minimum to run each.
- **Admin** sees every booking regardless of guest or member, with class type, date/time, name, email, phone, price, and status, plus Mark Paid / Cancel actions.
- **Phone numbers are validated** as Australian numbers (mobile or landline, with or without spaces, `04...`, `02...`, `+61...`, etc.) on booking, sign-up, and the account profile form.

## How class packages work

- **Members only** — buying a pack requires being logged in, since credits are tied to your account. `packages.html` redirects to login if you're not signed in.
- **Two sizes, both 20% off:** 5-Class Pack is $80 (regular $100), 10-Class Pack is $160 (regular $200).
- **Credits are generic** — a credit from either pack can be used on any class type (Mat Pilates, Mums and Bubs, Kids Fitness, or Fitness Class). They don't expire.
- **Purchase flow:** buying creates a `packages` doc with `status: "pending_payment"`, then redirects to Stripe like a normal booking. Once you **Mark Paid** in `admin.html`, the credits become usable.
- **Redeeming a credit:** at the payment step of `booking.html`, a logged-in member with confirmed credits sees a "Use 1 Class Credit" button alongside "Pay Now". Using a credit confirms the booking immediately (no Stripe redirect) and decrements the oldest package with credits left, all in one Firestore transaction.
- **Account page** shows a "Class credits" count alongside bookings, plus a "Buy a Class Pack" button.
- **Admin** sees every package purchase in its own table on `admin.html` — customer, pack size, price, credits remaining, status — with Mark Paid / Cancel actions, same pattern as bookings.

## 5. Set up the "Message Us" popup (contact.html)

The Contact page has a "Message Us" button that opens a popup form (name, email, message) and emails it straight to you — no backend needed, via the free service [Web3Forms](https://web3forms.com).

1. Go to https://web3forms.com and enter `admin@courtsidewellness.com.au`.
2. They'll instantly email you an **Access Key** — no account/password needed, just that key.
3. Open `js/message.js` and replace `PASTE_WEB3FORMS_ACCESS_KEY` with your key.

Until that's done, the popup shows a message explaining it isn't set up yet rather than failing silently. There's also a hidden honeypot field for basic spam protection.

## 6. Deploy with GitHub Pages

1. Push all files to a GitHub repo's `main` branch (root).
2. **Settings → Pages** → Source: Deploy from a branch, `main`, `/root`. Save.
3. Test booking (as a guest), signup/login, and admin on the `github.io` URL before pointing your domain at it.

## 7. Connect courtsidewellness.com.au

1. **Settings → Pages → Custom domain** → `courtsidewellness.com.au` → Save.
2. DNS at your registrar:
   - Four `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `<username>.github.io`
3. Once live, tick "Enforce HTTPS" in Pages settings.

Note: only works once your .com.au registration is finalized (ABN/business name match) — build and test on the github.io URL in the meantime.

## Still to fill in

- Confirm/replace the Instagram placeholder link
- Firebase config, Email/Password provider, Firestore rules, your admin doc
- Stripe payment links ($20 and $15) in `js/booking.js` — optionally split Mums and Bubs / Fitness Class onto their own $20 links instead of reusing the Mat Pilates one
- Stripe payment links ($80 and $160) in `js/packages.js` for the class packages
- Instructor name/bio (not yet on any page)
- WhatsApp Business profile — contact.html says "coming soon" until you set one up (see note below)
- Web3Forms access key in `js/message.js` — the "Message Us" popup won't send until this is set (see above)
- Stripe webhook setup (**4c** above) — until done, payments are confirmed manually via "Mark Paid" in admin.html

## WhatsApp Business

`contact.html` currently just says "WhatsApp: coming soon" since there's no number to link yet. Once you set up the WhatsApp Business profile, using **"Courtside Wellness"** as the display name keeps it consistent with the rest of the brand and makes it findable by name. After that's live, replace the "coming soon" text with a real link in the form `https://wa.me/61XXXXXXXXX` (Australian number, no leading 0, no spaces/dashes).

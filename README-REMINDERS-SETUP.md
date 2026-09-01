# Adding daily reminders — what changed & what to do

This builds on the PWA setup from `README-PWA-SETUP.md`. If you haven't done
that yet, do that first (manifest, icons, "Add to Home Screen" support)  —
reminders build on top of it.

## What was added

Your existing design, journal content, and every feature you already had
(surahs, tafsir, reflections, dhikr counters, tracker, favorites, notes, the
flip-through Quran book) are **untouched**. This only *adds* a new
"Reminders" page to the app, plus the small backend that makes real
background notifications possible.

**Also fixed in this update:** the pinned "open the Quran book" icon had a
continuous floating animation that physically moved its clickable area up
and down forever. On a real touch screen, a target that keeps moving while
you're pressing it can cause the tap to be misread as a drag/scroll and get
cancelled — which is almost certainly why it sometimes wouldn't respond to
taps. It now pulses with a glow instead of moving position, so the tap target
stays perfectly still.


1. **`pwa/index.html`** — one new nav tab ("Reminders") and its page (styled
   to match everything else already in the app), plus a handful of small
   helper functions near the top of the script for talking to the push
   server. Nothing existing was modified or removed.

2. **`pwa/service-worker.js`** — two new event listeners appended at the end
   (`push`, to show the notification when one arrives, and
   `notificationclick`, to open/focus the app when it's tapped). The existing
   offline-caching logic is untouched.

3. **`push-server/`** (new folder, new project) — the Cloudflare Worker
   backend. This is what makes reminders arrive **even when the app/tab is
   completely closed**, on both iPhone and Android. See
   `push-server/README.md` for exact deployment steps — you'll need a free
   Cloudflare account and about 10 minutes.

## What the Reminders page lets someone do

- Turn reminders on/off (asks for notification permission properly, with the
  browser's own permission prompt — nothing sneaky, and it only asks when
  they tap "Turn on")
- Choose **active hours** (e.g. 7:00 AM – 9:00 PM) — outside that window is
  automatically quiet time, no notifications sent
- Choose how often, from every 1 hour up to every 6 hours (3 hours is the
  suggested default, matching what you asked for)
- Send themselves a one-off test notification to confirm it's working
- See example messages, and a plain-language explanation of the iPhone vs.
  Android differences, right in the app

Messages rotate randomly from a pool of ten (dhikr reminders, "have you read
Qur'an today", evening adhkar, etc. — including your exact examples) so it's
not the same notification every time. You can edit or add to that list in
`push-server/src/index.js` any time.

## Islamic Reminders & Challenges (a separate system)

This is intentionally a completely independent notification track from the
3-hour dhikr reminders above — separate on/off switch, separate schedule,
separate message pool, separate "last sent" tracking on the server. Someone
can have one on and the other off, both on, or neither, with no interaction
between them.

Settings someone can choose:
- **Daily**, **Weekly**, **Both**, or **Neither**
- A **preferred time** (a single hour, not a repeating interval — e.g.
  "9:00 AM")
- For weekly, which **day of the week** it arrives

What it sends:
- **Daily**: one randomly-picked prompt from a pool of ~30 covering adhkar,
  Qur'an reading, dua, salawat, small good deeds, and reflection questions
  (exactly the categories and examples you listed)
- **Weekly**: an 8-week rotating theme (Qur'an Week, Dhikr Week, Gratitude
  Week, Sadaqah Week, Salah Week, Dua Week, Character Week, Digital Detox
  Week), advancing automatically based on the calendar week, then looping
  back to Week 1 after Week 8

Tapping a challenge notification opens the app directly to the Reminders
page's "Today's Challenge" card. That card — along with "This Week's
Challenge" and a "Mark as done" button with a streak counter — works
**entirely locally**, even with notifications turned off, so someone can
still use the challenge/streak feature just by opening the app on their own.
(The exact wording shown there is picked independently from what gets pushed,
so it may occasionally differ slightly from the last notification — both draw
from the same themed pool, so it's never off-topic.)

There's a "Test daily challenge" / "Test weekly challenge" button in the app
for verifying this track works, separate from the general reminder's test
button.

## What you need to do

1. **Deploy the backend first** — follow `push-server/README.md` end to end.
   At the end you'll have a Worker URL like
   `https://quran-journal-push.yourname.workers.dev` and a VAPID public key.

2. **Wire the front-end to it** — open `pwa/index.html`, search for
   `PUSH_SERVER_URL` near the top of the big `<script>` block, and replace
   the placeholder with your real Worker URL:

   ```js
   const PUSH_SERVER_URL = "https://quran-journal-push.yourname.workers.dev";
   ```

   That's the only line you need to touch. (The VAPID *public* key doesn't
   need to be pasted in manually — the app fetches it automatically from your
   Worker's `/vapid-public-key` endpoint.)

3. **Push everything to GitHub** — `pwa/index.html`, `manifest.json`,
   `service-worker.js`, and the `icons/` folder go to the same directory your
   GitHub Pages site serves from (as in the base PWA setup). The
   `push-server/` folder can live in the same repo (it's just source code —
   GitHub Pages won't try to run it) or in a separate repo, whichever you
   prefer.

4. **Test end to end** — see the detailed steps for each platform right below.

## How to test on iPhone

1. Open your real GitHub Pages URL in **Safari** (not Chrome — on iOS, Chrome
   is just a Safari skin and has the same restriction: only Safari's own
   "Add to Home Screen" creates an installed app capable of notifications).
2. Tap the **Share** icon (square with an arrow) → **Add to Home Screen** →
   **Add**.
3. Close Safari completely, then open the app from the icon on your Home
   Screen (not from Safari's tabs).
4. Go to **Reminders**, tap **Turn on** for the dhikr reminders — iOS will
   show its own permission prompt; tap **Allow**.
5. Tap **Send me a test reminder**. You should feel/hear a notification
   within a few seconds. If nothing arrives after ~15 seconds, check that
   Settings → Notifications → (the app, listed by the name you gave it when
   adding to Home Screen) → Allow Notifications is on.
6. Repeat for the Islamic Reminders & Challenges section: choose Daily,
   Weekly, or Both, then use **Test daily challenge** / **Test weekly
   challenge**.
7. To confirm real scheduled delivery (not just the manual test buttons):
   set your active hours to include the next few minutes, set the interval
   to 1 hour, then lock your phone and wait for the top of the next 15-minute
   mark — the Worker's cron job runs every 15 minutes, so delivery isn't
   instant even when "due."

## How to test on Android

1. Open your real GitHub Pages URL in **Chrome** (or Edge/Brave/Samsung
   Internet). Unlike iPhone, this works even without adding it to the Home
   Screen, though you can still do that via Chrome's menu → **Add to Home
   screen** if you want the full-screen app experience too.
2. Go to **Reminders**, tap **Turn on** — Chrome will show its own permission
   prompt; tap **Allow**.
3. Tap **Send me a test reminder** and you should get it within a few
   seconds, same as iPhone.
4. To specifically confirm background delivery: after enabling reminders,
   **fully close the app/tab** (swipe it away from recent apps, not just lock
   the screen), wait for a scheduled reminder to be due, and confirm it still
   arrives — this is the behavior iPhone generally can't match nearly as
   reliably.

## iPhone-specific limitations (please read this before testing on iPhone)

- **Must be added to the Home Screen first.** Regular Safari tabs cannot
  receive push notifications at all on iOS — this is an Apple platform
  restriction that applies to every website, not something specific to this
  app. The Reminders page detects this and shows the exact steps (Share →
  Add to Home Screen) when needed.
- **Requires iOS 16.4 or later.**
- **Timing isn't exact.** Apple's push system can delay delivery by a few
  minutes depending on the phone's battery state, Low Power Mode, or how
  recently the app was used. This is normal and not something any web app can
  fully control — it's the same for native apps too.
- **If the app is removed from the Home Screen, or Safari's site data is
  cleared, the subscription is gone** and the person will need to turn
  reminders on again after reinstalling.

## Android

Works in Chrome and other Chromium-based browsers (Edge, Brave, Samsung
Internet, etc.), with or without adding it to the Home Screen, and reliably
wakes the browser to show the notification even after the tab/app has been
fully closed for a long time. Firefox for Android also supports this.

## Privacy

The push server never sees or stores any journal content — notes, dhikr
counts, favorites, and everything else stay exactly where they already were:
in each person's own browser storage on their own device. The server only
stores a push subscription (an opaque address the browser itself generates —
not personally identifying) and the reminder schedule someone chose (active
hours, interval, on/off). Turning reminders off removes that subscription
from the server entirely.

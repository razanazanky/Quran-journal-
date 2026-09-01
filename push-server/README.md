# Quran Journal — Push Notification Backend

This is the small backend that makes real background reminders possible — the
part a static GitHub Pages site can't do on its own. It runs on **Cloudflare
Workers**, which has a generous free tier (100,000 requests/day, way more than
a personal-scale app needs) and native support for scheduled ("Cron
Trigger") jobs.

It does three things:
1. Stores each visitor's push subscription + their chosen reminder schedule.
2. Every 15 minutes, checks whether anyone is due for a reminder right now
   (inside their active hours, and enough time passed since their last one).
3. Sends the push notification itself, using [`@pushforge/builder`](https://github.com/draphy/pushforge) —
   a library built specifically to work on Cloudflare Workers (the popular
   `web-push` npm package does **not** work here; it depends on Node-only
   crypto APIs Workers don't provide).

No journal content (notes, favorites, dhikr counts, etc.) ever touches this
server — that all still lives only in each visitor's own browser storage,
exactly as before. This server only ever sees: a push subscription (an opaque
address the browser gives you, not tied to your identity) and the reminder
schedule you chose (active hours, interval, on/off).

## One-time setup

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
and [Node.js](https://nodejs.org) installed on your computer.

```bash
cd push-server
npm install
```

### 1. Generate your VAPID keys

VAPID keys are how push services (Apple's, Google's, Mozilla's) verify that
push messages are really coming from your server and not an impersonator.
Generate your own — never reuse someone else's, and never commit the private
key to GitHub.

```bash
npm run generate-vapid
```

This prints something like:

```
Public Key:  BN8g2N...  (a long string)
Private Key: {"kty":"EC","crv":"P-256", ... }   (a JSON object)
```

Keep this terminal output somewhere safe for the next two steps.

### 2. Create the KV namespace (where subscriptions are stored)

```bash
npx wrangler login          # opens a browser to connect your Cloudflare account
npx wrangler kv namespace create SUBSCRIPTIONS
```

This prints an `id`. Open `wrangler.toml` and paste it in, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

### 3. Add your VAPID keys

Open `wrangler.toml` and:
- Replace `REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY` with the **public** key from
  step 1.
- Replace `you@example.com` in `VAPID_SUBJECT` with a real contact email (push
  services sometimes use this to reach you if something's wrong — it's not
  shown to your users).

Then set the **private** key as an encrypted secret (never put this in
`wrangler.toml` or commit it anywhere):

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

When prompted, paste the entire private key JSON object from step 1 (the
`{"kty":"EC",...}` line) as one line, then press Enter.

### 4. Deploy

```bash
npm run deploy
```

Wrangler will print your Worker's URL, something like:

```
https://quran-journal-push.YOUR-SUBDOMAIN.workers.dev
```

**Copy this URL** — you'll paste it into the front-end config next (see the
main project's `README-PWA-SETUP.md` / the `PUSH_SERVER_URL` constant near the
top of `index.html`'s script).

## Verifying it's working

- `GET https://your-worker-url/vapid-public-key` should return
  `{"publicKey":"..."}` — if you see this, deployment succeeded.
- After you enable reminders on the actual site and tap "Send me a test
  notification" (in the app's Reminders page), you should get a push within a
  few seconds. If not, run `npm run tail` in this folder while you tap the
  test button — it streams live logs from the Worker so you can see exactly
  what happened.

## Updating message wording later

There are two completely independent message pools in `src/index.js`:

- `REMINDER_MESSAGES` — the 3-hour dhikr reminders
- `DAILY_CHALLENGE_MESSAGES` and `WEEKLY_CHALLENGES` — the separate "Islamic
  Reminders & Challenges" track (daily prompts and the 8-week rotating theme)

Edit any of these lists, then run `npm run deploy` again to publish the
change — no other steps needed. Keep the tone respectful and avoid phrasing
anything as a definitive religious ruling (fiqh matters vary by school of
thought and situation) — frame prompts as gentle encouragement, the way the
existing examples do.

There's also a `/test-challenge` endpoint (used by the app's "Test daily
challenge" / "Test weekly challenge" buttons) — send it
`{"subscription": ..., "kind": "daily"}` or `{"kind": "weekly"}` to trigger
one immediately, same as `/test` does for the regular reminders.

## Costs

Everything here fits comfortably in Cloudflare's free tier for a personal or
small-community app:
- Workers: 100,000 requests/day free
- Cron Triggers: included free
- Workers KV: 100,000 reads/day and 1,000 writes/day free

If this ever grew to a very large audience, Cloudflare will simply prompt you
to upgrade to a paid plan rather than silently failing.

// Push-notification backend for the Quran Journal PWA.
//
// What this does:
//   - Stores each visitor's push subscription + reminder preferences in Workers KV.
//   - Every 15 minutes (see wrangler.toml's cron trigger), checks every stored
//     subscriber: if reminders are ON, the current time falls inside their chosen
//     active-hours window, and enough time has passed since their last reminder
//     (their chosen interval, e.g. every 3 hours), sends one push notification
//     with a randomly-picked message.
//   - Cleans up subscriptions the push service reports as gone (404/410).
//
// This file uses only the standard Web Crypto API via @pushforge/builder, which is
// specifically built to run on Cloudflare Workers (unlike the popular `web-push`
// npm package, which depends on Node-only crypto APIs Workers don't provide).

import { buildPushHTTPRequest } from "@pushforge/builder";

// ---- A varied pool of reminder messages, so people don't get the exact same
// ---- notification every time. One is picked at random on every send. ----
const REMINDER_MESSAGES = [
  { title: "🤍 Time for your dhikr", body: "A few quiet moments of remembrance can reset your whole day." },
  { title: "📖 Have you read some Qur'an today?", body: "Even a single page counts. Pick up right where you left off." },
  { title: "✨ Take a moment for your daily adhkar", body: "SubhanAllah, Alhamdulillah, Allahu Akbar — however many you can manage." },
  { title: "🤲 Don't forget your evening adhkar", body: "A perfect moment to seek Allah's protection before the night." },
  { title: "🌙 A little light for your heart", body: "Open your Quran journal for a few quiet minutes." },
  { title: "🕊️ Just a gentle reminder", body: "Your dhikr counter is waiting for you today." },
  { title: "💛 Checking in on you", body: "Have you had a moment with the Qur'an today?" },
  { title: "🌸 A moment to reflect", body: "Revisit a surah, or write a quick note in your journal." },
  { title: "📿 Your tongue, moist with dhikr", body: "The Prophet ﷺ loved hearts that stay attached to remembrance." },
  { title: "🕌 A short pause for your soul", body: "Even a few tasbeeh count. Come back to your journal." },
];

function pickRandomMessage() {
  return REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
}

// ---- Islamic Reminders & Challenges — a completely separate notification
// ---- track from the 3-hour dhikr reminders above, with its own schedule. ----
const DAILY_CHALLENGE_MESSAGES = [
  // Adhkar / general reminders
  { title: "🤍 Have you made your morning adhkar today?", body: "A few quiet moments before the day gets loud." },
  { title: "🤍 Before you continue your day, remember Allah", body: "One pause, one dhikr, one breath." },
  { title: "🤍 Take a moment to say Alhamdulillah", body: "Name one thing you're grateful for right now." },
  { title: "🕌 Have you prayed your salah on time today?", body: "A gentle check-in, nothing more." },
  { title: "📵 Put your phone down for a moment", body: "Reconnect with Allah before you scroll any further." },
  { title: "🚶 Make dhikr while you walk, drive, or wait", body: "Turn today's in-between moments into worship." },
  // Quran challenges
  { title: "📖 Take 5 minutes to read Qur'an", body: "Even a few ayat can change the shape of your day." },
  { title: "📖 Read one ayah and reflect on its meaning", body: "Slow down. Let one verse really land." },
  { title: "📖 Read a surah you haven't opened in a while", body: "Rediscover something familiar, from a new place in life." },
  { title: "📖 Read the translation of today's passage", body: "Understanding deepens what you recite." },
  { title: "📖 Memorize one short ayah today", body: "Small and steady — one verse at a time." },
  { title: "📖 Review an ayah you've already memorized", body: "Keep what you've built. Recite it once more today." },
  { title: "📖 Read Qur'an before you open social media today", body: "Let the first scroll of your day be the Book." },
  // Dua challenges
  { title: "🤲 Pause for a moment and make istighfar", body: "Astaghfirullah — a small return, repeated often." },
  { title: "🤲 Make dua for your parents today", body: "A quiet request on their behalf, whenever you remember." },
  { title: "🤲 Make dua for someone who is struggling", body: "You may never know how much it helps them." },
  { title: "🤲 Make dua for someone without telling them", body: "A secret gift between you and Allah." },
  { title: "🤲 Write down 3 things you want to ask Allah for", body: "Naming them can make dua feel more real." },
  { title: "🤲 Make a dua of gratitude", body: "Before asking for more, thank Him for what's already here." },
  // Salawat
  { title: "🤍 Send salawat upon the Prophet ﷺ", body: "Allahumma salli ala Muhammad." },
  // Good deeds
  { title: "🌱 Do one good deed secretly today", body: "Let it be just between you and Allah." },
  { title: "🌱 Give someone a genuine compliment", body: "A small kindness can carry someone's whole day." },
  { title: "🌱 Give a small sadaqah today", body: "It doesn't have to be much to count." },
  { title: "🌱 Check on someone you love", body: "A short message can mean more than you think." },
  { title: "🌱 Forgive someone today", body: "Even quietly, even just within your own heart." },
  { title: "🌱 Help your parents with something today", body: "A small act of service, offered with love." },
  // Reflection prompts (tapping opens the app to reflect)
  { title: "🧠 What is one blessing Allah gave you today?", body: "Open your journal and write it down." },
  { title: "🧠 What are you struggling to be patient with?", body: "A moment of honest reflection, just for you." },
  { title: "🧠 What is something you need to leave in Allah's hands?", body: "Write it down, then let it go." },
  { title: "🧠 What are you most grateful for right now?", body: "Take a moment. Let the answer surprise you." },
];

const WEEKLY_CHALLENGES = [
  { title: "📖 Week 1 — Qur'an Week", body: "This week's focus: read at least 1 page of Qur'an every day." },
  { title: "🤍 Week 2 — Dhikr Week", body: "This week's focus: build the habit of morning and evening adhkar." },
  { title: "🌱 Week 3 — Gratitude Week", body: "This week's focus: write 3 blessings every day." },
  { title: "💗 Week 4 — Sadaqah Week", body: "This week's focus: one small act of charity, every day." },
  { title: "🕌 Week 5 — Salah Week", body: "This week's focus: pray each salah on time." },
  { title: "🤲 Week 6 — Dua Week", body: "This week's focus: write one sincere dua every day." },
  { title: "🌸 Week 7 — Character Week", body: "This week's focus: choose one character trait to work on." },
  { title: "📵 Week 8 — Digital Detox Week", body: "This week's focus: a little less scrolling, a little more Qur'an." },
];

function pickRandomDailyChallenge() {
  return DAILY_CHALLENGE_MESSAGES[Math.floor(Math.random() * DAILY_CHALLENGE_MESSAGES.length)];
}

// ISO week number, so the weekly theme is the same for everyone in the same
// calendar week, and advances predictably from week to week.
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function currentWeeklyChallenge() {
  const week = isoWeekNumber(new Date());
  return WEEKLY_CHALLENGES[week % WEEKLY_CHALLENGES.length];
}

// CORS: allow your GitHub Pages site to call this Worker from the browser.
// Change "*" to your exact site origin (e.g. "https://yourname.github.io") once
// you know it, for tighter security — "*" works fine to get started.
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Subscriptions are keyed by a short hash of their endpoint URL, so the same
// device/browser subscription always maps to the same KV key (re-subscribing
// updates the existing record instead of creating duplicates).
async function keyForSubscription(subscription) {
  const enc = new TextEncoder().encode(subscription.endpoint);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return "sub:" + hex.slice(0, 40);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizePrefs(prefs) {
  prefs = prefs || {};
  const challengeMode = ["off", "daily", "weekly", "both"].includes(prefs.challengeMode) ? prefs.challengeMode : "off";
  return {
    enabled: !!prefs.enabled,
    // Hour-of-day, 0-23, in the subscriber's own timezone.
    activeStartHour: clampInt(prefs.activeStartHour, 0, 23, 7),
    activeEndHour: clampInt(prefs.activeEndHour, 0, 23, 21),
    // Minimum 1 hour between reminders, to prevent accidental/abusive spam and
    // keep this comfortably inside Cloudflare's free tier.
    intervalHours: clampInt(prefs.intervalHours, 1, 12, 3),
    // IANA timezone name, e.g. "Europe/London". Falls back to UTC if missing/invalid.
    timezone: typeof prefs.timezone === "string" && prefs.timezone ? prefs.timezone : "UTC",

    // ---- Islamic Reminders & Challenges — a fully separate track ----
    // "off" | "daily" | "weekly" | "both"
    challengeMode,
    // Hour-of-day this fires at (a single specific hour, not a repeating interval).
    challengeHour: clampInt(prefs.challengeHour, 0, 23, 9),
    // Day of week the *weekly* challenge is sent, 0=Sunday .. 6=Saturday.
    challengeWeekday: clampInt(prefs.challengeWeekday, 0, 6, 1), // default Monday
  };
}

async function handleSubscribe(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.subscription || !body.subscription.endpoint) {
    return json({ error: "Missing subscription" }, 400);
  }
  const prefs = sanitizePrefs(body.prefs);
  const key = await keyForSubscription(body.subscription);
  const existingRaw = await env.SUBSCRIPTIONS.get(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  const record = {
    subscription: body.subscription,
    prefs,
    // Preserve every "last sent" timestamp across preference updates so changing
    // your schedule doesn't immediately trigger a new push on either track.
    lastSentAt: existing ? existing.lastSentAt : null,
    lastDailyChallengeAt: existing ? existing.lastDailyChallengeAt : null,
    lastWeeklyChallengeAt: existing ? existing.lastWeeklyChallengeAt : null,
    updatedAt: Date.now(),
  };
  await env.SUBSCRIPTIONS.put(key, JSON.stringify(record));
  return json({ ok: true });
}

async function handleUnsubscribe(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.subscription || !body.subscription.endpoint) {
    return json({ error: "Missing subscription" }, 400);
  }
  const key = await keyForSubscription(body.subscription);
  await env.SUBSCRIPTIONS.delete(key);
  return json({ ok: true });
}

async function sendPushTo(env, subscription, message, targetUrl) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_KEY),
    subscription,
    message: {
      payload: {
        title: message.title,
        body: message.body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-96.png",
        url: targetUrl || "./index.html",
      },
      adminContact: env.VAPID_SUBJECT,
      options: { ttl: 3600, urgency: "normal" },
    },
  });
  return fetch(endpoint, { method: "POST", headers, body });
}

async function handleTestPush(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.subscription || !body.subscription.endpoint) {
    return json({ error: "Missing subscription" }, 400);
  }
  try {
    const res = await sendPushTo(env, body.subscription, pickRandomMessage(), "./index.html");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json({ ok: false, status: res.status, detail: text }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function currentLocalHour(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    let hour = hourPart ? parseInt(hourPart.value, 10) : new Date().getUTCHours();
    if (hour === 24) hour = 0; // some locales format midnight as "24"
    return hour;
  } catch (err) {
    // Invalid/unsupported timezone string — fall back to UTC rather than failing.
    return new Date().getUTCHours();
  }
}

function isWithinActiveHours(hour, startHour, endHour) {
  if (startHour === endHour) return true; // 24/7 if start === end
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Window wraps past midnight, e.g. 22 -> 2
  return hour >= startHour || hour < endHour;
}

async function trySend(env, key, record, message, targetUrl) {
  try {
    const res = await sendPushTo(env, record.subscription, message, targetUrl);
    if (res.status === 404 || res.status === 410) {
      // The push service confirms this subscription no longer exists
      // (uninstalled, permission revoked, etc.) — clean it up.
      await env.SUBSCRIPTIONS.delete(key);
      return "removed";
    }
    return res.ok ? "sent" : "failed";
  } catch (err) {
    // Network/encryption error for this one subscriber — skip it this round,
    // try again on the next scheduled tick rather than failing the whole batch.
    console.warn("Failed to send push for", key, err);
    return "failed";
  }
}

async function runScheduledCheck(env) {
  const now = Date.now();
  const nowDate = new Date();
  let cursor;
  let processed = 0;
  let sentGeneral = 0;
  let sentChallenge = 0;
  let removed = 0;

  do {
    const page = await env.SUBSCRIPTIONS.list({ cursor, limit: 1000 });
    cursor = page.cursor;

    for (const { name: key } of page.keys) {
      processed++;
      const raw = await env.SUBSCRIPTIONS.get(key);
      if (!raw) continue;
      let record;
      try {
        record = JSON.parse(raw);
      } catch (err) {
        continue;
      }
      const prefs = record.prefs;
      if (!prefs) continue;

      const hour = currentLocalHour(prefs.timezone);
      let dirty = false;
      let removedThisRecord = false;

      // ---- Track 1: the general "every N hours" dhikr reminder ----
      if (prefs.enabled && isWithinActiveHours(hour, prefs.activeStartHour, prefs.activeEndHour)) {
        const intervalMs = prefs.intervalHours * 60 * 60 * 1000;
        if (!record.lastSentAt || now - record.lastSentAt >= intervalMs) {
          const result = await trySend(env, key, record, pickRandomMessage(), "./index.html");
          if (result === "removed") { removed++; removedThisRecord = true; }
          else if (result === "sent") { record.lastSentAt = now; dirty = true; sentGeneral++; }
        }
      }

      // ---- Track 2: Islamic Reminders & Challenges (fully separate schedule) ----
      if (!removedThisRecord && prefs.challengeMode && prefs.challengeMode !== "off" && hour === prefs.challengeHour) {
        const dayKey = nowDate.toISOString().split("T")[0]; // e.g. "2026-08-31", in UTC — good enough to dedupe "once per day"
        const alreadySentToday = record.lastDailyChallengeAt && new Date(record.lastDailyChallengeAt).toISOString().split("T")[0] === dayKey;

        if ((prefs.challengeMode === "daily" || prefs.challengeMode === "both") && !alreadySentToday) {
          const result = await trySend(env, key, record, pickRandomDailyChallenge(), "./index.html?open=challenges");
          if (result === "removed") { removed++; removedThisRecord = true; }
          else if (result === "sent") { record.lastDailyChallengeAt = now; dirty = true; sentChallenge++; }
        }

        const localWeekday = (() => {
          try {
            const parts = new Intl.DateTimeFormat("en-US", { timeZone: prefs.timezone, weekday: "short" }).format(nowDate);
            return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts);
          } catch (err) {
            return nowDate.getUTCDay();
          }
        })();
        const weekKey = isoWeekNumber(nowDate) + "-" + nowDate.getUTCFullYear();
        const alreadySentThisWeek = record.lastWeeklyChallengeAt &&
          (isoWeekNumber(new Date(record.lastWeeklyChallengeAt)) + "-" + new Date(record.lastWeeklyChallengeAt).getUTCFullYear()) === weekKey;

        if (!removedThisRecord && (prefs.challengeMode === "weekly" || prefs.challengeMode === "both") &&
            localWeekday === prefs.challengeWeekday && !alreadySentThisWeek) {
          const result = await trySend(env, key, record, currentWeeklyChallenge(), "./index.html?open=challenges");
          if (result === "removed") { removed++; removedThisRecord = true; }
          else if (result === "sent") { record.lastWeeklyChallengeAt = now; dirty = true; sentChallenge++; }
        }
      }

      if (dirty && !removedThisRecord) {
        await env.SUBSCRIPTIONS.put(key, JSON.stringify(record));
      }
    }
  } while (cursor);

  console.log(`Scheduled check: processed=${processed} sentGeneral=${sentGeneral} sentChallenge=${sentChallenge} removed=${removed}`);
}

async function handleTestChallenge(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.subscription || !body.subscription.endpoint) {
    return json({ error: "Missing subscription" }, 400);
  }
  try {
    const message = body.kind === "weekly" ? currentWeeklyChallenge() : pickRandomDailyChallenge();
    const res = await sendPushTo(env, body.subscription, message, "./index.html?open=challenges");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json({ ok: false, status: res.status, detail: text }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/vapid-public-key" && request.method === "GET") {
      return json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      return handleUnsubscribe(request, env);
    }

    if (url.pathname === "/test" && request.method === "POST") {
      return handleTestPush(request, env);
    }

    if (url.pathname === "/test-challenge" && request.method === "POST") {
      return handleTestChallenge(request, env);
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledCheck(env));
  },
};

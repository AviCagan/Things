# Backend setup

The app runs **without any of this** — it falls back to on-device storage and
shows a "not syncing yet" banner. Do this when you want Avi's and Jackie's
phones to share the same lists.

Roughly 15 minutes, once.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier is plenty).
2. New project → pick any name and a strong database password → wait ~2 min.
3. **Settings → API** — copy the **Project URL** and the **anon public** key.

## 2. Run the SQL

Open **SQL Editor** and run these in order, each as its own query:

| File | What it does |
|---|---|
| `001_schema.sql` | Tables, the `compute_next_due` trigger, indexes |
| `002_rls.sql` | Locks the database to authenticated sessions only |
| `003_realtime.sql` | Turns on live sync (and the `REPLICA IDENTITY FULL` that makes deletes sync) |
| `004_seed.sql` | Creates the Avi and Jackie profiles |

## 3. Create the household account

This is what the PIN unlocks. **Authentication → Users → Add user**:

- Email: `household@things.local`
- Password: `things-household-0926`
- Tick **Auto Confirm User**

The password is your PIN `0926` with a fixed prefix, because Supabase requires
at least 6 characters. You type only the four digits; the app adds the rest. If
you ever change the PIN in the app, change this password to match.

### Then close the door behind you

**Authentication → Providers → Email → turn OFF "Enable email signups".**

Don't skip this. The anon key is public — it ships inside the JavaScript that
GitHub Pages serves to anyone. With signups enabled, someone could use that key
to create their own account, and that account would then pass the
`authenticated` check and walk straight past your PIN. Turning signups off is
what actually makes the PIN mean something.

While you're there, **Authentication → Rate Limits** — lowering the sign-in
limit directly slows down anyone trying to guess a 4-digit code.

## 4. Add the keys to GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL from step 1 |
| `VITE_SUPABASE_ANON_KEY` | anon public key from step 1 |
| `VITE_HOUSEHOLD_EMAIL` | `household@things.local` |

Then **Settings → Pages → Source: GitHub Actions**. Push to the branch and the
site deploys itself.

> These are not really secrets. `VITE_`-prefixed values get compiled into the
> public JavaScript bundle. Using Actions secrets keeps them out of the git
> history, nothing more — the database is protected by step 3, not by hiding
> this key.

## 5. Install on the phones

- **Jackie (iPhone):** open the Pages URL in Safari → Share → **Add to Home
  Screen** → open it from that icon. Enter `0926` once.
- **Avi (Android):** run the **Build Android APK** workflow (Actions → Run
  workflow), download the artifact, install it. Enter `0926` once.

Each device asks for the PIN exactly once, ever. After that it's tap-your-name.

---

## Notifications (optional)

Everything above works without this. Add it when you want alerts.

### Web Push keys (Jackie)

```bash
npx web-push generate-vapid-keys
```

Add the **public** key as a GitHub secret `VITE_VAPID_PUBLIC_KEY`, and keep the
private key for the next step.

### FCM (Avi)

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com).
2. Add an **Android** app with package name `com.avicagan.things`.
3. Download `google-services.json` → paste its contents into a GitHub secret
   named `GOOGLE_SERVICES_JSON`.
4. **Project settings → Service accounts → Generate new private key** — that
   JSON goes into the Edge Function below.

### Deploy the sender

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set \
  VAPID_PUBLIC_KEY='<public key>' \
  VAPID_PRIVATE_KEY='<private key>' \
  VAPID_SUBJECT='mailto:you@example.com' \
  FCM_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"

supabase functions deploy notify --no-verify-jwt
```

Finally, edit `005_notifications.sql` — replace `<PROJECT_REF>` and
`<SERVICE_ROLE_KEY>` (Settings → API → `service_role`, this one **is** a real
secret) — and run it in the SQL editor.

Then in the app: **Settings → Notifications → Turn on notifications**, on each
phone.

### What to expect

- **Avi's APK** gets real push, arriving with the app fully closed. Chore
  cooldown reminders are scheduled on-device, so they work offline and fire at
  the exact minute.
- **Jackie's iPhone** gets Web Push, which is real but conditional: it only
  works from the Home Screen icon, stops if that icon is deleted, and Apple
  throttles delivery for apps left unused for long stretches. Fine for daily
  use, but it is not the guarantee a text message would be. If it disappoints,
  the `phone_e164` column and the sender's structure are already in place to
  add SMS as a second channel.

---

## Costs

Free. Supabase's free tier covers this easily, Firebase push is free at any
household volume, and the maps stack uses no paid API.

One quirk worth knowing: **Supabase pauses free projects after ~7 days of
inactivity.** Daily use never trips it, but come back from a two-week holiday
and the first launch may need an unpause from the dashboard.

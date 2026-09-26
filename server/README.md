# GST Billing sync server

FastAPI server that stores each user's app data in Supabase so the same Google
account gets its business and bills back on a new phone.

## Deploy on Railway
1. New Project → Deploy from GitHub repo → `gst-billing`.
2. Service → Settings → **Root Directory** = `server`.
3. Variables:
   - `DATABASE_URL` = Supabase → Connect → **Session pooler** URI (with your DB password)
   - `FIREBASE_PROJECT_ID` = `gst-billing-6af3d`
4. Settings → Networking → **Generate Domain**. Put that URL in the app's `src/config.ts` (`SYNC_URL`).
5. Open `https://<domain>/health` → should show `{"ok": true}`.

The table `sync_records` is created automatically on first start (with row level
security on, so it is not readable through Supabase's public API).

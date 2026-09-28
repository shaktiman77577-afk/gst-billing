# GST Billing — Play Store release guide (v1.0.0)

## A. Supabase (ek baar)
1. SQL Editor → `supabase/app_config.sql` chalao (force update settings).
2. Edge Functions → New function **delete-account** → `supabase/functions/delete-account/index.ts` paste → Deploy.
3. (Optional) `verify-payment` ka naya version deploy (v1.1.0 ke liye zaroori).

## B. Upload key (sirf EK baar)
1. GitHub → Actions → **Generate upload keystore (run ONCE)** → Run workflow.
2. Run khatam hone pe neeche **upload-keystore-KEEP-PRIVATE** download karo.
   Isme `upload.keystore`, `upload.keystore.base64`, `SECRETS.txt` hain.
3. Teeno files **Google Drive** mein safe rakho. Ye kho gayi toh app update nahi hoga.
4. GitHub → Settings → Secrets and variables → Actions → New secret (4 secrets, `SECRETS.txt` mein likhe hain):
   - `GST_UPLOAD_KEYSTORE_BASE64` = `upload.keystore.base64` ka poora text
   - `GST_UPLOAD_STORE_PASSWORD`, `GST_UPLOAD_KEY_PASSWORD`, `GST_UPLOAD_KEY_ALIAS` (= upload)
5. Run page se artifact **delete** kar do.

## C. AAB banana
GitHub → Actions → **Release AAB (Play Store)** → Run workflow → `gst-billing-aab` download.

## D. Google login (bahut zaroori)
Firebase Console → Project settings → Android app `com.gstbilling.invoicemaker` → **Add fingerprint**:
1. Upload key ka SHA-1 (keystore workflow ke log mein dikhta hai).
2. Play Console → Test and release → App integrity → **App signing key certificate** ka SHA-1.
Dono add karke naya `google-services.json` download karo aur repo mein replace karo, phir AAB dobara banao.
Bina iske Play Store wale app mein Google login fail hoga.

## E. Play Console
- Create app → GST Billing, App, Free.
- Store listing: short + full description, icon 512×512, feature graphic 1024×500, 2–8 screenshots.
- Privacy policy: `https://selectionlab.in/gst-billing/privacy.html`
- Account deletion URL (Data safety me): `https://selectionlab.in/gst-billing/delete-account.html`
- Ads: No · Target audience: 18+ · Content rating questionnaire.
- App access: reviewer ke liye "Sign in with any Google account" likh do.
- Data safety: Collected — Name, Email (Account), User IDs/Device ID (App functionality),
  Financial info → "Other financial info" (bills/payments, App functionality),
  Photos (logo/signature, optional). Encrypted in transit: Yes. Users can request deletion: Yes. Not shared, not sold.
- Personal developer account (Nov 2023 ke baad bana) ho toh: **Closed testing, 12 testers, 14 din**, phir Production.

## F. Force update kaise chalayein
Supabase → Table Editor → `app_config` (row id 1):
- `latest_version_code` = naya versionCode → purane app mein "Update available" popup.
- `min_version_code` = naya versionCode → purane app **band** ("Please update").
- ⚠️ `min_version_code` sirf tab badhao jab naya version Play Store pe **live** ho jaye.
- versionCode: v1.0.0 = **100**, v1.1.0 = **110**.

// Supabase Edge Function: delete-account
//
// Permanently deletes the calling user's account and cloud data:
//   • daily backup files (storage bucket "backups", folder <user_id>/)
//   • rows in backups, sync_rows, active_devices, devices, business_profiles
//   • the auth user itself
// Payment records (memberships / payment orders) are kept only where the
// law requires them; the auth user deletion cascades everything else.
//
// Deploy: Dashboard → Edge Functions → New function "delete-account",
// paste this file, Deploy. Uses the built-in SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is asking? (the user's own JWT from the app)
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: who, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !who?.user) return json({ error: "not_authenticated" }, 401);
  const uid = who.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    // 1) Backup files in storage (folder = user id).
    const bucket = admin.storage.from("backups");
    for (let round = 0; round < 20; round++) {
      const { data: files, error } = await bucket.list(uid, { limit: 100 });
      if (error || !files || files.length === 0) break;
      const paths = files.map((f) => `${uid}/${f.name}`);
      const { error: rmErr } = await bucket.remove(paths);
      if (rmErr) throw rmErr;
      if (files.length < 100) break;
    }

    // 2) Data tables (ignore tables that do not exist in this project).
    for (const table of ["sync_rows", "backups", "active_devices", "devices", "business_profiles"]) {
      const { error } = await admin.from(table).delete().eq("user_id", uid);
      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
    }

    // 3) The login account itself.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return json({ ok: true });
  } catch (e) {
    return json({ error: "delete_failed", detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ============================================================================
// verify-payment — Supabase Edge Function
//
// Authenticated POST { razorpay_order_id, razorpay_payment_id,
// razorpay_signature, plan_id } → verifies the Razorpay payment signature,
// re-checks the amount server-side against the Razorpay order AND the DB
// plan price, then upserts the user's membership row using the SERVICE_ROLE
// key (bypasses RLS — clients have no write access to public.memberships).
//
// Deploy: Supabase dashboard → Edge Functions → New function → name it
// "verify-payment" → paste this whole file into index.ts → Deploy.
// Secrets (dashboard → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-provided.
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function getUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || typeof user.id !== "string") return null;
  return user;
}

async function getPlan(
  supabaseUrl: string,
  anonKey: string,
  planId: string,
): Promise<{ id: string; price_paise: number; duration_days: number } | null> {
  const url =
    `${supabaseUrl}/rest/v1/plans?id=eq.${encodeURIComponent(planId)}` +
    `&is_active=eq.true&select=id,price_paise,duration_days`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const plan = rows[0];
  if (
    typeof plan.id !== "string" ||
    typeof plan.price_paise !== "number" ||
    typeof plan.duration_days !== "number"
  ) {
    return null;
  }
  return plan;
}

// Timing-safe string comparison: no early exit, accumulates differences so
// the runtime doesn't depend on where the first mismatch is.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${orderId}|${paymentId}`);
  const mac = await crypto.subtle.sign("HMAC", key, data);
  const hex = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, signature);
}

// Plan id of the Yearly plan (see supabase/membership.sql).
const YEARLY_PLAN_ID = "pro_yearly";

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        { error: "Supabase environment not configured" },
        500,
      );
    }

    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return jsonResponse(
        {
          error:
            "Razorpay keys not configured on the server (add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as edge function secrets)",
        },
        500,
      );
    }

    // 1. Authenticate the caller
    const user = await getUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // 2. Parse + validate required fields
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<
      string,
      unknown
    >;
    const razorpay_order_id = b.razorpay_order_id;
    const razorpay_payment_id = b.razorpay_payment_id;
    const razorpay_signature = b.razorpay_signature;
    const plan_id = b.plan_id;
    if (
      typeof razorpay_order_id !== "string" ||
      razorpay_order_id.length === 0 ||
      typeof razorpay_payment_id !== "string" ||
      razorpay_payment_id.length === 0 ||
      typeof razorpay_signature !== "string" ||
      razorpay_signature.length === 0 ||
      typeof plan_id !== "string" ||
      plan_id.length === 0
    ) {
      return jsonResponse(
        {
          error:
            "razorpay_order_id, razorpay_payment_id, razorpay_signature and plan_id are required",
        },
        400,
      );
    }

    // 3. Verify the Razorpay signature (HMAC-SHA256, timing-safe compare)
    const signatureOk = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      RAZORPAY_KEY_SECRET,
    );
    if (!signatureOk) {
      return jsonResponse({ error: "invalid signature" }, 400);
    }

    // 4. Re-fetch the plan price server-side
    const plan = await getPlan(SUPABASE_URL, SUPABASE_ANON_KEY, plan_id);
    if (!plan) {
      return jsonResponse({ error: "plan not found or inactive" }, 404);
    }

    // 5. Re-check the amount server-side against the Razorpay order itself
    const basic = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${basic}` },
      },
    );
    if (!orderRes.ok) {
      return jsonResponse({ error: "could not verify payment order" }, 400);
    }
    const order = await orderRes.json();
    if (
      !order ||
      typeof order.amount !== "number" ||
      order.amount !== plan.price_paise ||
      (order.status !== "paid" && order.status !== "attempted")
    ) {
      return jsonResponse({ error: "payment amount mismatch" }, 400);
    }

    // 6. Upsert the membership row with the SERVICE_ROLE key (bypasses RLS).
    //    Existing active row → extend expires_at; otherwise create a new row.
    const svcHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    let existing: { id: string; expires_at: string; plan_id: string } | null = null;
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}` +
        `&status=eq.active&select=id,expires_at,plan_id`,
      { method: "GET", headers: svcHeaders },
    );
    if (existingRes.ok) {
      const rows = await existingRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        existing = rows[0];
      }
    }

    const now = new Date();
    const baseMs = existing
      ? Math.max(now.getTime(), new Date(existing.expires_at).getTime())
      : now.getTime();
    const newExpires = new Date(baseMs + plan.duration_days * 86400000).toISOString();

    // A shorter plan bought on top of an active Yearly plan only adds days:
    // the membership stays Yearly (Yearly-only features like the recycle bin
    // keep working). The plan is upgraded when the new plan is longer.
    const keepPlan = (current: { plan_id?: string } | null): string =>
      current?.plan_id === YEARLY_PLAN_ID && plan.id !== YEARLY_PLAN_ID ? YEARLY_PLAN_ID : plan.id;

    let upsertRes: Response;
    if (existing) {
      // Extend the existing active row (stacked renewals keep leftover days).
      upsertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/memberships?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: "PATCH",
          headers: svcHeaders,
          body: JSON.stringify({
            plan_id: keepPlan(existing),
            expires_at: newExpires,
            razorpay_payment_id,
            razorpay_order_id,
          }),
        },
      );
    } else {
      upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/memberships`, {
        method: "POST",
        headers: svcHeaders,
        body: JSON.stringify({
          user_id: user.id,
          plan_id: plan.id,
          status: "active",
          expires_at: newExpires,
          razorpay_payment_id,
          razorpay_order_id,
        }),
      });
    }

    // 409: a concurrent request won the race and created the active row
    // (partial unique index). Re-read and extend that row instead.
    if (upsertRes.status === 409) {
      const retryRes = await fetch(
        `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${encodeURIComponent(user.id)}` +
          `&status=eq.active&select=id,expires_at,plan_id`,
        { method: "GET", headers: svcHeaders },
      );
      if (!retryRes.ok) {
        return jsonResponse({ error: "membership conflict" }, 409);
      }
      const rows = await retryRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return jsonResponse({ error: "membership conflict" }, 409);
      }
      const winner = rows[0];
      const retryBaseMs = Math.max(
        now.getTime(),
        new Date(winner.expires_at).getTime(),
      );
      const retryExpires = new Date(
        retryBaseMs + plan.duration_days * 86400000,
      ).toISOString();
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/memberships?id=eq.${encodeURIComponent(winner.id)}`,
        {
          method: "PATCH",
          headers: svcHeaders,
          body: JSON.stringify({
            plan_id: keepPlan(winner),
            expires_at: retryExpires,
            razorpay_payment_id,
            razorpay_order_id,
          }),
        },
      );
      if (!patchRes.ok) {
        return jsonResponse({ error: "could not update membership" }, 500);
      }
      const patched = (await patchRes.json()) as Array<{ expires_at: string }>;
      return jsonResponse({
        ok: true,
        expires_at: patched[0]?.expires_at ?? retryExpires,
        plan_id: plan.id,
      });
    }

    if (!upsertRes.ok) {
      const detail = await upsertRes.text().catch(() => "");
      console.error("membership upsert failed:", upsertRes.status, detail);
      return jsonResponse({ error: "could not update membership" }, 500);
    }

    const saved = (await upsertRes.json()) as Array<{ expires_at: string }>;
    return jsonResponse({
      ok: true,
      expires_at: saved[0]?.expires_at ?? newExpires,
      plan_id: plan.id,
    });
  } catch (err) {
    console.error("verify-payment unexpected error:", err);
    const message = err instanceof Error ? err.message : "internal error";
    return jsonResponse({ error: message }, 500);
  }
});

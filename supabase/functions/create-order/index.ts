// ============================================================================
// create-order — Supabase Edge Function
//
// Authenticated POST { plan_id } → creates a Razorpay order server-side and
// returns it to the app. The plan price is ALWAYS read from the database;
// a client-sent amount is never trusted.
//
// Deploy: Supabase dashboard → Edge Functions → New function → name it
// "create-order" → paste this whole file into index.ts → Deploy.
// Secrets (dashboard → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// SUPABASE_URL and SUPABASE_ANON_KEY are auto-provided by the platform.
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

// Verifies the caller's JWT against Supabase Auth. Returns the user object
// ({ id, ... }) or null when the token is missing/invalid.
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

// Fetches an ACTIVE plan row server-side. Never trust a client-sent amount.
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
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse(
        { error: "Supabase environment not configured" },
        500,
      );
    }

    // 1. Authenticate the caller
    const user = await getUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // 2. Parse + validate the plan_id
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }
    const planId =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).plan_id
        : undefined;
    if (typeof planId !== "string" || planId.length === 0) {
      return jsonResponse({ error: "plan_id is required" }, 400);
    }

    // 3. Read the price server-side (never from the client)
    const plan = await getPlan(SUPABASE_URL, SUPABASE_ANON_KEY, planId);
    if (!plan) {
      return jsonResponse({ error: "plan not found or inactive" }, 404);
    }

    // 4. Razorpay credentials must be configured as function secrets
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return jsonResponse(
        { error: "Razorpay keys not configured on the server" },
        500,
      );
    }

    // 5. Create the Razorpay order (amount in integer paise)
    const basic = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: plan.price_paise,
        currency: "INR",
        receipt: `mem_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { user_id: user.id, plan_id: plan.id },
      }),
    });

    if (!orderRes.ok) {
      const detail = await orderRes.text().catch(() => "");
      console.error("Razorpay order creation failed:", orderRes.status, detail);
      return jsonResponse(
        { error: "failed to create payment order" },
        502,
      );
    }

    const order = await orderRes.json();
    if (!order || typeof order.id !== "string") {
      return jsonResponse({ error: "invalid order response" }, 502);
    }

    // 6. Hand the order back to the app for Razorpay checkout
    return jsonResponse({
      order_id: order.id,
      amount_paise: plan.price_paise,
      key_id: RAZORPAY_KEY_ID,
      plan_id: plan.id,
      currency: "INR",
    });
  } catch (err) {
    console.error("create-order unexpected error:", err);
    const message = err instanceof Error ? err.message : "internal error";
    return jsonResponse({ error: message }, 500);
  }
});

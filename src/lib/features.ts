// Product switches that change between releases.
//
// v1.0.0 — launch: everything free and unlocked. No membership, plans,
//          prices, locks or Razorpay anywhere in the app.
// v1.1.0 — set MONETIZATION_ENABLED = true: membership, Razorpay checkout,
//          Pro / Yearly locks and the free trial come back (the code for all
//          of it stays in the app, only hidden by this switch).
export const MONETIZATION_ENABLED = false;

// Ambient types for react-native-razorpay (the package ships no .d.ts).
// The module is only ever imported lazily inside membership.startUpgrade,
// so these types purely satisfy the compiler — the native module is loaded
// at runtime by Metro after `npm install` + prebuild.
declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    key: string;
    order_id?: string;
    amount: string;
    currency: string;
    name: string;
    description?: string;
    image?: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
    [key: string]: unknown;
  }

  export interface RazorpaySuccessResult {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResult {
    code: number;
    description: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResult>;
    onExternalWalletSelection(callback: (data: unknown) => void): void;
  };

  export default RazorpayCheckout;
}

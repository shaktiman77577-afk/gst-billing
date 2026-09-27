// Google login via Supabase Auth.
//
// The Google ID token comes from @react-native-google-signin/google-signin
// (unchanged), but instead of Firebase we hand it to Supabase:
//   supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
// The Supabase session is persisted with AsyncStorage (see src/lib/supabase.ts),
// so the user stays logged in across restarts, and every Supabase request
// (storage, RLS) is authenticated as this user.
//
// Dashboard prerequisite (done once by the owner):
//   Supabase → Authentication → Providers → Google → ON, with the Client ID
//   and Client Secret of the Google Cloud OAuth "Web client" (the same
//   GOOGLE_WEB_CLIENT_ID below works — its audience matches the token).
//
// Firebase note: @react-native-firebase/* stays installed for now so the
// (currently disabled) record-sync engine still compiles. It is no longer
// used for login. It can be removed together with the Firebase→Supabase
// server change when cloud sync is switched on (see NOTES.md).
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import { supabase } from './supabase';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

export type GoogleLoginResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; reason: 'cancelled' | 'noPlayServices' | 'noInternet' | 'failed'; detail?: string };

export async function loginWithGoogle(): Promise<GoogleLoginResult> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response: any = await GoogleSignin.signIn();
    if (response?.type === 'cancelled') return { ok: false, reason: 'cancelled' };

    // Newer versions return { data: { idToken } }, older ones { idToken }.
    const idToken: string | undefined = response?.data?.idToken ?? response?.idToken;
    if (!idToken) return { ok: false, reason: 'failed', detail: 'no idToken' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error || !data.user) {
      return { ok: false, reason: 'failed', detail: error?.message ?? 'supabase sign-in failed' };
    }
    const email =
      data.user.email ?? response?.data?.user?.email ?? response?.user?.email ?? '';
    return { ok: true, uid: data.user.id, email };
  } catch (error: any) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      if (error.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled' };
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, reason: 'noPlayServices' };
      }
    }
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '');
    if (code.includes('network') || message.toLowerCase().includes('network')) {
      return { ok: false, reason: 'noInternet' };
    }
    // Shown on screen to help find setup problems (e.g. a Supabase dashboard
    // provider misconfiguration surfaces here).
    return { ok: false, reason: 'failed', detail: code || message };
  }
}

export async function logoutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore (e.g. offline)
  }
}

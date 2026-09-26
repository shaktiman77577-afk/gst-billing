import {
  GoogleAuthProvider,
  getAuth,
  signInWithCredential,
  signOut,
} from '@react-native-firebase/auth';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

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

    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(getAuth(), credential);
    const email = result.user.email ?? response?.data?.user?.email ?? '';
    return { ok: true, uid: result.user.uid, email };
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
    // Shown on screen to help find setup problems (e.g. code 10 = SHA-1 mismatch).
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
    await signOut(getAuth());
  } catch {
    // ignore (e.g. offline)
  }
}

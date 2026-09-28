// Keeps "one active phone per account" enforced while the app runs.
//
// - App start and every return to the foreground: ask the server whether
//   this phone is still the active one. Replaced → log out and wipe.
// - Sync / backup code reports a refused upload the same way.
// - Accounts from before this feature have no active phone yet: this phone
//   claims it quietly.
import { router } from 'expo-router';
import { ReactNode, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { AppAlert } from '../components/AppDialog';
import { useApp } from '../context/AppContext';
import { checkThisDevice, claimThisDevice, onDeviceReplaced, reportDeviceReplaced } from './device';

export function SyncProvider({ children }: { children: ReactNode }) {
  const { userId, forceLogout, t } = useApp();
  const busy = useRef(false);

  // Replaced → wipe this phone and go to login.
  useEffect(
    () =>
      onDeviceReplaced(() => {
        void (async () => {
          await forceLogout();
          router.replace('/login');
          AppAlert.alert(t('v2_replacedTitle'), t('v2_replacedMsg'), undefined, { tone: 'warning' });
        })();
      }),
    [forceLogout, t],
  );

  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const s = await checkThisDevice();
        if (s === 'replaced') reportDeviceReplaced();
        else if (s === 'none') await claimThisDevice();
      } finally {
        busy.current = false;
      }
    };
    void check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void check();
    });
    return () => sub.remove();
  }, [userId]);

  return <>{children}</>;
}

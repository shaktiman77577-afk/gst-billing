// App-styled replacement for React Native's Alert.alert.
//
// Same call shape, so screens only swap `Alert.alert(` for `AppAlert.alert(`:
//   AppAlert.alert(title, message?, buttons?, options?)
// Buttons keep their meaning: style 'cancel' → outline, 'destructive' → red,
// anything else → primary. A dialog with a destructive button gets a red
// warning icon; options.tone adds an error / success icon.
//
// <DialogHost /> is mounted once in app/_layout.tsx. Calls made while a
// dialog is open are queued and shown one after another.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, text } from '../theme';
import { Text } from './Text';

export type DialogButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};
export type DialogOptions = {
  cancelable?: boolean;
  tone?: 'error' | 'success' | 'warning';
};
type Request = { title: string; message?: string; buttons?: DialogButton[]; options?: DialogOptions };

const queue: Request[] = [];
let show: ((r: Request | null) => void) | null = null;
let open = false;

function next() {
  if (!show) {
    // Host not mounted yet — keep the queue; it is drained on mount.
    open = false;
    return;
  }
  const r = queue.shift() ?? null;
  open = !!r;
  show(r);
}

export const AppAlert = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void {
    queue.push({ title, message, buttons, options });
    if (!open) next();
  },
};

const TONE = {
  warning: { icon: 'warning-outline', fg: colors.danger, bg: colors.dangerSoft },
  error: { icon: 'close-circle-outline', fg: colors.danger, bg: colors.dangerSoft },
  success: { icon: 'checkmark-circle-outline', fg: colors.success, bg: colors.successSoft },
} as const;

export function DialogHost() {
  const { t } = useApp();
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    show = setReq;
    if (!open && queue.length) next();
    return () => {
      show = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!req) return null;

  const buttons: DialogButton[] = req.buttons?.length ? req.buttons : [{ text: t('v2_ok') }];
  // Cancel goes first (left) in a row, last in a column.
  const cancel = buttons.filter((b) => b.style === 'cancel');
  const rest = buttons.filter((b) => b.style !== 'cancel');
  const stacked = buttons.length > 2;
  const ordered = stacked ? [...rest, ...cancel] : [...cancel, ...rest];
  const toneKey = req.options?.tone ?? (buttons.some((b) => b.style === 'destructive') ? 'warning' : null);
  const tone = toneKey ? TONE[toneKey] : null;

  const press = (b?: DialogButton) => {
    setReq(null);
    // Let the dialog close before the action runs (it may open another one).
    setTimeout(() => {
      b?.onPress?.();
      next();
    }, 0);
  };

  const onBack = () => {
    if (cancel.length) press(cancel[0]);
    else if (buttons.length === 1 || req.options?.cancelable) press(buttons.length === 1 ? buttons[0] : undefined);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onBack}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          {tone ? (
            <View style={[styles.icon, { backgroundColor: tone.bg }]}>
              <Ionicons name={tone.icon} size={22} color={tone.fg} />
            </View>
          ) : null}
          <View style={styles.texts}>
            <Text style={styles.title}>{req.title}</Text>
            {req.message ? <Text style={styles.message}>{req.message}</Text> : null}
          </View>
          <View style={stacked ? styles.column : styles.row}>
            {ordered.map((b, i) => {
              const kind = b.style === 'cancel' ? 'cancel' : b.style === 'destructive' ? 'danger' : 'primary';
              return (
                <Pressable
                  key={`${b.text ?? ''}-${i}`}
                  onPress={() => press(b)}
                  style={({ pressed }) => [
                    styles.btn,
                    !stacked && styles.btnFlex,
                    kind === 'cancel' && styles.btnCancel,
                    kind === 'danger' && styles.btnDanger,
                    kind === 'primary' && styles.btnPrimary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[styles.btnText, { color: kind === 'cancel' ? colors.text : colors.white }]}
                    numberOfLines={1}
                  >
                    {b.text ?? t('v2_ok')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  icon: { width: 40, height: 40, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  texts: { gap: 6 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  message: { fontSize: text.md, lineHeight: 20, color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.sm },
  column: { gap: spacing.sm },
  btn: {
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  btnFlex: { flex: 1 },
  btnCancel: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  btnDanger: { backgroundColor: colors.danger },
  btnPrimary: { backgroundColor: colors.primary },
  btnText: { fontSize: text.md, fontWeight: '500' },
});

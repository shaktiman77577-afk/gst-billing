import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, shadowSm } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode; // sticky area at the bottom (e.g. Save button)
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, footer, edges = ['top', 'bottom'], contentStyle }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text style={styles.errorBoxText}>{children}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  variant?: 'primary' | 'outline' | 'text' | 'danger';
};

export function Button({ label, onPress, loading, disabled, icon, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || loading;
  const fg =
    variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'outline' && styles.buttonOutline,
        variant === 'danger' && styles.buttonDanger,
        variant === 'text' && styles.buttonTextOnly,
        pressed && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  optionalLabel?: string;
  error?: string | null;
  helper?: string | null;
  icon?: IconName;
};

export function Field({ label, optionalLabel, error, helper, icon, style, onFocus, onBlur, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optionalLabel ? <Text style={styles.optional}>  ({optionalLabel})</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          error ? { borderColor: colors.danger } : focused ? { borderColor: colors.primary } : null,
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.faint} style={{ marginRight: 8 }} /> : null}
        <TextInput
          placeholderTextColor={colors.faint}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && helper ? (
        <View style={styles.helperRow}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={styles.helper}>{helper}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

type ChipOption<T extends string> = { value: T; label: string; icon?: IconName };

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            {o.icon ? (
              <Ionicons name={o.icon} size={16} color={selected ? colors.white : colors.muted} />
            ) : null}
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MadeInIndia({ light = false }: { light?: boolean }) {
  return (
    <View style={styles.madeWrap}>
      <Text style={[styles.made, light && { color: 'rgba(255,255,255,0.85)' }]}>Made with 🤎 in India</Text>
      <Text style={[styles.madeHindi, light && { color: 'rgba(255,255,255,0.7)' }]}>
        भारत के व्यापारियों के लिए
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  footer: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    ...shadow,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionSubtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    padding: 12,
    borderRadius: radius.md,
  },
  errorBoxText: { color: colors.danger, fontSize: 14, flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  helper: { color: colors.success, fontSize: 13 },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonPrimary: { backgroundColor: colors.primary, ...shadowSm },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card },
  buttonDanger: { borderWidth: 1.5, borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  buttonTextOnly: { minHeight: 40 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  optional: { fontWeight: '400', color: colors.faint },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.card,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  chipLabelSelected: { color: colors.white, fontWeight: '700' },
  madeWrap: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  made: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  madeHindi: { fontSize: 12, color: colors.faint },
});

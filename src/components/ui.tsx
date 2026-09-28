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
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Text, TextInput } from './Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, shadowSm, spacing, text } from '../theme';

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

export function Card({ children, style, list }: { children: ReactNode; style?: StyleProp<ViewStyle>; list?: boolean }) {
  return <View style={[styles.card, list && styles.list, style]}>{children}</View>;
}

export function SectionHeader({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
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
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
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
        {icon ? <Ionicons name={icon} size={17} color={colors.faint} style={{ marginRight: spacing.sm }} /> : null}
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
              <Ionicons name={o.icon} size={16} color={selected ? colors.primary : colors.muted} />
            ) : null}
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Segmented control (2–4 options, equal width) — e.g. All / Customers / Suppliers.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentBtn, on && styles.segmentBtnOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Small uppercase section label ("THIS MONTH", "RECENT BILLS").
export function Overline({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.overline, style]}>{children}</Text>;
}

export function MadeInIndia({ light = false }: { light?: boolean }) {
  return (
    <View style={styles.madeWrap}>
      <Text style={[styles.made, light && { color: colors.whiteSoft }]}>Made with 🤎 in India</Text>
      <Text style={[styles.madeHindi, light && { color: colors.whiteFaint }]}>
        भारत के व्यापारियों के लिए
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Elegant design language (myBillBook-style, extracted from the membership
// screen). Use these for every list/menu row in the app so all screens share
// one visual language: small tinted icon chip + compact 15px text + hairline
// separators inside a slim card.
// ---------------------------------------------------------------------------

// Small tinted icon chip: 34x34, radius 10, 19px glyph.
export function IconChip({
  icon,
  bg = colors.primarySoft,
  fg = colors.primary,
  size = 34,
}: {
  icon: IconName;
  bg?: string;
  fg?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconChip,
        { width: size, height: size, borderRadius: Math.min(10, size / 2), backgroundColor: bg },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.56)} color={fg} />
    </View>
  );
}

// Elegant tappable row: icon chip + title (+ optional subtitle) + optional
// right-side node + chevron. Touch target >= 44px (52px tall by default).
// Wrap rows in <Card list> and put <Hairline /> between them.
export function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  iconBg,
  iconFg,
  chevron = true,
  subtitleLines = 2,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  iconBg?: string;
  iconFg?: string;
  chevron?: boolean;
  subtitleLines?: number;
}) {
  const inner = (
    <>
      <IconChip icon={icon} bg={iconBg} fg={iconFg} />
      <View style={styles.menuTextWrap}>
        <Text style={styles.menuTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron && !right ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.menuRow}>{inner}</View>;
}

// Hairline separator for use between MenuRows.
export function Hairline() {
  return <View style={styles.hairline} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: text.md, fontWeight: '700', color: colors.text, lineHeight: 20 },
  sectionSubtitle: { fontSize: text.xs, color: colors.muted, marginTop: 1 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text },
  hint: { fontSize: text.sm, color: colors.muted },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorBoxText: { color: colors.danger, fontSize: text.sm, flex: 1 },
  error: { color: colors.danger, fontSize: text.sm, marginTop: spacing.xs },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  helper: { color: colors.success, fontSize: text.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonTextOnly: { minHeight: 44 },
  buttonLabel: { fontSize: text.md, fontWeight: '500' },
  field: { gap: 6 },
  label: { fontSize: text.xs, fontWeight: '500', color: colors.muted },
  optional: { fontWeight: '400', color: colors.faint },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: text.md, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 36,
    backgroundColor: colors.card,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipLabel: { fontSize: text.sm, fontWeight: '500', color: colors.textSecondary },
  chipLabelSelected: { color: colors.primary, fontWeight: '700' },
  madeWrap: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  made: { fontSize: text.xs, color: colors.muted, fontWeight: '500' },
  madeHindi: { fontSize: text.xs, color: colors.faint },
  // Elegant row language
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, minHeight: 48 },
  menuTextWrap: { flex: 1 },
  menuTitle: { fontSize: text.md, fontWeight: '500', color: colors.text, lineHeight: 20 },
  menuSubtitle: { fontSize: text.xs, color: colors.muted, marginTop: 1, lineHeight: 16 },
  hairline: { height: 1, backgroundColor: colors.divider, marginVertical: 2 },
  // Slim card variant for lists: wrap MenuRows + Hairlines in <Card list>.
  list: { paddingVertical: 6, gap: 0 },
  segment: { flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.md + 2, padding: 3, gap: 3 },
  segmentBtn: { flex: 1, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentBtnOn: {
    backgroundColor: colors.card,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: text.sm, fontWeight: '500', color: colors.muted },
  segmentTextOn: { color: colors.text, fontWeight: '700' },
  overline: {
    fontSize: text.xs,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

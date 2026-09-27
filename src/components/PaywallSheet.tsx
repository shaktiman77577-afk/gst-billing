import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { useApp } from '../context/AppContext';
import { FREE_BILLS_PER_MONTH } from '../lib/membershipConfig';
import { Plan, fetchPlans } from '../lib/membership';
import { formatPaise } from '../lib/money';
import { colors, radius, shadow } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function PaywallSheet({ visible, onClose }: Props) {
  const { t } = useApp();
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    fetchPlans()
      .then((ps) => {
        if (alive) setPlans(ps);
      })
      .catch(() => {
        if (alive) setPlans([]);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const monthly = plans?.find((p) => p.duration_days < 300);
  const yearly = plans?.find((p) => p.duration_days >= 300);
  const monthlyPrice = monthly ? formatPaise(monthly.price_paise) : formatPaise(9900);
  const yearlyPrice = yearly ? formatPaise(yearly.price_paise) : formatPaise(79900);

  const goPlans = () => {
    onClose();
    router.push('/settings/membership');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('mem_pwTitle').replace('{limit}', String(FREE_BILLS_PER_MONTH))}</Text>
          <Text style={styles.body}>{t('mem_pwBody')}</Text>

          <View style={styles.priceRow}>
            <View style={styles.priceTile}>
              <Text style={styles.priceLabel}>{t('mem_planMonthly')}</Text>
              <Text style={styles.priceValue}>{monthlyPrice}</Text>
            </View>
            <View style={styles.priceTile}>
              <Text style={styles.priceLabel}>{t('mem_planYearly')}</Text>
              <Text style={styles.priceValue}>{yearlyPrice}</Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>{t('mem_saveYearly')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.feats}>
            {(['mem_featUnlimited', 'mem_featBackup', 'mem_featReports'] as const).map((k) => (
              <View key={k} style={styles.feat}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.featText}>{t(k)}</Text>
              </View>
            ))}
          </View>

          <Button icon="star-outline" label={t('mem_pwUpgrade')} onPress={goPlans} />
          <Button variant="text" label={t('mem_pwLater')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  backdropPress: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
    ...shadow,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  priceRow: { flexDirection: 'row', gap: 12 },
  priceTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryTint,
  },
  priceLabel: { fontSize: 12, fontWeight: '700', color: colors.muted },
  priceValue: { fontSize: 19, fontWeight: '800', color: colors.primary },
  saveBadge: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  saveText: { fontSize: 10, fontWeight: '800', color: colors.success },
  feats: { gap: 6 },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featText: { fontSize: 14, color: colors.text },
});

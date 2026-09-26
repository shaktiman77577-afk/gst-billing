import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { StatePicker } from '../../src/components/StatePicker';
import { Button, Card, Chips, Field, Hint, Label, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { createParty, deleteParty, getParty, PartyType, updateParty } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { isValidGstin, normalizeGstin, stateCodeFromGstin } from '../../src/lib/gstin';
import { paiseToInput, toPaise } from '../../src/lib/money';
import { colors } from '../../src/theme';

type Errors = Partial<Record<'name' | 'phone' | 'gstin' | 'amount', string>>;

const clean = (v: string) => (v.trim() ? v.trim() : null);

export default function PartyFormScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [billing, setBilling] = useState('');
  const [sameShipping, setSameShipping] = useState(true);
  const [shipping, setShipping] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'collect' | 'pay'>('collect');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Load the party when editing.
  useEffect(() => {
    if (isNew) return;
    getParty(db, id).then((p) => {
      if (!p) return;
      setName(p.name);
      setPhone(p.phone ?? '');
      setPartyType(p.party_type);
      setGstin(p.gstin ?? '');
      setStateCode(p.state_code);
      setBilling(p.billing_address ?? '');
      setSameShipping(p.same_shipping === 1);
      setShipping(p.shipping_address ?? '');
      setAmount(paiseToInput(Math.abs(p.opening_balance_paise)) || '');
      setDirection(p.opening_balance_paise < 0 ? 'pay' : 'collect');
    });
  }, [db, id, isNew]);

  // New party: default state = business state.
  useEffect(() => {
    if (isNew && business && !stateCode) setStateCode(business.state_code);
  }, [isNew, business, stateCode]);

  const gstinOk = gstin.length > 0 && isValidGstin(gstin);

  const onGstinChange = (value: string) => {
    const g = normalizeGstin(value).slice(0, 15);
    setGstin(g);
    if (isValidGstin(g)) {
      setStateCode(stateCodeFromGstin(g));
      setErrors((e) => ({ ...e, gstin: undefined }));
    }
  };

  const onSave = async () => {
    const e: Errors = {};
    if (!name.trim()) e.name = t('errPartyName');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) e.phone = t('errMobile');
    if (gstin && !isValidGstin(gstin)) e.gstin = t('errGstin');
    const amountPaise = amount.trim() ? toPaise(amount) : 0;
    if (amountPaise === null) e.amount = t('errAmount');
    setErrors(e);
    if (Object.keys(e).length > 0 || !businessId) return;

    const input = {
      name: name.trim(),
      phone: clean(phone),
      partyType,
      gstin: gstin ? normalizeGstin(gstin) : null,
      stateCode,
      billingAddress: clean(billing),
      shippingAddress: clean(shipping),
      sameShipping,
      openingBalancePaise: (amountPaise ?? 0) * (direction === 'pay' ? -1 : 1),
    };

    setSaving(true);
    try {
      if (isNew) await createParty(db, businessId, input);
      else await updateParty(db, id, input);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert(t('delete'), t('deletePartyConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteParty(db, id);
          router.dismissAll(); // back to the tabs (the party's khata no longer exists)
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader
        title={isNew ? t('newParty') : t('editParty')}
        right={
          isNew ? null : (
            <Pressable onPress={onDelete} hitSlop={10} style={styles.trash}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          )
        }
      />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
      >
        <Card>
          <SectionHeader icon="person" title={t('sectionBasic')} />
          <Field
            label={t('partyName')}
            placeholder={t('partyNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            icon="person-outline"
            error={errors.name}
          />
          <Field
            label={t('mobile')}
            optionalLabel={t('optional')}
            placeholder="9876543210"
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(-10))}
            keyboardType="phone-pad"
            maxLength={10}
            icon="call-outline"
            error={errors.phone}
          />
          <Label>{t('partyType')}</Label>
          <Chips
            options={[
              { value: 'customer', label: t('customer'), icon: 'person-outline' },
              { value: 'supplier', label: t('supplier'), icon: 'cube-outline' },
            ]}
            value={partyType}
            onChange={setPartyType}
          />
        </Card>

        <Card>
          <SectionHeader icon="receipt" title={t('sectionPartyGst')} />
          <Field
            label={t('gstin')}
            optionalLabel={t('optional')}
            placeholder={t('gstinPlaceholder')}
            value={gstin}
            onChangeText={onGstinChange}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            icon="document-text-outline"
            error={errors.gstin}
            helper={gstinOk ? t('gstinValid').split('—')[0].trim() : null}
          />
          <StatePicker
            label={t('state')}
            placeholder={t('selectState')}
            searchPlaceholder={t('searchState')}
            value={stateCode}
            onChange={setStateCode}
          />
          <Hint>{t('partyStateHint')}</Hint>
          <Field
            label={t('billingAddress')}
            optionalLabel={t('optional')}
            value={billing}
            onChangeText={setBilling}
            multiline
            style={styles.multi}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{t('sameAsBilling')}</Text>
            <Switch
              value={sameShipping}
              onValueChange={setSameShipping}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.white}
            />
          </View>
          {sameShipping ? null : (
            <Field
              label={t('shippingAddress')}
              value={shipping}
              onChangeText={setShipping}
              multiline
              style={styles.multi}
            />
          )}
        </Card>

        <Card>
          <SectionHeader icon="wallet" title={t('sectionOpening')} subtitle={t('openingHint')} />
          <Field
            label={t('amount')}
            optionalLabel={t('optional')}
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            icon="cash-outline"
            error={errors.amount}
          />
          <Chips
            options={[
              { value: 'collect', label: t('willCollect'), icon: 'arrow-down-circle-outline' },
              { value: 'pay', label: t('willPay'), icon: 'arrow-up-circle-outline' },
            ]}
            value={direction}
            onChange={setDirection}
          />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  trash: { padding: 4 },
  multi: { minHeight: 60, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, fontSize: 14, color: colors.text },
});

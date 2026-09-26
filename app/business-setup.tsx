import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FormHeader } from '../src/components/FormHeader';
import { LanguageToggle } from '../src/components/LanguageToggle';
import { StatePicker } from '../src/components/StatePicker';
import {
  Button,
  Card,
  Chips,
  Field,
  Hint,
  Label,
  MadeInIndia,
  Screen,
  SectionHeader,
  Title,
} from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { BusinessType, createBusiness, updateBusiness } from '../src/db/businesses';
import { useBusiness } from '../src/hooks/useBusiness';
import {
  isValidGstin,
  normalizeGstin,
  panFromGstin,
  stateCodeFromGstin,
} from '../src/lib/gstin';

type Errors = Partial<Record<'name' | 'phone' | 'gstin' | 'state' | 'pincode', string>>;

const clean = (v: string) => {
  const s = v.trim();
  return s.length ? s : null;
};

export default function BusinessSetupScreen() {
  const db = useSQLiteContext();
  const { t, userId, businessId, setActiveBusiness } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === '1';
  const existing = useBusiness();
  const [prefilled, setPrefilled] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstRegistered, setGstRegistered] = useState<'yes' | 'no'>('yes');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Editing: fill the form with the saved business once.
  useEffect(() => {
    if (!isEdit || !existing || prefilled) return;
    setName(existing.name);
    setPhone(existing.phone ?? '');
    setGstRegistered(existing.gst_registered ? 'yes' : 'no');
    setGstin(existing.gstin ?? '');
    setPan(existing.pan ?? '');
    setStateCode(existing.state_code);
    setAddress(existing.address ?? '');
    setCity(existing.city ?? '');
    setPincode(existing.pincode ?? '');
    setBusinessType(existing.business_type);
    setPrefilled(true);
  }, [isEdit, existing, prefilled]);

  const gstinOk = gstRegistered === 'yes' && isValidGstin(gstin);

  const onGstinChange = (value: string) => {
    const g = normalizeGstin(value).slice(0, 15);
    setGstin(g);
    if (isValidGstin(g)) {
      setStateCode(stateCodeFromGstin(g));
      setPan(panFromGstin(g));
      setErrors((e) => ({ ...e, gstin: undefined, state: undefined }));
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = t('errBusinessName');
    if (phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim())) e.phone = t('errMobile');
    if (gstRegistered === 'yes') {
      if (!isValidGstin(gstin)) e.gstin = t('errGstin');
      else if (stateCode && stateCodeFromGstin(gstin) !== stateCode) e.state = t('errGstinState');
    }
    if (!stateCode) e.state = t('errState');
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) e.pincode = t('errPincode');
    return e;
  };

  const onSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || !userId || !stateCode) return;

    setSaving(true);
    try {
      const registered = gstRegistered === 'yes';
      const input = {
        name: name.trim(),
        phone: clean(phone),
        gstRegistered: registered,
        gstin: registered ? normalizeGstin(gstin) : null,
        pan: clean(pan.toUpperCase()),
        stateCode,
        address: clean(address),
        city: clean(city),
        pincode: clean(pincode),
        businessType,
      };
      if (isEdit && businessId) {
        await updateBusiness(db, businessId, input);
        router.back();
        return;
      }
      const id = await createBusiness(db, userId, input);
      await setActiveBusiness(id);
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
    {isEdit ? <FormHeader title={t('editBusiness')} /> : null}
    <Screen
      edges={isEdit ? ['bottom'] : ['top', 'bottom']}
      footer={
        <Button
          label={isEdit ? t('save') : t('saveBusiness')}
          icon="checkmark-circle"
          onPress={onSave}
          loading={saving}
        />
      }
    >
      <StatusBar style="dark" />
      {isEdit ? null : (
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Title>{t('setupTitle')}</Title>
            <Hint>{t('setupHint')}</Hint>
          </View>
          <LanguageToggle />
        </View>
      )}

      <Card>
        <SectionHeader icon="storefront" title={t('sectionBusiness')} />
        <Field
          label={t('businessName')}
          placeholder={t('businessNamePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          icon="business-outline"
          error={errors.name}
        />
        <Field
          label={t('mobile')}
          optionalLabel={t('optional')}
          placeholder="9876543210"
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad"
          maxLength={10}
          icon="call-outline"
          error={errors.phone}
        />
        <Label>{t('businessType')}</Label>
        <Chips
          options={[
            { value: 'retail', label: t('retail'), icon: 'cart-outline' },
            { value: 'wholesale', label: t('wholesale'), icon: 'cube-outline' },
            { value: 'both', label: t('both'), icon: 'layers-outline' },
          ]}
          value={businessType}
          onChange={setBusinessType}
        />
      </Card>

      <Card>
        <SectionHeader icon="receipt" title={t('sectionGst')} />
        <Label>{t('gstRegistered')}</Label>
        <Chips
          options={[
            { value: 'yes', label: t('yes') },
            { value: 'no', label: t('no') },
          ]}
          value={gstRegistered}
          onChange={(v) => {
            setGstRegistered(v);
            setErrors((e) => ({ ...e, gstin: undefined }));
          }}
        />
        {gstRegistered === 'yes' ? (
          <Field
            label={t('gstin')}
            placeholder={t('gstinPlaceholder')}
            value={gstin}
            onChangeText={onGstinChange}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            icon="document-text-outline"
            error={errors.gstin}
            helper={gstinOk ? t('gstinValid') : null}
          />
        ) : (
          <Hint>{t('notGstHint')}</Hint>
        )}
        <Field
          label={t('pan')}
          optionalLabel={t('optional')}
          placeholder="ABCDE1234F"
          value={pan}
          onChangeText={(v) => setPan(v.toUpperCase().replace(/\s/g, '').slice(0, 10))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          icon="card-outline"
          editable={!gstinOk}
        />
      </Card>

      <Card>
        <SectionHeader icon="location" title={t('sectionAddress')} />
        <StatePicker
          label={t('state')}
          placeholder={t('selectState')}
          searchPlaceholder={t('searchState')}
          value={stateCode}
          onChange={(code) => {
            setStateCode(code);
            setErrors((e) => ({ ...e, state: undefined }));
          }}
          error={errors.state}
        />
        <Field
          label={t('address')}
          optionalLabel={t('optional')}
          placeholder={t('addressPlaceholder')}
          value={address}
          onChangeText={setAddress}
          multiline
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field
              label={t('city')}
              optionalLabel={t('optional')}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.flex}>
            <Field
              label={t('pincode')}
              optionalLabel={t('optional')}
              value={pincode}
              onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              error={errors.pincode}
            />
          </View>
        </View>
      </Card>

      <MadeInIndia />
    </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  headerText: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});

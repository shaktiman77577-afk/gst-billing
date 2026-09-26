import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatePicker } from '../src/components/StatePicker';
import { Button, Chips, Field, Hint, Label, Screen, Title } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { BusinessType, createBusiness } from '../src/db/businesses';
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
  const { t, userId, setActiveBusiness } = useApp();

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
      const id = await createBusiness(db, userId, {
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
      });
      await setActiveBusiness(id);
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Title>{t('setupTitle')}</Title>
        <Hint>{t('setupHint')}</Hint>
      </View>

      <Field
        label={t('businessName')}
        placeholder={t('businessNamePlaceholder')}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
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
        error={errors.phone}
      />

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
          error={errors.gstin}
          helper={gstinOk ? t('gstinValid') : null}
        />
      ) : null}

      <Field
        label={t('pan')}
        optionalLabel={t('optional')}
        placeholder="ABCDE1234F"
        value={pan}
        onChangeText={(v) => setPan(v.toUpperCase().replace(/\s/g, '').slice(0, 10))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        editable={!gstinOk}
      />

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
        value={address}
        onChangeText={setAddress}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
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

      <Label>{t('businessType')}</Label>
      <Chips
        options={[
          { value: 'retail', label: t('retail') },
          { value: 'wholesale', label: t('wholesale') },
          { value: 'both', label: t('both') },
        ]}
        value={businessType}
        onChange={setBusinessType}
      />

      <View style={{ marginTop: 12 }}>
        <Button label={t('saveBusiness')} onPress={onSave} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});

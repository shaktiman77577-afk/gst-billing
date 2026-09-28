import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../src/components/Text';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import { Card, Hairline, IconChip, IconName, MadeInIndia, MenuRow, Overline } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useMembership } from '../../src/hooks/useMembership';
import { MONETIZATION_ENABLED } from '../../src/lib/features';
import { getMeta } from '../../src/db/meta';
import { stateName } from '../../src/data/states';
import { useBusiness } from '../../src/hooks/useBusiness';
import { colors, radius, spacing, text } from '../../src/theme';

export default function MoreScreen() {
  const { t, email, logout, language } = useApp();
  const business = useBusiness();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const mem = useMembership();
  const [cloud, setCloud] = useState<{
    syncAt: string | null;
    syncErr: string | null;
    fileAt: string | null;
    fileErr: string | null;
  }>({ syncAt: null, syncErr: null, fileAt: null, fileErr: null });

  // Cloud backup status (read-only — backups run automatically after every change).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const syncAt = await getMeta(db, 'sync_last_ok');
          const syncErr = await getMeta(db, 'sync_last_error');
          const fileAt = await getMeta(db, 'last_backup_at');
          const fileErr = await getMeta(db, 'last_backup_error');
          if (alive) setCloud({ syncAt, syncErr, fileAt, fileErr });
        } catch {
          // ignore
        }
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return t('v2_justNow');
    if (mins < 60) return t('v2_minAgo').replace('{n}', String(mins));
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return t('v2_hrAgo').replace('{n}', String(hrs));
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };
  const statusLine = (at: string | null, err: string | null) =>
    err
      ? err === 'no_network'
        ? t('v2_backupErrNetwork')
        : err === 'no_session'
          ? t('v2_backupErrSession')
          : t('v2_backupErrFailed')
      : at
        ? t('v2_backupOk').replace('{time}', ago(at))
        : t('v2_backupNever');
  const version = Constants.expoConfig?.version ?? '';

  const doLogout = async (force: boolean) => {
    const r = await logout(force);
    if (r === 'unsynced') {
      // Offline: some changes are not in the cloud yet and logout wipes the phone.
      AppAlert.alert(t('v2_logoutUnsyncedTitle'), t('v2_logoutUnsyncedMsg'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('v2_logoutAnyway'), style: 'destructive', onPress: () => void doLogout(true) },
      ]);
      return;
    }
    router.replace('/');
  };

  const onLogout = () => {
    AppAlert.alert(t('logout'), t('v2_logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => void doLogout(false) },
    ]);
  };

  const initials =
    (business?.name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  const meta = business
    ? [stateName(business.state_code), business.gstin ? `GSTIN ${business.gstin}` : null].filter(Boolean).join(' · ')
    : '';

  type Row = { icon: IconName; title: string; hint: string; path: string; yearlyOnly?: boolean };
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: t('v2_documents'),
      rows: [
        { icon: 'bag-handle-outline', title: t('pur_purchases'), hint: t('pur_purchasesHint'), path: '/purchases' },
        { icon: 'arrow-undo-outline', title: t('newSalesReturn'), hint: t('salesReturnHint'), path: '/returns/sales' },
        { icon: 'arrow-redo-outline', title: t('newPurchaseReturn'), hint: t('purchaseReturnHint'), path: '/purchases/return' },
        { icon: 'car-outline', title: t('ch_menuTitle'), hint: t('ch_menuHint'), path: '/challans' },
        { icon: 'clipboard-outline', title: t('pf_menuTitle'), hint: t('pf_menuHint'), path: '/proforma' },
        { icon: 'wallet-outline', title: t('e_expenses'), hint: t('e_expensesHint'), path: '/expenses' },
      ],
    },
    {
      title: t('v2_insights'),
      rows: [
        { icon: 'bar-chart-outline', title: t('r_reports'), hint: t('r_reportsHint'), path: '/reports' },
        { icon: 'book-outline', title: t('dbk_daybook'), hint: t('dbk_daybookHint'), path: '/daybook' },
      ],
    },
    {
      title: t('v2_business'),
      rows: [
        { icon: 'document-text-outline', title: t('billSettings'), hint: t('billDesignHint'), path: '/settings/bill' },
        { icon: 'search-outline', title: t('gr_title'), hint: t('gr_searchPlaceholder'), path: '/settings/gst-rates' },
        {
          icon: 'trash-bin-outline',
          title: t('rc_menuTitle'),
          hint: t('rc_menuHint'),
          path: '/settings/recycle',
          yearlyOnly: true,
        },
      ],
    },
  ];

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      {/* Business profile as the page header */}
      <Pressable
        style={({ pressed }) => [styles.header, { paddingTop: insets.top + spacing.md }, pressed && { opacity: 0.85 }]}
        onPress={() => router.push({ pathname: '/business-setup', params: { edit: '1' } })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.flexOnly}>
          <Text style={styles.name} numberOfLines={1}>
            {business?.name ?? ''}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.editBtn}>
          <Text style={styles.editText}>{t('edit')}</Text>
        </View>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Overline>{g.title}</Overline>
            <Card list>
              {g.rows.map((r, i) => (
                <View key={r.path}>
                  {i > 0 ? <Hairline /> : null}
                  <MenuRow
                    icon={r.icon}
                    title={r.title}
                    subtitle={r.hint}
                    subtitleLines={1}
                    right={
                      r.yearlyOnly && !mem.isYearly ? (
                        <View style={styles.yearlyTag}>
                          <Text style={styles.yearlyTagText}>{t('v2_yearlyTag')}</Text>
                        </View>
                      ) : undefined
                    }
                    onPress={() => router.push(r.path as never)}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))}

        <View style={styles.group}>
          <Overline>{t('v2_app')}</Overline>
          <Card list>
            <View style={styles.langRow}>
              <IconChip icon="language-outline" />
              <Text style={styles.langTitle} numberOfLines={1}>
                {t('language')}
              </Text>
            </View>
            <View style={styles.langToggle}>
              <LanguageToggle />
            </View>
            {MONETIZATION_ENABLED ? (
              <>
                <Hairline />
                <MenuRow
                  icon="star-outline"
                  title={t('mem_title')}
                  subtitle={t('mem_rowHint')}
                  subtitleLines={1}
                  onPress={() => router.push('/settings/membership')}
                />
              </>
            ) : null}
          </Card>
        </View>

        <View style={styles.group}>
          <Overline>{t('account')}</Overline>
          <Card list>
            <MenuRow icon="logo-google" title={email ?? ''} subtitle={t('loggedInAs')} chevron={false} />
            <Hairline />
            <MenuRow
              icon={cloud.syncErr ? 'cloud-offline-outline' : 'sync-outline'}
              iconBg={cloud.syncErr ? colors.warningSoft : colors.successSoft}
              iconFg={cloud.syncErr ? colors.warning : colors.success}
              title={t('v2_sync')}
              subtitle={statusLine(cloud.syncAt, cloud.syncErr)}
              chevron={false}
            />
            <Hairline />
            <MenuRow
              icon={cloud.fileErr ? 'cloud-offline-outline' : 'cloud-done-outline'}
              iconBg={cloud.fileErr ? colors.warningSoft : colors.successSoft}
              iconFg={cloud.fileErr ? colors.warning : colors.success}
              title={t('v2_dailyBackup')}
              subtitle={statusLine(cloud.fileAt, cloud.fileErr)}
              chevron={false}
            />
            <Hairline />
            <MenuRow
              icon="trash-outline"
              iconBg={colors.dangerSoft}
              iconFg={colors.danger}
              title={t('v2_deleteAccount')}
              subtitle={t('v2_deleteAccountHint')}
              subtitleLines={1}
              onPress={() => router.push('/settings/delete-account')}
            />
            <Hairline />
            <Pressable onPress={onLogout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
              <Text style={styles.logoutText}>{t('logout')}</Text>
            </Pressable>
          </Card>
        </View>

        <View style={styles.footer}>
          <MadeInIndia />
          <Text style={styles.version}>
            {t('appName')} · {t('appVersion')} {version}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1, minWidth: 0 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 },
  group: { gap: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: text.lg, fontWeight: '700' },
  name: { fontSize: text.lg, lineHeight: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1 },
  editBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { fontSize: text.sm, fontWeight: '500', color: colors.textSecondary },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: 10 },
  langTitle: { flex: 1, fontSize: text.md, fontWeight: '500', color: colors.text },
  langToggle: { paddingLeft: 34 + spacing.md, paddingTop: spacing.sm, paddingBottom: 10, alignItems: 'flex-start' },
  logout: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: text.md, fontWeight: '500', color: colors.danger },
  footer: { alignItems: 'center', gap: 4, marginTop: spacing.sm },
  version: { fontSize: text.xs, color: colors.muted },
  yearlyTag: { backgroundColor: colors.warningSoft, borderRadius: radius.sm - 2, paddingHorizontal: 7, paddingVertical: 1 },
  yearlyTagText: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.warning },
});

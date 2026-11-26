import type { CalendarFeedDto } from '@grit/validation';
import { PLATFORM_NAME } from '@grit/design-tokens';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarPlus,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  IdCard,
  Link2,
  LogOut,
  Mail,
  Palette,
  Phone,
  ShieldCheck,
  Trash2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { EditProfile } from '@/components/EditProfile';
import { LanguagePicker } from '@/components/LanguagePicker';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import { Button, Card, ErrorNote, Screen, SectionTitle } from '@/components/ui';
import { exportMyData } from '@/lib/account';
import { themePref } from '@/lib/brand-boot';
import { api, ApiError } from '@/lib/api';
import { AUTH_MODE, signOut } from '@/lib/auth';
import { clubShortName, useClub, useMe } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

/** One settings row: icon in a tinted square, label (and hint), then a value and a chevron. */
function Row({
  icon: Icon,
  label,
  hint,
  value,
  onPress,
  danger,
  divider,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  value?: ReactNode;
  onPress: () => void;
  danger?: boolean;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, divider && styles.divider]}
    >
      <View style={[styles.icon, danger && { backgroundColor: `${color.status.danger}1A` }]}>
        <Icon size={18} color={danger ? color.status.danger : color.accent[400]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, danger && { color: color.status.danger }]}>{label}</Text>
        {hint ? <Text style={type.bodySm}>{hint}</Text> : null}
      </View>
      {typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value}
      <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
    </Pressable>
  );
}

/**
 * Profile: everything about me and the app in one place, grouped as Account · Notifications ·
 * App · Club contact · Metis Fit (legal) · Privacy. Home keeps "today" (no repeats here).
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const club = useClub();
  const member = me.data?.member;
  const isStaff = (me.data?.roles.length ?? 0) > 0;
  const email = typeof club.data?.info.email === 'string' ? club.data.info.email : null;
  const phone = typeof club.data?.info.phone === 'string' ? club.data.info.phone : null;
  const gymName =
    typeof club.data?.info.name === 'string' ? club.data.info.name : clubShortName(club.data);
  const calendar = useQuery({
    queryKey: ['me', 'calendar-feed'],
    queryFn: () => api.get<CalendarFeedDto>('/me/calendar-feed'),
    enabled: Boolean(member),
  });
  const exp = useMutation({ mutationFn: () => exportMyData(t('app.account.export')) });
  const go = (href: Href) => () => router.push(href);

  return (
    <Screen>
      <BackHeader title={t('app.tabs.profile')} />

      {me.data && (
        <EditProfile
          me={me.data}
          subtitle={
            member
              ? `${t('app.profile.member_number')}: ${member.memberNumber}`
              : t('app.profile.not_linked')
          }
        />
      )}

      {!member && (
        <>
          <Button label={t('app.join.cta')} icon={UserPlus} onPress={go('/join')} />
          <Button
            label={t('app.link.cta_button')}
            icon={Link2}
            variant="secondary"
            onPress={go('/link')}
          />
        </>
      )}

      <SectionTitle>{t('app.profile.account')}</SectionTitle>
      <Card style={styles.card}>
        <Row
          icon={Building2}
          label={t('app.gyms.current_gym')}
          hint={gymName}
          value={<Text style={styles.link}>{t('app.gyms.change')}</Text>}
          onPress={go('/gyms')}
        />
        {member && (
          <Row icon={IdCard} label={t('app.hub.membership')} onPress={go('/membership')} divider />
        )}
      </Card>

      <SectionTitle>{t('app.notifications.settings')}</SectionTitle>
      <NotificationPrefs />
      {member && (
        <Card style={styles.card}>
          <Row
            icon={CalendarPlus}
            label={t('app.calendar.title')}
            hint={t('app.calendar.row_hint')}
            value={calendar.data?.active ? t('app.profile.on') : t('app.profile.off')}
            onPress={go('/calendar')}
          />
        </Card>
      )}

      <SectionTitle>{t('app.profile.app')}</SectionTitle>
      <Card style={styles.card}>
        <Row
          icon={Palette}
          label={t('app.theme.title')}
          value={t('app.theme.' + themePref)}
          onPress={go('/appearance')}
        />
        <View style={styles.divider}>
          <LanguagePicker row />
        </View>
        <Row icon={CircleHelp} label={t('app.guide.open')} onPress={go('/guide')} divider />
      </Card>

      {(email || phone) && (
        <>
          <SectionTitle>{t('app.profile.contact_club')}</SectionTitle>
          <Card style={styles.card}>
            {phone && (
              <Row
                icon={Phone}
                label={phone}
                onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
              />
            )}
            {email && (
              <Row
                icon={Mail}
                label={email}
                onPress={() => void Linking.openURL(`mailto:${email}`)}
                divider={Boolean(phone)}
              />
            )}
          </Card>
        </>
      )}

      <SectionTitle>{PLATFORM_NAME}</SectionTitle>
      <Card style={styles.card}>
        <Row icon={FileText} label={t('app.legal.terms')} onPress={go('/legal/terms')} />
        <Row
          icon={ShieldCheck}
          label={t('app.legal.privacy')}
          onPress={go('/legal/privacy')}
          divider
        />
      </Card>

      <SectionTitle>{t('app.account.privacy')}</SectionTitle>
      <Card style={styles.card}>
        <Row
          icon={Download}
          label={t('app.account.export')}
          hint={t('app.account.export_hint')}
          onPress={() => exp.mutate()}
        />
        {!isStaff && (
          <Row
            icon={Trash2}
            label={t('app.account.delete_title')}
            hint={t('app.account.delete_hint')}
            onPress={go('/delete-account')}
            danger
            divider
          />
        )}
      </Card>
      {exp.error && (
        <ErrorNote
          message={exp.error instanceof ApiError ? exp.error.message : 'errors.internal'}
        />
      )}
      {isStaff && <Text style={styles.note}>{t('app.account.staff_note')}</Text>}

      <View style={{ marginTop: 8 }}>
        <Button
          label={t('admin.nav.sign_out')}
          icon={LogOut}
          variant="ghost"
          onPress={() => void signOut()}
        />
      </View>
      <Text style={styles.version}>
        {PLATFORM_NAME} {Constants.expoConfig?.version ?? ''}
        {AUTH_MODE === 'dev' ? ' · DEV' : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  note: { fontFamily: fonts.regular, fontSize: 12, color: color.text.secondary },
  version: {
    textAlign: 'center',
    color: color.text.muted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});

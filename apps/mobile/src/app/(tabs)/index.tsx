import { Redirect, router } from 'expo-router';
import {
  Building2,
  Bell,
  Link2,
  QrCode as QrCodeIcon,
  Ticket,
  UserPlus,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { BusyCard } from '@/components/BusyCard';
import { CaloriesCard } from '@/components/CaloriesCard';
import { ChallengesCard } from '@/components/ChallengesCard';
import { ProfileOverview } from '@/components/ProfileOverview';
import { RateCard } from '@/components/RateCard';
import { MembershipCard } from '@/components/MembershipCard';
import { VisitCard } from '@/components/VisitCard';
import { ModeSwitch } from '@/components/ModeSwitch';
import { Button, Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { useAppMode } from '@/lib/app-mode';
import { greetingKey } from '@/lib/format';
import { useNotifications } from '@/lib/notifications';
import { currentMembership, useClub, useMe, useMyMemberships, useMyVisits } from '@/lib/queries';
import { color, fonts, type } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const memberships = useMyMemberships();
  const visits = useMyVisits();
  const club = useClub();
  const current = currentMembership(memberships.data);
  const linked = Boolean(me.data?.member);
  const unread = useNotifications().data?.unread ?? 0;
  const appMode = useAppMode();

  const refreshing = me.isFetching || memberships.isFetching || visits.isFetching;
  const refresh = () => {
    void me.refetch();
    void memberships.refetch();
    void visits.refetch();
    void club.refetch();
  };

  // Trainer mode opens on Work.
  if (appMode.mode === 'coach') return <Redirect href="/coach" />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {appMode.isTrainer && <ModeSwitch />}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodySm}>{t(`app.home.greeting.${greetingKey()}`)}</Text>
          <Text style={type.h1} numberOfLines={1}>
            {me.data?.firstName || ' '}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={
            unread ? `${t('app.notifications.open')} (${unread})` : t('app.notifications.open')
          }
          style={styles.bell}
        >
          <Bell size={22} color={color.text.primary} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={t('app.tabs.profile')}
          style={styles.avatar}
        >
          <Avatar
            url={me.data?.avatarUrl}
            firstName={me.data?.firstName}
            lastName={me.data?.lastName}
            size={44}
          />
        </Pressable>
      </View>

      {me.isError && <ErrorNote message={(me.error as Error).message} />}

      {me.isPending || (linked && memberships.isPending) ? (
        <Skeleton height={260} />
      ) : !linked ? (
        <Card style={styles.cta}>
          <Link2 size={26} color={color.accent[400]} />
          <Text style={type.h2}>{t('app.link.cta_title')}</Text>
          <Text style={type.bodySm}>{t('app.link.cta_text')}</Text>
          <Button label={t('app.join.cta')} icon={UserPlus} onPress={() => router.push('/join')} />
          <Button
            label={t('app.gyms.find')}
            icon={Building2}
            variant="secondary"
            onPress={() => router.push('/gyms')}
          />
          <Button
            label={t('app.link.cta_button')}
            icon={Link2}
            variant="secondary"
            onPress={() => router.push('/link')}
          />
        </Card>
      ) : current ? (
        <>
          <VisitCard />
          <MembershipCard
            membership={current}
            memberName={`${me.data!.member!.firstName} ${me.data!.member!.lastName}`}
            memberNumber={me.data!.member!.memberNumber}
          />
          {(current.displayStatus === 'active' || current.displayStatus === 'expiring_soon') && (
            <Button
              label={t('app.home.show_qr')}
              icon={QrCodeIcon}
              onPress={() => router.push('/card')}
            />
          )}
          {current.displayStatus !== 'active' && (
            <Button
              label={t(
                current.displayStatus === 'pending' ? 'app.renew.pending_cta' : 'app.renew.cta',
              )}
              icon={Ticket}
              variant="secondary"
              onPress={() => router.push('/renew')}
            />
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon={Ticket}
            title={t('app.membership.none_title')}
            text={t('app.membership.none_text')}
            action={<Button label={t('app.renew.cta')} onPress={() => router.push('/renew')} />}
          />
        </Card>
      )}

      {linked && <RateCard />}
      {me.data && <CaloriesCard />}

      {me.data && linked && <ProfileOverview linked showMembership={false} />}

      <BusyCard />

      {linked && <ChallengesCard />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: color.onAccent },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.bg.surface2,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: color.text.primary, fontFamily: fonts.bold, fontSize: 15 },
  cta: { gap: 12 },
  visit: { paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

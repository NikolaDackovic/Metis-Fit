import { router } from 'expo-router';
import {
  Building2,
  Coffee,
  IdCard,
  KeyRound,
  Map,
  MessageCircle,
  UserRoundCheck,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ClubGallery } from '@/components/ClubGallery';
import { ClubInfoCard } from '@/components/ClubInfoCard';
import { useConversations } from '@/components/ConversationList';
import { HubTile } from '@/components/HubTile';
import { RecentVisits } from '@/components/RecentVisits';
import { Screen, SectionTitle } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { clubShortName, currentMembership, useClub, useMe, useMyMemberships } from '@/lib/queries';
import { displayFont, type } from '@/theme';

/**
 * "Club": everything about the gym itself - my membership and payments, the café, the map and
 * machines, trainers, my locker, and the gym's hours, contact and photos.
 */
export default function ClubScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const club = useClub();
  const me = useMe();
  const linked = Boolean(me.data?.member);
  const current = currentMembership(useMyMemberships().data);
  const conversations = useConversations('/me/conversations', linked);
  const unread = (conversations.data ?? []).reduce((s, c) => s + c.unread, 0);
  const membershipText = current
    ? current.endDate
      ? `${current.planName} · ${t('app.hub.valid_until', {
          date: f.date(current.endDate, { day: 'numeric', month: 'short' }),
        })}`
      : current.planName
    : t('app.hub.membership_text');

  return (
    <Screen>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {clubShortName(club.data)}
      </Text>
      <View style={styles.list}>
        <HubTile
          icon={IdCard}
          title={t('app.hub.membership')}
          text={linked ? membershipText : t('app.hub.membership_text')}
          onPress={() => router.push(linked ? '/membership' : '/join')}
        />
        {(conversations.data?.length ?? 0) > 0 && (
          <HubTile
            icon={MessageCircle}
            title={unread ? `${t('app.chat.title')} (${unread})` : t('app.chat.title')}
            text={t('app.chat.member_hint')}
            onPress={() => router.push('/messages')}
          />
        )}
        <HubTile
          icon={Coffee}
          title={t('app.hub.cafe')}
          text={t('app.hub.cafe_text')}
          onPress={() => router.push('/cafe')}
        />
        <HubTile
          icon={Map}
          title={t('app.hub.map')}
          text={t('app.hub.map_text')}
          onPress={() => router.push('/explore')}
        />
        <HubTile
          icon={UserRoundCheck}
          title={t('app.hub.trainers')}
          text={t('app.hub.trainers_text')}
          onPress={() => router.push('/trainers')}
        />
        {linked && (
          <HubTile
            icon={KeyRound}
            title={t('app.hub.locker')}
            text={t('app.hub.locker_text')}
            onPress={() => router.push('/locker')}
          />
        )}
        <HubTile
          icon={Building2}
          title={t('app.hub.gyms')}
          text={t('app.hub.gyms_text')}
          onPress={() => router.push('/gyms')}
        />
      </View>

      <SectionTitle>{t('app.hub.about')}</SectionTitle>
      <ClubInfoCard />
      <ClubGallery />
      {linked && <RecentVisits />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  list: { gap: 10 },
});

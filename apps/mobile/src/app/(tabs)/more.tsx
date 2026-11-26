import { PLATFORM_NAME } from '@grit/design-tokens';
import { router, type Href } from 'expo-router';
import {
  Bell,
  Building2,
  CalendarPlus,
  ChevronRight,
  CircleHelp,
  FileText,
  Flame,
  LogOut,
  MessageCircle,
  Palette,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { useConversations } from '@/components/ConversationList';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { signOut } from '@/lib/auth';
import { useNotifications } from '@/lib/notifications';
import { clubShortName, useClub, useMe } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { useIsTrainer } from '@/lib/trainer';
import { color, displayFont, fonts, radius, type } from '@/theme';

function Item({
  icon: Icon,
  label,
  hint,
  badge,
  to,
  divider,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  badge?: number;
  to: Href;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(to)}
      accessibilityRole="link"
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.icon}>
        <Icon size={18} color={color.accent[400]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.bodySm}>{hint}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
      <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
    </Pressable>
  );
}

/**
 * "More" (⋯ at the end of the tab bar): everything that is not a daily action, one tap away:
 * my profile, messages, notifications, the gym (for trainers, whose bar has "Work" instead),
 * gyms, calendar, appearance, language, guide, legal, sign out.
 */
export default function MoreScreen() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const club = useClub();
  const linked = Boolean(me.data?.member);
  const isTrainer = useIsTrainer();
  const unread = useNotifications().data?.unread ?? 0;
  const conversations = useConversations('/me/conversations', linked);
  const unreadMessages = (conversations.data ?? []).reduce((s, c) => s + c.unread, 0);
  return (
    <Screen>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.more.title')}
      </Text>

      <Pressable onPress={() => router.push('/profile')} accessibilityRole="link" style={styles.me}>
        <Avatar
          url={me.data?.avatarUrl}
          firstName={me.data?.firstName}
          lastName={me.data?.lastName}
          size={52}
        />
        <View style={{ flex: 1 }}>
          <Text style={type.h3} numberOfLines={1}>
            {me.data ? `${me.data.firstName} ${me.data.lastName}` : ' '}
          </Text>
          <Text style={type.bodySm} numberOfLines={1}>
            {me.data?.member
              ? `${clubShortName(club.data)} · ${me.data.member.memberNumber}`
              : t('app.more.no_gym')}
          </Text>
        </View>
        <Text style={styles.link}>{t('app.more.profile')}</Text>
      </Pressable>

      <Card style={styles.card}>
        <Item icon={Bell} label={t('app.notifications.title')} badge={unread} to="/notifications" />
        {(conversations.data?.length ?? 0) > 0 && (
          <Item
            icon={MessageCircle}
            label={t('app.chat.title')}
            badge={unreadMessages}
            to="/messages"
            divider
          />
        )}
        <Item icon={Flame} label={t('app.hub.food')} to="/food-log" divider />
        {linked && (
          <Item
            icon={CalendarPlus}
            label={t('app.calendar.title')}
            hint={t('app.calendar.row_hint')}
            to="/calendar"
            divider
          />
        )}
      </Card>

      <SectionTitle>{t('app.more.gyms')}</SectionTitle>
      <Card style={styles.card}>
        {isTrainer && <Item icon={Building2} label={clubShortName(club.data)} to="/(tabs)/club" />}
        <Item
          icon={Building2}
          label={t('app.hub.gyms')}
          hint={t('app.hub.gyms_text')}
          to="/gyms"
          divider={isTrainer}
        />
      </Card>

      <SectionTitle>{t('app.profile.app')}</SectionTitle>
      <Card style={styles.card}>
        <Item icon={Palette} label={t('app.theme.title')} to="/appearance" />
        <View style={styles.divider}>
          <LanguagePicker row />
        </View>
        <Item icon={Settings} label={t('app.more.settings')} to="/profile" divider />
        <Item icon={CircleHelp} label={t('app.guide.open')} to="/guide" divider />
      </Card>

      <SectionTitle>{PLATFORM_NAME}</SectionTitle>
      <Card style={styles.card}>
        <Item icon={FileText} label={t('app.legal.terms')} to="/legal/terms" />
        <Item icon={ShieldCheck} label={t('app.legal.privacy')} to="/legal/privacy" divider />
      </Card>

      <Button
        label={t('admin.nav.sign_out')}
        icon={LogOut}
        variant="ghost"
        onPress={() => void signOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
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
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: color.onAccent },
});

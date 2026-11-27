import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationList } from '@/components/ConversationList';
import { ModeSwitch } from '@/components/ModeSwitch';
import { Screen } from '@/components/ui';
import { color, displayFont, type } from '@/theme';

/** Trainer mode "Messages": every conversation with my clients. */
export default function InboxTab() {
  const { t, i18n } = useTranslation();
  return (
    <Screen>
      <View style={styles.head}>
        <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
          {t('app.tabs.inbox')}
        </Text>
        <ModeSwitch />
      </View>
      <Text style={[type.bodySm, { color: color.text.secondary }]}>
        {t('app.schedule.inbox_hint')}
      </Text>
      <ConversationList
        path="/admin/my-conversations"
        emptyTitle={t('app.chat.no_clients')}
        onOpen={(c) =>
          router.push({
            pathname: '/coach/chat/[id]',
            params: { id: c.id, name: c.name, open: c.open ? '1' : '0' },
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  title: { flex: 1, fontSize: 26, lineHeight: 32 },
});

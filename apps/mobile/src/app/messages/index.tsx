import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { ConversationList } from '@/components/ConversationList';
import { Screen } from '@/components/ui';
import { type } from '@/theme';

/** F14-3: my conversations with my trainers. */
export default function MessagesScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <BackHeader title={t('app.chat.title')} />
      <Text style={type.bodySm}>{t('app.chat.member_hint')}</Text>
      <ConversationList
        path="/me/conversations"
        emptyTitle={t('app.chat.no_trainer')}
        onOpen={(c) =>
          router.push({
            pathname: '/messages/[id]',
            params: { id: c.id, name: c.name, open: c.open ? '1' : '0' },
          })
        }
      />
    </Screen>
  );
}

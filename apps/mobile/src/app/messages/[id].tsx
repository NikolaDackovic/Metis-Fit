import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chat } from '@/components/Chat';

/** F14-3: conversation with one of my trainers. */
export default function MemberChatScreen() {
  const { id, name, open } = useLocalSearchParams<{ id: string; name?: string; open?: string }>();
  const { t } = useTranslation();
  return (
    <Chat
      title={name || t('app.chat.trainer')}
      path={`/me/conversations/${id}/messages`}
      canWrite={open !== '0'}
    />
  );
}

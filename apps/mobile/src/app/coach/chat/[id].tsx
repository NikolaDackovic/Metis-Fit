import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chat } from '@/components/Chat';

/** F14-3: the trainer's conversation with one client. */
export default function CoachChatScreen() {
  const { id, name, open } = useLocalSearchParams<{ id: string; name?: string; open?: string }>();
  const { t } = useTranslation();
  return (
    <Chat
      title={name || t('app.coach.client')}
      path={`/admin/my-conversations/${id}/messages`}
      canWrite={open !== '0'}
    />
  );
}

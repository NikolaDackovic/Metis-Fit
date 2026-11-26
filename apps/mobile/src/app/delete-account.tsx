import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { BackButton } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Field, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { signOut } from '@/lib/auth';
import { color, fonts, type } from '@/theme';

/**
 * Account deletion (App Store rule, right to erasure). Explains what is removed and what the
 * club must keep, then asks the person to type a confirmation word.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const [word, setWord] = useState('');
  const expected = t('app.account.confirm_word');
  const del = useMutation({
    mutationFn: () => api.post('/me/delete-account', { confirm: true }),
    onSuccess: async () => {
      await signOut().catch(() => undefined);
      router.replace('/(auth)');
    },
  });
  const ok = word.trim().toLocaleUpperCase() === expected.toLocaleUpperCase();
  const item = (Icon: typeof Check, text: string, tone: string) => (
    <View style={styles.item} key={text}>
      <Icon size={16} color={tone} />
      <Text style={[type.bodySm, { flex: 1 }]}>{text}</Text>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Text style={type.h1}>{t('app.account.delete_title')}</Text>
      <Text style={type.bodySm}>{t('app.account.delete_text')}</Text>

      <Card style={{ gap: 10 }}>
        <Text style={styles.head}>{t('app.account.removed_title')}</Text>
        {(
          [
            'removed_profile',
            'removed_training',
            'removed_photos',
            'removed_notifications',
          ] as const
        ).map((k) => item(X, t(`app.account.${k}`), color.status.danger))}
        <Text style={[styles.head, { marginTop: 6 }]}>{t('app.account.kept_title')}</Text>
        {item(Check, t('app.account.kept_records'), color.text.secondary)}
      </Card>
      <Text style={styles.hint}>{t('app.account.export_first')}</Text>

      <Field
        label={t('app.account.type_word', { word: expected })}
        value={word}
        onChangeText={setWord}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {del.error && (
        <ErrorNote
          message={del.error instanceof ApiError ? del.error.message : 'errors.internal'}
        />
      )}
      <Button
        label={t('app.account.delete_button')}
        icon={Trash2}
        variant="danger"
        disabled={!ok}
        loading={del.isPending}
        onPress={() => del.mutate()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  head: { color: color.text.primary, fontFamily: fonts.semibold, fontSize: 15 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hint: { color: color.text.secondary, fontFamily: fonts.regular, fontSize: 13 },
});

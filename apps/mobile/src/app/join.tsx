import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorNote, Field, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { cleanPhone, parseBirthDate } from '@/lib/join';
import { useMe } from '@/lib/queries';
import { color, fonts, type } from '@/theme';

/** New to the club: the account becomes a member profile (no front-desk visit needed). */
export default function JoinScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useMe();
  const [phone, setPhone] = useState(me.data?.phone ?? '');
  const [dob, setDob] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: (body: { phone?: string; dateOfBirth?: string }) => api.post('/me/member', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/renew');
    },
  });

  function submit() {
    setLocalError(null);
    const p = cleanPhone(phone);
    if (p === undefined) return setLocalError('validation.invalid_phone');
    const d = parseBirthDate(dob);
    if (d === undefined) return setLocalError('validation.invalid_date');
    join.mutate({ phone: p ?? undefined, dateOfBirth: d ?? undefined });
  }

  const error =
    localError ??
    (join.error ? (join.error instanceof ApiError ? join.error.message : 'errors.internal') : null);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={8}
        >
          <X size={24} color={color.text.primary} />
        </Pressable>
      </View>
      <Text style={type.h1}>{t('app.join.title')}</Text>
      <Text style={type.bodySm}>{t('app.join.text')}</Text>
      <View style={{ gap: 14 }}>
        <Field
          label={t('app.auth.phone_optional')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Field
          label={t('app.auth.dob_optional')}
          value={dob}
          onChangeText={setDob}
          placeholder="15.05.1995"
          keyboardType="numbers-and-punctuation"
        />
        {error && <ErrorNote message={error} />}
        {error === 'errors.member.use_link_code' && (
          <Button
            label={t('app.link.cta_button')}
            variant="secondary"
            onPress={() => router.replace('/link')}
          />
        )}
        <Button label={t('app.join.submit')} onPress={submit} loading={join.isPending} />
        <Text style={styles.hint}>{t('app.join.next_step')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end', paddingTop: 8 },
  hint: { color: color.text.secondary, fontFamily: fonts.regular, fontSize: 13 },
});

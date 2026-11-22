import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, ErrorNote, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, fonts, radius, type } from '@/theme';

/** Links the signed-in account to a member profile using the 6-digit code from reception. */
export default function LinkScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');

  const link = useMutation({
    mutationFn: () => api.post('/me/link', { code }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
    },
  });

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
      <Text style={type.h1}>{t('app.link.title')}</Text>
      <Text style={type.bodySm}>{t('app.link.text')}</Text>

      <TextInput
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        accessibilityLabel={t('app.link.code')}
        placeholder="••••••"
        placeholderTextColor={color.text.muted}
        style={styles.code}
      />
      {link.error && (
        <ErrorNote
          message={link.error instanceof ApiError ? link.error.message : 'errors.internal'}
        />
      )}
      <Button
        label={t('app.link.submit')}
        onPress={() => link.mutate()}
        disabled={code.length !== 6}
        loading={link.isPending}
      />
      <Text style={styles.hint}>{t('app.link.where')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end', paddingTop: 8 },
  code: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.strong,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.bold,
    fontSize: 34,
    letterSpacing: 14,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    color: color.text.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
});

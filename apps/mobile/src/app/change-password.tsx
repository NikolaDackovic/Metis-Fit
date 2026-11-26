import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { changePassword, passwordOk } from '@/lib/auth';
import { color, fonts, type } from '@/theme';

/** Profile → change password: current one first, then the new one twice. */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function save() {
    setError(null);
    if (!current) return setError('validation.required');
    if (!passwordOk(next)) return setError('app.auth.password_rules');
    if (next !== again) return setError('app.auth.password_mismatch');
    setLoading(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <BackHeader title={t('app.auth.change_password')} />
      <Text style={type.bodySm}>{t('app.auth.password_rules')}</Text>
      <Card style={{ gap: 14 }}>
        <Field
          label={t('app.auth.current_password')}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Field
          label={t('app.auth.new_password')}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label={t('app.auth.repeat_password')}
          value={again}
          onChangeText={setAgain}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={() => void save()}
        />
        {error && <ErrorNote message={error} />}
        {done && (
          <Text style={{ color: color.status.success, fontFamily: fonts.medium, fontSize: 14 }}>
            {t('app.auth.password_changed')}
          </Text>
        )}
        <Button label={t('app.auth.save_password')} onPress={() => void save()} loading={loading} />
        {done && (
          <Button label={t('app.common.back')} variant="secondary" onPress={() => router.back()} />
        )}
      </Card>
    </Screen>
  );
}

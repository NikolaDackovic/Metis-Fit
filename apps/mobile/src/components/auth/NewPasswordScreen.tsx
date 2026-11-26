import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { AuthBackdrop } from '@/components/AuthBackdrop';
import { PlatformWordmark } from '@/components/PlatformWordmark';
import { Button, ErrorNote, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { passwordOk, setNewPassword } from '@/lib/auth';
import { type } from '@/theme';

/** Shown after opening a "reset password" email: choose the new password, then the app opens. */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setError(null);
    if (!passwordOk(pw)) return setError('app.auth.password_rules');
    if (pw !== again) return setError('app.auth.password_mismatch');
    setLoading(true);
    try {
      await setNewPassword(pw);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
      setLoading(false);
    }
  }

  return (
    <AuthBackdrop>
      <Screen edges={['top', 'bottom']} transparent>
        <View style={styles.wrap}>
          <View style={styles.hero}>
            <PlatformWordmark width={240} />
            <Text style={[type.h2, { textAlign: 'center' }]}>
              {t('app.auth.new_password_title')}
            </Text>
            <Text style={[type.bodySm, { textAlign: 'center' }]}>
              {t('app.auth.password_hint')}
            </Text>
          </View>
          <View style={{ gap: 14 }}>
            <Field
              label={t('app.auth.new_password')}
              value={pw}
              onChangeText={setPw}
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
            <Button
              label={t('app.auth.save_password')}
              onPress={() => void save()}
              loading={loading}
            />
          </View>
        </View>
      </Screen>
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 28 },
  hero: { alignItems: 'center', gap: 12 },
});

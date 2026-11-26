import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthBackdrop } from '@/components/AuthBackdrop';
import { LanguagePicker } from '@/components/LanguagePicker';
import { PlatformWordmark } from '@/components/PlatformWordmark';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button, ErrorNote, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AUTH_MODE, requestPasswordReset, signIn } from '@/lib/auth';
import { color, displayFont, fonts, type } from '@/theme';

/** Accounts created by `pnpm db:dev` (local development only). */
const DEV_MEMBER = 'clan@grit.local';

export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState(AUTH_MODE === 'dev' ? DEV_MEMBER : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('validation.invalid_email');
    if (AUTH_MODE !== 'dev' && !password) return setError('validation.required');
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('validation.invalid_email');
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setInfo('app.auth.reset_sent');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
    }
  }

  return (
    <AuthBackdrop>
      <Screen edges={['top', 'bottom']} transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.wrap}
        >
          <View style={styles.top}>
            <LanguagePicker compact />
          </View>
          <View style={styles.hero}>
            <PlatformWordmark width={300} />
            <Text
              style={[type.display, styles.tagline, { fontFamily: displayFont(i18n.language) }]}
            >
              {t('app.auth.tagline')}
            </Text>
            <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.auth.subtitle')}</Text>
          </View>

          <View style={styles.form}>
            {AUTH_MODE === 'dev' && (
              <View style={styles.devNote}>
                <Text style={styles.devText}>{t('app.auth.dev_hint')}</Text>
              </View>
            )}
            <Field
              label={t('admin.fields.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
            />
            {AUTH_MODE !== 'dev' && (
              <Field
                label={t('admin.login.password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
            )}
            {error && <ErrorNote message={error} />}
            {info && <Text style={styles.info}>{t(info)}</Text>}
            <Button
              label={t('admin.login.submit')}
              onPress={() => void submit()}
              loading={loading}
            />
            {AUTH_MODE !== 'dev' && (
              <Pressable onPress={() => void forgot()} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>{t('app.auth.forgot')}</Text>
              </Pressable>
            )}
            {AUTH_MODE !== 'dev' && (
              <>
                <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.auth.or')}</Text>
                <GoogleButton onError={setError} />
              </>
            )}
          </View>

          <View style={styles.bottom}>
            <Text style={type.bodySm}>{t('app.auth.no_account')} </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" hitSlop={8}>
                <Text style={styles.link}>{t('app.auth.register')}</Text>
              </Pressable>
            </Link>
          </View>
        </KeyboardAvoidingView>
      </Screen>
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', gap: 24 },
  top: { alignItems: 'flex-end', paddingTop: 8 },
  hero: { alignItems: 'center', gap: 14, paddingTop: 24 },
  logo: { width: 170, height: 45 },
  tagline: { textAlign: 'center', fontSize: 22, lineHeight: 28, marginTop: 8 },
  form: { gap: 14 },
  devNote: {
    borderWidth: 1,
    borderColor: `${color.status.warning}66`,
    borderRadius: 4,
    padding: 10,
  },
  devText: { color: color.status.warning, fontFamily: fonts.medium, fontSize: 13 },
  info: { color: color.status.success, fontFamily: fonts.medium, fontSize: 13 },
  link: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 14, textAlign: 'center' },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 8,
  },
});

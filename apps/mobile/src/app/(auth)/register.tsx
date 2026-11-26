import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorNote, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { signUp } from '@/lib/auth';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, type } from '@/theme';

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('validation.required');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('validation.invalid_email');
    if (form.password.length < 10) return setError('app.auth.password_rules');
    setLoading(true);
    try {
      const result = await signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        locale: i18n.language,
        // Account only: a gym membership comes from the gym (desk) or by choosing a gym later.
        join: null,
      });
      // 'signedIn' (dev): the root layout moves on to the tabs by itself.
      if (result === 'confirm') setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        style={styles.back}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <Text style={type.h1}>{t('app.auth.register_title')}</Text>
      <Text style={type.bodySm}>{t('app.auth.register_hint')}</Text>

      {done ? (
        <View style={styles.done}>
          <Text style={type.h3}>{t('app.auth.check_email_title')}</Text>
          <Text style={type.bodySm}>{t('app.auth.check_email', { email: form.email })}</Text>
          <Button
            label={t('admin.login.submit')}
            variant="secondary"
            onPress={() => router.replace('/(auth)')}
          />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Field
            label={t('admin.fields.first_name')}
            value={form.firstName}
            onChangeText={set('firstName')}
            autoComplete="given-name"
          />
          <Field
            label={t('admin.fields.last_name')}
            value={form.lastName}
            onChangeText={set('lastName')}
            autoComplete="family-name"
          />
          <Field
            label={t('admin.fields.email')}
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label={t('admin.login.password')}
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Text style={styles.hint}>{t('app.auth.password_rules')}</Text>

          <View style={styles.info}>
            <Text style={styles.hint}>{t('app.auth.account_only')}</Text>
          </View>
          {error && <ErrorNote message={error} />}
          <Button label={t('app.auth.register')} onPress={() => void submit()} loading={loading} />
          <Text style={styles.hint}>{t('app.auth.terms_note')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  done: { gap: 12 },
  hint: { color: color.text.secondary, fontFamily: fonts.regular, fontSize: 13 },
  info: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
});

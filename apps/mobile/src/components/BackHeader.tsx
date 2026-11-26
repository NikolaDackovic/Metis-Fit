import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dirIcon } from '@/lib/rtl';
import { color, type } from '@/theme';

/** Title row with a back arrow, for screens opened from a tab (Club, Health, Profile...). */
export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={10}
      >
        <ArrowLeft style={dirIcon} size={24} color={color.text.primary} />
      </Pressable>
      <Text style={[type.h1, styles.title]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

BackHeader.stickyTop = true;

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Just the back arrow; Screen keeps it fixed at the top while the content scrolls. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress ?? goBack}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel={t('app.common.back')}
      hitSlop={8}
    >
      <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
    </Pressable>
  );
}
BackButton.stickyTop = true;

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  title: { flex: 1, fontSize: 24, lineHeight: 30 },
});

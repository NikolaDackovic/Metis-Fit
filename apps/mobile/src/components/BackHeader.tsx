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
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  title: { flex: 1, fontSize: 24, lineHeight: 30 },
});

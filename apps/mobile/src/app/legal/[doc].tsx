import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Card, Screen } from '@/components/ui';
import { color, fonts, type } from '@/theme';

const DOCS = { terms: 6, privacy: 7 } as const;
type Doc = keyof typeof DOCS;

/**
 * F15-1: terms of use and privacy policy in plain language. A lawyer reviews the final wording
 * before launch (docs/OPEN_QUESTIONS.md A16); the text lives in the translation catalogs.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t } = useTranslation();
  const d: Doc = doc === 'privacy' ? 'privacy' : 'terms';
  const sections = Array.from({ length: DOCS[d] }, (_, i) => i + 1);
  return (
    <Screen>
      <BackHeader title={t(`app.legal.${d}`)} />
      <Text style={type.bodySm}>{t(`app.legal.${d}_doc.intro`)}</Text>
      <Card style={{ gap: 18 }}>
        {sections.map((n) => (
          <View key={n} style={{ gap: 6 }}>
            <Text style={type.h3}>{t(`app.legal.${d}_doc.s${n}_title`)}</Text>
            <Text style={[type.body, styles.text]}>{t(`app.legal.${d}_doc.s${n}_text`)}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.updated}>{t('app.legal.updated', { date: '22.11.2026.' })}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: color.text.secondary },
  updated: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: color.text.muted,
  },
});

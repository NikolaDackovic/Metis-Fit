import { router } from 'expo-router';
import { Activity, Camera, Droplets, LineChart, Salad, Utensils } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { HubTile } from '@/components/HubTile';
import { WeekCard } from '@/components/training/WeekCard';
import { Screen, SectionTitle } from '@/components/ui';
import { displayFont, type } from '@/theme';

/**
 * "Health": everything a member tracks about their life outside the workout itself - daily habits,
 * food, activities and body progress - with this week's summary on top.
 */
export default function HealthScreen() {
  const { t, i18n } = useTranslation();
  return (
    <Screen>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.tabs.health')}
      </Text>
      <Text style={type.bodySm}>{t('app.hub.health_intro')}</Text>
      <WeekCard shortcuts={false} />
      <SectionTitle>{t('app.hub.track')}</SectionTitle>
      <View style={styles.list}>
        <HubTile
          icon={Droplets}
          title={t('app.hub.today')}
          text={t('app.hub.today_text')}
          onPress={() => router.push('/today')}
        />
        <HubTile
          icon={Utensils}
          title={t('app.hub.food')}
          text={t('app.hub.food_text')}
          onPress={() => router.push('/food-log')}
        />
        <HubTile
          icon={Salad}
          title={t('app.hub.nutrition')}
          text={t('app.hub.nutrition_text')}
          onPress={() => router.push('/nutrition')}
        />
        <HubTile
          icon={Activity}
          title={t('app.hub.activities')}
          text={t('app.hub.activities_text')}
          onPress={() => router.push('/activities')}
        />
        <HubTile
          icon={LineChart}
          title={t('app.hub.progress')}
          text={t('app.hub.progress_text')}
          onPress={() => router.push({ pathname: '/classes', params: { view: 'progress' } })}
        />
        <HubTile
          icon={Camera}
          title={t('app.photos.title')}
          text={t('app.photos.tile_text')}
          onPress={() => router.push('/progress-photos')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  list: { gap: 10 },
});

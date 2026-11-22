import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle, Skeleton } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useMyVisits } from '@/lib/queries';
import { color, type } from '@/theme';

/** My last five entries to the gym. */
export function RecentVisits() {
  const { t } = useTranslation();
  const f = useFormat();
  const visits = useMyVisits();
  return (
    <>
      <SectionTitle>{t('app.home.recent_visits')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {visits.isPending ? (
          <Skeleton height={48} style={{ marginVertical: 12 }} />
        ) : !visits.data?.length ? (
          <Text style={[type.bodySm, { paddingVertical: 12 }]}>{t('app.home.no_visits')}</Text>
        ) : (
          visits.data.slice(0, 5).map((v, i) => (
            <View key={v.id} style={[styles.visit, i > 0 && styles.divider]}>
              <Text style={type.body}>{f.dateTime(v.occurredAt)}</Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  visit: { paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});

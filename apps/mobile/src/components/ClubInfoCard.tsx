import { Clock3, MapPin, Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Skeleton } from '@/components/ui';
import { clubWeekday } from '@/lib/format';
import { useClub } from '@/lib/queries';
import { color, type } from '@/theme';

/** Today's opening hours, address and phone of the current gym. */
export function ClubInfoCard() {
  const { t } = useTranslation();
  const { data } = useClub();
  if (!data) return <Skeleton height={120} />;
  const today = data.openingHours.find((h) => h.weekday === clubWeekday());
  const phone = typeof data.info.phone === 'string' ? data.info.phone : null;
  const address = typeof data.info.address === 'string' ? data.info.address : null;
  return (
    <Card style={{ gap: 12 }}>
      <Row icon={<Clock3 size={18} color={color.accent[400]} />}>
        {today
          ? today.isClosed
            ? t('app.home.closed_today')
            : t('app.home.open_today', { from: today.opensAt, to: today.closesAt })
          : t('app.home.hours_unknown')}
      </Row>
      {address && <Row icon={<MapPin size={18} color={color.accent[400]} />}>{address}</Row>}
      {phone && (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
          accessibilityRole="link"
        >
          <Row icon={<Phone size={18} color={color.accent[400]} />}>{phone}</Row>
        </Pressable>
      )}
    </Card>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.row}>
      {icon}
      <Text style={[type.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

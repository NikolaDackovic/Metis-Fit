import type { EquipmentStatus } from '@grit/validation';
import { CheckCircle2, Wrench, XCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '@/lib/rtl';
import { color, fonts, radius } from '@/theme';

const MAP = {
  available: { c: color.status.success, Icon: CheckCircle2 },
  maintenance: { c: color.status.warning, Icon: Wrench },
  out_of_service: { c: color.status.danger, Icon: XCircle },
} as const;

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const { t } = useTranslation();
  const { c, Icon } = MAP[status];
  return (
    <View style={[styles.badge, { borderColor: `${c}66`, backgroundColor: `${c}1A` }]}>
      <Icon size={12} color={c} />
      <Text style={[styles.text, { color: c }]}>{t(`equipment.status.${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: spacing(0.5),
    textTransform: 'uppercase',
  },
});

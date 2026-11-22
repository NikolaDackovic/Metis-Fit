import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

/** One clear row of a hub screen: icon, what it is, one line on what you do there. */
export function HubTile({
  icon: Icon,
  title,
  text,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={text}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.icon}>
        <Icon size={22} color={color.accent[400]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={type.bodySm} numberOfLines={2}>
          {text}
        </Text>
      </View>
      <ChevronRight style={dirIcon} size={20} color={color.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.semibold, fontSize: 16, color: color.text.primary },
});

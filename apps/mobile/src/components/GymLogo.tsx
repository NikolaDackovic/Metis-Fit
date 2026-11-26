import { Image, StyleSheet, Text, View } from 'react-native';
import { color, fonts } from '@/theme';

/** A gym's uploaded logo, or its initials in a tinted circle when it has none. */
export function GymLogo({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (logoUrl)
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.img, box]}
        resizeMode="cover"
        accessibilityLabel={name}
      />
    );
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.badge, box]} accessibilityLabel={name}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: color.bg.surface2 },
  badge: { backgroundColor: color.accent.tint, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.bold, color: color.accent[400] },
});

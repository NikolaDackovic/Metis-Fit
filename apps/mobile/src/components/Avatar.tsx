import { Image, StyleSheet, Text, View } from 'react-native';
import { color, fonts } from '@/theme';

/** Profile photo, or initials when there is none. */
export function Avatar({
  url,
  firstName,
  lastName,
  size = 48,
}: {
  url: string | null | undefined;
  firstName?: string;
  lastName?: string;
  size?: number;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={[styles.base, box]} accessible={false} />;
  return (
    <View style={[styles.base, styles.initials, box]}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>
        {(firstName?.[0] ?? '').toUpperCase()}
        {(lastName?.[0] ?? '').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: color.bg.surface2 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent.tint },
  text: { fontFamily: fonts.bold, color: color.accent[400] },
});

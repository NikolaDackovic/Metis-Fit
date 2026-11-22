import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { color } from '@/theme';
import hall from '../../assets/club/main-hall.jpg';

/** The same darkened gym photo behind every sign-in screen, whatever the gym (platform look). */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={hall}
        style={styles.photo}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.shade} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg.base },
  photo: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', opacity: 0.28 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,8,8,0.62)' },
});

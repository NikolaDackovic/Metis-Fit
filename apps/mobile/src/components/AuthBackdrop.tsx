import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { color } from '@/theme';
import boxing from '../../assets/club/backdrop-boxing.jpg';
import cardio from '../../assets/club/backdrop-cardio.jpg';
import lifting from '../../assets/club/backdrop-lifting.jpg';
import hall from '../../assets/club/main-hall.jpg';

/** Several gyms, not one: the darkened photo behind the sign-in screens fades through a few. */
const PHOTOS = [hall, cardio, lifting, boxing];
const EVERY_MS = 6000;

export function AuthBackdrop({ children }: { children: ReactNode }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => {
        setI((n) => (n + 1) % PHOTOS.length);
        Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }).start();
      });
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [fade]);
  return (
    <View style={styles.wrap}>
      <Animated.Image
        source={PHOTOS[i]}
        style={[styles.photo, { opacity: Animated.multiply(fade, 0.28) }]}
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
  photo: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,8,8,0.62)' },
});

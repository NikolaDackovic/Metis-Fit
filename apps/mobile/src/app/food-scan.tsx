import type { FoodDto } from '@grit/validation';
import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, PackageSearch, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, ErrorNote, Field, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, displayFont, fonts, radius, type } from '@/theme';

const CODE = /^[0-9]{6,14}$/;

/**
 * F15-2 barcode: point the camera at a product's barcode (or type the number). Found → the
 * amount screen; not found → add it as my own food with that barcode, once, for next time.
 */
export default function FoodScanScreen() {
  const { meal, day } = useLocalSearchParams<{ meal?: string; day?: string }>();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const box = Math.max(200, Math.min(width - 48, 340));
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const busy = useRef(false);
  const lookup = useMutation({
    mutationFn: (code: string) => api.get<FoodDto>(`/me/foods/barcode/${code}`),
    onSuccess: (f) =>
      router.replace({ pathname: '/food-add', params: { meal, day, foodId: f.id } }),
    onSettled: () => {
      busy.current = false;
    },
  });
  const onCode = (code: string) => {
    if (busy.current || lookup.isPending || lookup.isError || !CODE.test(code)) return;
    busy.current = true;
    lookup.mutate(code);
  };
  const notFound =
    lookup.error instanceof ApiError && lookup.error.message === 'errors.food.barcode_not_found';

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={10}
        >
          <X size={26} color={color.text.primary} />
        </Pressable>
      </View>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.food_scan.title')}
      </Text>

      {notFound ? (
        <View style={styles.center}>
          <PackageSearch size={64} color={color.accent[400]} />
          <Text style={[type.h2, { textAlign: 'center' }]}>{t('app.food_scan.not_found')}</Text>
          <Text style={[type.body, styles.muted]}>{t('app.food_scan.not_found_text')}</Text>
          <Button
            label={t('app.food_add.new')}
            onPress={() =>
              router.replace({
                pathname: '/food-new',
                params: { meal, day, barcode: lookup.variables ?? '' },
              })
            }
          />
          <Button label={t('app.scan.again')} variant="secondary" onPress={() => lookup.reset()} />
        </View>
      ) : (
        <>
          {permission?.granted ? (
            <View style={[styles.frame, { width: box, height: box * 0.7 }]}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={({ data }) => onCode(data)}
              />
              <View style={styles.line} />
            </View>
          ) : permission ? (
            <View style={styles.center}>
              <Camera size={48} color={color.accent[400]} />
              <Text style={[type.body, styles.muted]}>{t('app.food_scan.permission')}</Text>
              <Button label={t('app.scan.allow')} onPress={() => void requestPermission()} />
            </View>
          ) : null}
          <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.food_scan.hint')}</Text>
          {lookup.isPending && <Text style={styles.wait}>{t('app.food_scan.looking')}</Text>}
          {lookup.error && !notFound && (
            <ErrorNote
              message={lookup.error instanceof ApiError ? lookup.error.message : 'errors.internal'}
            />
          )}
          <View style={styles.manual}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('app.food_scan.type')}
                value={typed}
                onChangeText={(v) => setTyped(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={14}
                placeholder="8600000000000"
              />
            </View>
          </View>
          <Button
            label={t('app.food_scan.find')}
            variant="secondary"
            disabled={!CODE.test(typed)}
            loading={lookup.isPending}
            onPress={() => {
              lookup.reset();
              busy.current = false;
              onCode(typed);
            }}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 },
  title: { fontSize: 24, lineHeight: 30 },
  center: { alignItems: 'center', gap: 14, paddingVertical: 16 },
  muted: { textAlign: 'center', color: color.text.secondary },
  frame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.accent[500],
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  line: { height: 2, marginHorizontal: 24, backgroundColor: color.accent[500], opacity: 0.8 },
  wait: { textAlign: 'center', fontFamily: fonts.semibold, color: color.text.secondary },
  manual: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
});

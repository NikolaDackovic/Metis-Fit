import type { AccessResultDto } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Camera, CheckCircle2, X, XCircle } from 'lucide-react-native';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, ErrorNote, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, displayFont, fonts, radius, type } from '@/theme';

/**
 * F13-6 "Scan the entry code": the member points the phone at the code on the screen by the door
 * and gets in when the membership is valid (same rules as at the desk).
 */
export default function ScanScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const box = Math.min(width - 48, 340);
  const [permission, requestPermission] = useCameraPermissions();
  const busy = useRef(false);
  const checkin = useMutation({
    mutationFn: (token: string) => api.post<AccessResultDto>('/me/checkin', { token }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onSettled: () => {
      busy.current = false;
    },
  });
  const result = checkin.data;

  const onScan = (data: string) => {
    if (busy.current || checkin.isPending || result) return;
    if (!data.startsWith('K1.')) return; // not a door code (e.g. some other QR)
    busy.current = true;
    checkin.mutate(data);
  };

  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
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
        {t('app.scan.title')}
      </Text>

      {result ? (
        <View style={styles.center}>
          {result.result === 'granted' ? (
            <CheckCircle2 size={96} color={color.status.success} />
          ) : (
            <XCircle size={96} color={color.status.danger} />
          )}
          <Text style={[type.h1, { textAlign: 'center' }]}>
            {result.result === 'granted' ? t('app.scan.granted') : t('app.scan.denied')}
          </Text>
          {result.result === 'denied' && (
            <Text style={[type.body, { textAlign: 'center' }]}>
              {t(`app.scan.reasons.${result.reasonCode}`, {
                defaultValue: t('app.scan.reasons.other'),
              })}
            </Text>
          )}
          {result.membership && (
            <Text style={[type.bodySm, { textAlign: 'center' }]}>{result.membership.planName}</Text>
          )}
          <Button label={t('common.close')} onPress={() => router.back()} />
          {result.result === 'denied' && (
            <Button
              label={t('app.scan.again')}
              variant="secondary"
              onPress={() => checkin.reset()}
            />
          )}
        </View>
      ) : !permission ? null : !permission.granted ? (
        <View style={styles.center}>
          <Camera size={56} color={color.accent[400]} />
          <Text style={[type.body, { textAlign: 'center' }]}>{t('app.scan.permission')}</Text>
          <Button label={t('app.scan.allow')} onPress={() => void requestPermission()} />
        </View>
      ) : (
        <View style={styles.center}>
          <View style={[styles.frame, { width: box, height: box }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onScan(data)}
            />
          </View>
          <Text style={[type.body, { textAlign: 'center' }]}>{t('app.scan.hint')}</Text>
          {checkin.isPending && <Text style={styles.wait}>{t('app.scan.checking')}</Text>}
          {checkin.error ? (
            <>
              <ErrorNote
                message={
                  checkin.error instanceof ApiError ? checkin.error.message : 'errors.internal'
                }
              />
              <Button
                label={t('app.scan.again')}
                variant="secondary"
                onPress={() => checkin.reset()}
              />
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 },
  title: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 16 },
  frame: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: color.accent[500],
    backgroundColor: '#000',
  },
  wait: { color: color.text.secondary, fontFamily: fonts.semibold, fontSize: 14 },
});

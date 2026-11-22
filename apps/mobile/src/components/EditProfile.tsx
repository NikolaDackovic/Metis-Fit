import type { MeDto } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { color, fonts, type } from '@/theme';
import { Avatar } from './Avatar';
import { Button, Card, ErrorNote, Field } from './ui';

/** Square 600 px JPEG as base64 (keeps uploads small and strips camera metadata). */
async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const ctx = ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 600 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
}

/** Profile card with photo and name, editable in place. */
export function EditProfile({ me, subtitle }: { me: MeDto; subtitle: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(me.firstName);
  const [last, setLast] = useState(me.lastName);
  const update = (data: MeDto) => qc.setQueryData(['me'], data);
  const save = useMutation({
    mutationFn: () => api.patch<MeDto>('/me', { firstName: first.trim(), lastName: last.trim() }),
    onSuccess: (d) => {
      update(d);
      setEditing(false);
    },
  });
  const photo = useMutation({
    mutationFn: async () => {
      const image = await pickPhoto();
      return image ? api.put<MeDto>('/me/avatar', { image }) : null;
    },
    onSuccess: (d) => d && update(d),
  });
  const removePhoto = useMutation({
    mutationFn: () => api.del<MeDto>('/me/avatar'),
    onSuccess: update,
  });
  const error = save.error ?? photo.error ?? removePhoto.error;

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.row}>
        <Pressable
          onPress={() => photo.mutate()}
          accessibilityRole="button"
          accessibilityLabel={t('app.profile.change_photo')}
          style={styles.avatarWrap}
        >
          <Avatar url={me.avatarUrl} firstName={me.firstName} lastName={me.lastName} size={72} />
          <View style={styles.camera}>
            <Camera size={14} color={color.onAccent} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>
            {me.firstName} {me.lastName}
          </Text>
          <Text style={type.bodySm}>{subtitle}</Text>
        </View>
        {!editing && (
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={t('app.profile.edit')}
            hitSlop={8}
            style={styles.icon}
          >
            <Pencil size={18} color={color.text.secondary} />
          </Pressable>
        )}
      </View>
      {photo.isPending && <Text style={type.bodySm}>{t('app.profile.uploading')}</Text>}
      {me.avatarUrl && !editing && (
        <Pressable
          onPress={() => removePhoto.mutate()}
          accessibilityRole="button"
          style={styles.remove}
        >
          <Trash2 size={14} color={color.text.muted} />
          <Text style={styles.removeText}>{t('app.profile.remove_photo')}</Text>
        </Pressable>
      )}
      {editing && (
        <View style={{ gap: 12 }}>
          <Field
            label={t('app.profile.first_name')}
            value={first}
            onChangeText={setFirst}
            maxLength={80}
          />
          <Field
            label={t('app.profile.last_name')}
            value={last}
            onChangeText={setLast}
            maxLength={80}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setEditing(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('common.save')}
                loading={save.isPending}
                disabled={!first.trim() || !last.trim()}
                onPress={() => save.mutate()}
              />
            </View>
          </View>
        </View>
      )}
      {error && (
        <ErrorNote message={error instanceof ApiError ? error.message : 'errors.internal'} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  camera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.bg.surface,
  },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  removeText: { fontFamily: fonts.medium, fontSize: 13, color: color.text.muted },
});

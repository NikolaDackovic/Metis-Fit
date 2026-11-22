import { Platform, Share } from 'react-native';
import { api } from './api';

/**
 * "Download my data": the API returns everything the club stores about the person.
 * Web saves a JSON file; on a phone the system share sheet opens (save to Files, mail...).
 */
export async function exportMyData(title: string): Promise<void> {
  const data = await api.get<unknown>('/me/export');
  const json = JSON.stringify(data, null, 2);
  const name = `moji-podaci-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title, message: json });
}

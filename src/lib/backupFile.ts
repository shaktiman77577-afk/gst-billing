import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Writes the backup to a file and opens the share menu (Drive, WhatsApp, Files...).
export async function shareBackupFile(json: string): Promise<void> {
  const d = new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const file = new File(Paths.cache, `GSTBilling-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'GST Billing backup' });
}

// Lets the user pick a backup file; returns its text (or null if cancelled).
export async function pickBackupFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  return new File(res.assets[0].uri).text();
}

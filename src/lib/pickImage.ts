import * as ImagePicker from 'expo-image-picker';

const MAX_BASE64 = 1_500_000; // ~1.1 MB image

// Opens the gallery (with crop) and returns the image as a data URI.
// Returns null if cancelled, 'too-big' if the image is too large.
export async function pickImage(aspect: [number, number]): Promise<string | null | 'too-big'> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.5,
    base64: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (!a.base64) return null;
  if (a.base64.length > MAX_BASE64) return 'too-big';
  return `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}`;
}

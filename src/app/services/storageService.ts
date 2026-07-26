import { supabase } from '../../supabase';

const AVATAR_BUCKET      = 'avatars';
const ATTACHMENT_BUCKET  = 'logbook-attachments';

/**
 * Generates a short-lived signed URL for a private logbook attachment.
 * @param storagePath  The path inside the bucket, e.g. "userId/entryId/uuid.pdf"
 * @param expiresIn    Seconds until the URL expires (default: 1 hour)
 */
export async function getSignedAttachmentUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  // Strip any full URL prefix — we need just the path inside the bucket
  const path = storagePath.includes(ATTACHMENT_BUCKET + '/')
    ? storagePath.split(ATTACHMENT_BUCKET + '/')[1]
    : storagePath;

  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    console.warn('[storageService] Could not generate signed URL:', error?.message);
    // Return the original URL as fallback (will fail for private bucket, but avoids crash)
    return storagePath;
  }
  return data.signedUrl;
}


/**
 * Uploads a passport photo to Supabase Storage and returns the public URL.
 * Falls back to a compressed base64 thumbnail if storage fails.
 */
export async function uploadPassportPhoto(userId: string, file: File): Promise<string> {
  // Validate file
  if (!file.type.startsWith('image/')) throw new Error('Only image files are accepted.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Passport photo must be under 2MB.');

  // Compress to thumbnail to reduce storage size
  const compressed = await compressImage(file, 400, 0.8);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/passport.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, compressed, { upsert: true, contentType: file.type });

  if (uploadError) {
    // Storage bucket may not exist yet — fallback to compressed base64
    console.warn('Storage upload failed, using base64 fallback:', uploadError.message);
    return await fileToBase64(compressed);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Bust CDN cache by appending a cache-busting query param
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Compresses an image File to the given max dimension and quality.
 */
function compressImage(file: File, maxDimension: number, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxDimension) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
      } else {
        if (height > maxDimension) { width = Math.round((width * maxDimension) / height); height = maxDimension; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Image compression failed'));
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

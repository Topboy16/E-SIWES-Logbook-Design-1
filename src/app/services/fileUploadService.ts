import { supabase } from '../../supabase';

// ---------- TYPES ----------

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string; // MIME type
  size: number; // bytes
}

// ---------- CONFIG ----------

const BUCKET_NAME = 'logbook-attachments';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ---------- HELPERS ----------

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" is too large. Max size is 5MB.`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File "${file.name}" has an unsupported type. Allowed: images, PDF, DOC/DOCX.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function isImageFile(type: string): boolean {
  return type.startsWith('image/');
}

// ---------- UPLOAD ----------

export async function uploadFiles(
  studentId: string,
  entryId: string,
  files: File[]
): Promise<Attachment[]> {

  // Upload files in parallel for better performance
  const results = await Promise.all(files.map(async (file) => {
    const validation = validateFile(file);
    if (validation) throw new Error(validation);

    // Sanitise filename: keep extension, replace everything else with a UUID to prevent path traversal
    const ext = file.name.split('.').pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || 'bin';
    const safeId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const filePath = `${studentId}/${entryId}/${safeId}.${ext}`;

    try {
      // Try Supabase Storage upload
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      return {
        id: safeId,
        name: file.name,
        url: urlData.publicUrl,
        type: file.type,
        size: file.size,
      } as Attachment;
    } catch {
      // Fallback: store as base64 data URL (warn — large files will exhaust localStorage)
      console.warn(`Fallback to base64 for file: ${file.name}. Consider creating the '${BUCKET_NAME}' Supabase Storage bucket.`);
      const dataUrl = await fileToDataUrl(file);
      return {
        id: safeId,
        name: file.name,
        url: dataUrl,
        type: file.type,
        size: file.size,
      } as Attachment;
    }
  }));

  return results;
}

// ---------- DELETE ----------

export async function deleteAttachment(attachment: Attachment): Promise<void> {
  // If it's a Supabase URL, try to delete from storage
  if (attachment.url.includes(BUCKET_NAME)) {
    try {
      const path = attachment.url.split(`${BUCKET_NAME}/`)[1];
      if (path) {
        await supabase.storage.from(BUCKET_NAME).remove([path]);
      }
    } catch {
      console.warn('Could not delete from Supabase storage');
    }
  }
  // For data URLs (mock), nothing to clean up
}

// ---------- UTILS ----------

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

import { DEFAULT_SOCIAL_UPLOAD_SETTINGS, getSocialUploadLimitBytes, type SocialUploadSettings } from './social-upload-settings';

export type OptimizedSocialImage = {
  file: File;
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  wasOptimized: boolean;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image'));
    };
    image.src = objectUrl;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, file: File, outputType: string, quality?: number): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, outputType === 'image/webp' ? '.webp' : file.name.match(/\.[^.]+$/)?.[0] || ''), {
        type: outputType,
        lastModified: file.lastModified,
      }));
    }, outputType, quality);
  });
}

export async function optimizeImageBeforeUpload(file: File): Promise<OptimizedSocialImage> {
  const originalSize = file.size;
  const canOptimize = typeof window !== 'undefined' && /^image\/(jpeg|jpg|png|webp)$/i.test(file.type);
  if (!canOptimize) {
    return { file, originalSize, optimizedSize: originalSize, savedBytes: 0, wasOptimized: false };
  }

  try {
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      return { file, originalSize, optimizedSize: originalSize, savedBytes: 0, wasOptimized: false };
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const preferredType = file.type === 'image/png' ? 'image/webp' : file.type;
    const quality = preferredType === 'image/png' ? undefined : 0.92;
    const optimizedFile = await canvasToFile(canvas, file, preferredType, quality);

    if (!optimizedFile || optimizedFile.size >= file.size) {
      return { file, originalSize, optimizedSize: originalSize, savedBytes: 0, wasOptimized: false };
    }

    return {
      file: optimizedFile,
      originalSize,
      optimizedSize: optimizedFile.size,
      savedBytes: Math.max(0, originalSize - optimizedFile.size),
      wasOptimized: true,
    };
  } catch {
    return { file, originalSize, optimizedSize: originalSize, savedBytes: 0, wasOptimized: false };
  }
}

export function validatePostImage(file: File | null | undefined, settings?: Partial<SocialUploadSettings> | null) {
  if (!file) return { ok: true as const };
  const maxBytes = getSocialUploadLimitBytes(settings || DEFAULT_SOCIAL_UPLOAD_SETTINGS);
  if (file.size > maxBytes) {
    return { ok: false as const, reason: 'file-too-large' as const, maxBytes };
  }
  return { ok: true as const, maxBytes };
}

export function formatImageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

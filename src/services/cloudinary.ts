const FALLBACK_UPLOAD_PRESET = 'al_malak_preset';

const envCloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '').toString().trim();
const envPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '').toString().trim();

export const CLOUDINARY_CLOUD_NAME: string = envCloudName;
export const CLOUDINARY_UPLOAD_PRESET: string = envPreset || FALLBACK_UPLOAD_PRESET;

if (!envPreset) {
  console.warn(
    `[cloudinary] VITE_CLOUDINARY_UPLOAD_PRESET is not set; using fallback preset "${FALLBACK_UPLOAD_PRESET}".`,
  );
}

if (!envCloudName) {
  console.warn(
    '[cloudinary] VITE_CLOUDINARY_CLOUD_NAME is not set; uploads will fail until it is configured.',
  );
}

export interface CloudinaryUploadOptions {
  folder?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export function uploadToCloudinary(file: File, opts: CloudinaryUploadOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLOUDINARY_CLOUD_NAME) {
      reject(new Error('Cloudinary cloud name is not configured (VITE_CLOUDINARY_CLOUD_NAME).'));
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    if (opts.folder) fd.append('folder', opts.folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res?.secure_url) {
            resolve(res.secure_url as string);
            return;
          }
          reject(new Error('Cloudinary response did not include a secure_url.'));
        } catch {
          reject(new Error('Cloudinary returned an unreadable response.'));
        }
        return;
      }

      let message = `Upload failed (HTTP ${xhr.status})`;
      try {
        const errRes = JSON.parse(xhr.responseText);
        message = errRes?.error?.message || message;
        console.error('[cloudinary] upload error', {
          status: xhr.status,
          cloudName: CLOUDINARY_CLOUD_NAME,
          preset: CLOUDINARY_UPLOAD_PRESET,
          response: errRes,
        });
      } catch {
        console.error('[cloudinary] upload error (non-json)', xhr.status, xhr.responseText);
      }
      reject(new Error(message));
    };

    xhr.onerror = () => {
      console.error('[cloudinary] network error');
      reject(new Error('Network error — please check your connection'));
    };

    xhr.onabort = () => reject(new Error('Upload aborted'));

    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(fd);
  });
}

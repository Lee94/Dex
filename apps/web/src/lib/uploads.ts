import { apiFetch } from '@/lib/apiClient';

/**
 * Uploads client (v1.1). Talks to the agent's root `/uploads` routes
 * (apps/agent/src/mastra/server/upload-routes.ts). A file is sent as base64 JSON
 * (no multipart); the agent reads it by id via the `GetFileContents` tool.
 */

export interface Upload {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  createdAt: number;
}

/** Read a File into a bare base64 string (strips the data: URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function listUploads(): Promise<Upload[]> {
  const { uploads } = await apiFetch<{ uploads: Upload[] }>('/uploads');
  return uploads;
}

export async function uploadFile(file: File): Promise<Upload> {
  const contentBase64 = await fileToBase64(file);
  const { upload } = await apiFetch<{ upload: Upload }>('/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      mimetype: file.type || 'application/octet-stream',
      contentBase64,
    }),
  });
  return upload;
}

export async function deleteUpload(id: string): Promise<void> {
  await apiFetch(`/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

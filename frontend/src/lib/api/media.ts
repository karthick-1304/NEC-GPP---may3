import { api, unwrap } from './client';
import type { ApiEnvelope } from '@/types/api';

export interface MediaUploadResponse {
  url: string;
  display_url: string;
  thumb_url: string;
  public_id: string;
  delete_url: string;
  width: number;
  height: number;
  size: number;
  mime: string;
  extension: string;
}

export const mediaApi = {
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    const r = await api.post<ApiEnvelope<MediaUploadResponse>>('/media/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(r.data);
  },
};

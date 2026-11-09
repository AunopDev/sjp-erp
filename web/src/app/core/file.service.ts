import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import type { UploadedFile } from './models';

export interface StoredFile {
  id?: string;
  name: string;
  size?: number;
  mime?: string;
  url?: string;
  at?: string;
}

@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly api = inject(ApiService);

  upload(file: File): Observable<UploadedFile> {
    return this.api.upload<UploadedFile>('/files', file);
  }

  download(file: StoredFile): void {
    if (!file.id) return;
    this.api.blob(`/files/${file.id}`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      },
    });
  }

  asStored(file: UploadedFile): StoredFile {
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      mime: file.mime,
      url: file.url,
      at: file.createdAt,
    };
  }
}

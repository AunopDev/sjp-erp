import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

export interface ApiError {
  message: string;
  fieldErrors: Record<string, string>;
  status: number;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string' && message) return message;
    }
    if (typeof body === 'string' && body) return body;
    if (error.status === 0) return 'เชื่อมต่อ API ไม่ได้ กรุณาตรวจสอบว่า server รันอยู่';
    return error.message || 'เกิดข้อผิดพลาด';
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function apiFieldErrors(error: unknown): Record<string, string> {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    const fields = body && typeof body === 'object' ? (body as { fieldErrors?: unknown }).fieldErrors : null;
    if (fields && typeof fields === 'object') return fields as Record<string, string>;
  }
  return {};
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, params?: Record<string, string | number | undefined>): Observable<T> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== '') httpParams = httpParams.set(key, String(value));
    }
    return this.http.get<T>(`/api${path}`, { params: httpParams });
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`/api${path}`, body);
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(`/api${path}`, body);
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<T>(`/api${path}`, body);
  }

  delete<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.delete<T>(`/api${path}`, { body });
  }

  upload<T>(path: string, file: File): Observable<T> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<T>(`/api${path}`, body);
  }

  blob(path: string): Observable<Blob> {
    return this.http.get(`/api${path}`, { responseType: 'blob' });
  }

  errorMessage(error: unknown): string {
    return apiErrorMessage(error);
  }

  fieldErrors(error: unknown): Record<string, string> {
    return apiFieldErrors(error);
  }

  fail(error: unknown): Observable<never> {
    return throwError(() => error);
  }
}

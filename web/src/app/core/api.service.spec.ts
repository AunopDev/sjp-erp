import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage, apiFieldErrors } from './api.service';

const httpError = (status: number, error: unknown): HttpErrorResponse =>
  new HttpErrorResponse({ status, error, url: '/api/test' });

describe('apiErrorMessage', () => {
  it('explains rate limiting in Thai instead of showing the raw Nest exception', () => {
    const error = httpError(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    expect(apiErrorMessage(error)).toBe('ทำรายการบ่อยเกินไป กรุณารอประมาณ 1 นาที แล้วลองใหม่');
  });

  it('explains an expired session in Thai', () => {
    expect(apiErrorMessage(httpError(401, { message: 'Unauthorized' }))).toBe('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  });

  it('explains an unreachable API', () => {
    expect(apiErrorMessage(httpError(0, null))).toContain('เชื่อมต่อ API ไม่ได้');
  });

  it('keeps server-side Thai validation messages', () => {
    const error = httpError(400, { message: 'กรุณากรอก "ผู้ขาย"', fieldErrors: { vendor: 'กรุณากรอก "ผู้ขาย"' } });
    expect(apiErrorMessage(error)).toBe('กรุณากรอก "ผู้ขาย"');
    expect(apiFieldErrors(error)).toEqual({ vendor: 'กรุณากรอก "ผู้ขาย"' });
  });

  it('joins validation arrays', () => {
    expect(apiErrorMessage(httpError(400, { message: ['a must be a string', 'b must be a number'] }))).toBe(
      'a must be a string, b must be a number',
    );
  });
});

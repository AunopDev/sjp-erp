import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { readToken, writeToken } from './storage';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = readToken();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((error: unknown) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 && !request.url.includes('/auth/login') && !request.url.includes('/auth/setup')) {
        writeToken('');
      }
      return throwError(() => error);
    }),
  );
};

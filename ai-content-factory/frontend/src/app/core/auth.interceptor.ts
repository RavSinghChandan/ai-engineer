import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  const withAuth =
    token && !AUTH_PATHS.some((p) => req.url.includes(p))
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(withAuth).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthCall = AUTH_PATHS.some((p) => req.url.includes(p));
      if (error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }
      // Access token expired: refresh once, then retry the original request.
      return from(auth.tryRefresh()).pipe(
        switchMap((ok) => {
          if (!ok) return throwError(() => error);
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${auth.accessToken}` },
          });
          return next(retried);
        }),
      );
    }),
  );
};

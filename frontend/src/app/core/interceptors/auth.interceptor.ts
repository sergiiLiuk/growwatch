import { HttpInterceptorFn } from '@angular/common/http';

const TOKEN_KEY = 'growwatch-token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return next(req);
  // setHeaders is additive — preserves Content-Type and any other headers Apollo sets.
  // (The previous setContext-based approach replaced all headers, breaking Express body parsing.)
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

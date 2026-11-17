import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Keep request bodies bounded; uploads use multipart and have their own limit.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  // The SPA fetches JSON repeatedly and treats 304 as an empty body. ETag caching on
  // data endpoints therefore makes lists randomly empty; disable it and tell clients
  // to always revalidate fresh business data.
  app.getHttpAdapter().getInstance().set('etag', false);
  app.use((_req: unknown, res: { setHeader: (key: string, value: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.setGlobalPrefix('api');
  if (process.env.TRUST_PROXY === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  const configuredOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !configuredOrigins?.length) {
    console.warn('CORS_ORIGIN is not set — cross-origin browser requests will be rejected.');
  }
  app.enableCors({
    origin: configuredOrigins?.length
      ? configuredOrigins
      : process.env.NODE_ENV === 'production'
        ? false
        : true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`SJP ERP API listening on http://localhost:${port}/api`);
}

await bootstrap();

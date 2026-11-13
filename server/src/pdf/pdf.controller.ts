import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { PdfService } from './pdf.service.js';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get(':entity/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async render(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const result = await this.pdf.render(user, entity, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(result.buffer);
  }
}

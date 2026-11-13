import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { FilesService, type UploadedFileInput } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(@CurrentUser() user: SafeUser, @UploadedFile() file: UploadedFileInput | undefined) {
    return this.files.save(user, file);
  }

  @Get(':id')
  download(@CurrentUser() user: SafeUser, @Param('id') id: string, @Res() res: Response): void {
    this.files.send(user, id, res);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.files.remove(user, id);
  }

  @Post(':id/delete')
  removePost(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.files.remove(user, id);
  }
}

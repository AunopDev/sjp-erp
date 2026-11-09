import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { SearchService } from './search.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@CurrentUser() user: SafeUser, @Query('q') q?: string, @Query('limit') limit?: string) {
    return this.search.search(user, q, limit);
  }
}

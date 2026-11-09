import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

export class FieldValidationError extends BadRequestException {
  constructor(message: string, fieldErrors: Record<string, string>) {
    super({ message, fieldErrors });
  }
}

export function bad(message: string): never {
  throw new BadRequestException(message);
}

export function forbidden(message = 'คุณไม่มีสิทธิ์ดำเนินการนี้'): never {
  throw new ForbiddenException(message);
}

export function notFound(message = 'ไม่พบรายการ'): never {
  throw new NotFoundException(message);
}

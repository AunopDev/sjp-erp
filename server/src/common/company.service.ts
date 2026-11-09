import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { settings } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from './access.service.js';
import { AuditService } from './audit.service.js';
import { bad } from './exceptions.js';

const COMPANY_KEY = 'company';

export interface CompanyInfo {
  name: string;
  nameEn: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footerNote: string;
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'SJP ERP',
  nameEn: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  footerNote: '',
};

@Injectable()
export class CompanyService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  get(): CompanyInfo {
    const row = this.db.select().from(settings).where(eq(settings.key, COMPANY_KEY)).all()[0];
    const value = row?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_COMPANY };
    return { ...DEFAULT_COMPANY, ...(value as Partial<CompanyInfo>) };
  }

  save(user: SafeUser, input: Partial<CompanyInfo>): CompanyInfo {
    this.access.require(user, 'settings', 'edit');
    const next: CompanyInfo = {
      name: String(input.name ?? '').trim().slice(0, 120) || 'SJP ERP',
      nameEn: String(input.nameEn ?? '').trim().slice(0, 160),
      taxId: String(input.taxId ?? '').trim().slice(0, 40),
      address: String(input.address ?? '').trim().slice(0, 500),
      phone: String(input.phone ?? '').trim().slice(0, 80),
      email: String(input.email ?? '').trim().slice(0, 160),
      website: String(input.website ?? '').trim().slice(0, 160),
      footerNote: String(input.footerNote ?? '').trim().slice(0, 300),
    };
    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) bad('อีเมลบริษัทไม่ถูกต้อง');
    const row = this.db.select().from(settings).where(eq(settings.key, COMPANY_KEY)).all()[0];
    if (row) this.db.update(settings).set({ value: next }).where(eq(settings.key, COMPANY_KEY)).run();
    else this.db.insert(settings).values({ key: COMPANY_KEY, value: next }).run();
    this.audit.log(user, { action: 'metadata', entity: 'settings', summary: 'แก้ไขข้อมูลบริษัท/หัวเอกสาร' });
    return next;
  }
}

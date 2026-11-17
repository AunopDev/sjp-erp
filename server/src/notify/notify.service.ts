import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, lte } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import type { Db } from '../db/database.service.js';
import { notifyQueue, settings } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { bad, notFound } from '../common/exceptions.js';
import { assertSafeHost } from '../common/network-guard.js';
import { EventsService, type EventRow } from '../events/events.service.js';

const CONFIG_KEY = 'notify';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

export interface NotifyConfig {
  emailEnabled: boolean;
  lineEnabled: boolean;
  autoApproval: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  mailFrom: string;
  mailTo: string;
  lineToken: string;
  lineTo: string;
}

const DEFAULT_CONFIG: NotifyConfig = {
  emailEnabled: false,
  lineEnabled: false,
  autoApproval: true,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  mailFrom: '',
  mailTo: '',
  lineToken: '',
  lineTo: '',
};

@Injectable()
export class NotifyService implements OnModuleInit {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.events.on((event) => {
      if (!event.type.startsWith('approval.')) return;
      void this.sendApprovalEvent(event).catch(() => undefined);
    });
    // Durable retry loop: claims due rows every minute, including after a restart.
    this.timer = setInterval(() => void this.processQueue().catch(() => undefined), 60_000);
    this.timer.unref?.();
    setTimeout(() => void this.processQueue().catch(() => undefined), 2_000).unref?.();
  }

  config(user: SafeUser) {
    this.access.require(user, 'settings', 'view');
    const stored = this.read();
    return {
      ...stored,
      smtpPass: '',
      lineToken: '',
      smtpPassSet: !!stored.smtpPass || !!process.env.SMTP_PASS,
      lineTokenSet: !!stored.lineToken || !!process.env.LINE_CHANNEL_TOKEN,
      envFallback: {
        smtp: !!process.env.SMTP_HOST,
        line: !!process.env.LINE_CHANNEL_TOKEN,
      },
    };
  }

  async save(user: SafeUser, input: Partial<NotifyConfig>) {
    this.access.require(user, 'settings', 'edit');
    const current = this.read();
    if (input.mailTo !== undefined && String(input.mailTo).trim()) {
      const recipients = String(input.mailTo)
        .split(/[;,]/)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const email of recipients) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad(`อีเมลผู้รับไม่ถูกต้อง: ${email}`);
    }
    const smtpHost = String(input.smtpHost ?? current.smtpHost).trim();
    if (smtpHost) {
      try {
        await assertSafeHost(smtpHost, process.env.SMTP_ALLOW_PRIVATE === 'true');
      } catch (error) {
        bad(error instanceof Error ? error.message : 'SMTP host ไม่ปลอดภัย');
      }
    }
    const next: NotifyConfig = {
      ...current,
      emailEnabled: input.emailEnabled ?? current.emailEnabled,
      lineEnabled: input.lineEnabled ?? current.lineEnabled,
      autoApproval: input.autoApproval ?? current.autoApproval,
      smtpHost,
      smtpPort: Number(input.smtpPort ?? current.smtpPort) || 587,
      smtpSecure: input.smtpSecure ?? current.smtpSecure,
      smtpUser: String(input.smtpUser ?? current.smtpUser).trim(),
      smtpPass: input.smtpPass ? String(input.smtpPass) : current.smtpPass,
      mailFrom: String(input.mailFrom ?? current.mailFrom).trim(),
      mailTo: String(input.mailTo ?? current.mailTo).trim(),
      lineToken: input.lineToken ? String(input.lineToken) : current.lineToken,
      lineTo: String(input.lineTo ?? current.lineTo).trim(),
    };
    this.write(next);
    this.audit.log(user, { action: 'metadata', entity: 'settings', summary: 'แก้ไขการตั้งค่าแจ้งเตือนอีเมล/LINE' });
    return this.config(user);
  }

  async test(user: SafeUser, channel: 'email' | 'line') {
    this.access.require(user, 'settings', 'edit');
    if (channel === 'email') {
      await this.sendEmail('ทดสอบการแจ้งเตือน SJP ERP', 'นี่คือข้อความทดสอบจากระบบ SJP ERP — การตั้งค่าอีเมลใช้งานได้');
      return { ok: true, channel };
    }
    if (channel === 'line') {
      await this.sendLine('ทดสอบการแจ้งเตือน SJP ERP\nการตั้งค่า LINE ใช้งานได้');
      return { ok: true, channel };
    }
    bad('ช่องทางทดสอบไม่ถูกต้อง');
  }

  private async sendApprovalEvent(event: EventRow): Promise<void> {
    const config = this.read();
    if (!config.autoApproval) return;
    const lines = [
      `SJP ERP: ${event.type === 'approval.requested' ? 'มีคำขออนุมัติใหม่' : event.type === 'approval.approved' ? 'อนุมัติแล้ว' : 'คำขอถูกปฏิเสธ'}`,
      event.summary,
      event.entity ? `โมดูล: ${event.entity}` : '',
      event.actorName ? `โดย: ${event.actorName}` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    if (config.emailEnabled) this.enqueue('email', `SJP ERP — ${event.summary}`, text);
    if (config.lineEnabled) this.enqueue('line', `SJP ERP — ${event.summary}`, text);
  }

  /** Queue a message so a transient SMTP/LINE failure is retried instead of lost. */
  private enqueue(channel: 'email' | 'line', subject: string, body: string): void {
    const now = new Date().toISOString();
    this.db
      .insert(notifyQueue)
      .values({
        id: crypto.randomUUID(),
        channel,
        subject,
        body,
        status: 'pending',
        attempts: 0,
        nextAt: now,
        lastError: '',
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      })
      .run();
  }

  queue(user: SafeUser) {
    this.access.require(user, 'settings', 'view');
    const items = this.db
      .select()
      .from(notifyQueue)
      .orderBy(desc(notifyQueue.createdAt))
      .limit(50)
      .all();
    return { items };
  }

  retry(user: SafeUser, id: string) {
    this.access.require(user, 'settings', 'edit');
    const row = this.db.select().from(notifyQueue).where(eq(notifyQueue.id, id)).all()[0];
    if (!row) notFound('ไม่พบรายการในคิว');
    const now = new Date().toISOString();
    this.db
      .update(notifyQueue)
      .set({ status: 'pending', nextAt: now, updatedAt: now, lastError: '' })
      .where(eq(notifyQueue.id, id))
      .run();
    return { ok: true, id };
  }

  /** Sends every due row. Safe to call from the minute timer or a retry action. */
  async processQueue(): Promise<void> {
    const now = new Date().toISOString();
    const due = this.db
      .select()
      .from(notifyQueue)
      .where(and(eq(notifyQueue.status, 'pending'), lte(notifyQueue.nextAt, now)))
      .limit(20)
      .all();
    for (const row of due) await this.deliver(row);
  }

  private async deliver(row: typeof notifyQueue.$inferSelect): Promise<void> {
    try {
      if (row.channel === 'email') await this.sendEmail(row.subject, row.body);
      else await this.sendLine(row.body);
      const now = new Date().toISOString();
      this.db
        .update(notifyQueue)
        .set({ status: 'sent', attempts: row.attempts + 1, lastError: '', sentAt: now, updatedAt: now })
        .where(eq(notifyQueue.id, row.id))
        .run();
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const failed = attempts >= MAX_ATTEMPTS;
      const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
      const now = new Date();
      this.db
        .update(notifyQueue)
        .set({
          status: failed ? 'failed' : 'pending',
          attempts,
          lastError: message,
          nextAt: failed ? row.nextAt : new Date(now.getTime() + wait * 60_000).toISOString(),
          updatedAt: now.toISOString(),
        })
        .where(eq(notifyQueue.id, row.id))
        .run();
    }
  }

  private async sendEmail(subject: string, text: string): Promise<void> {
    const config = this.read();
    const host = config.smtpHost || process.env.SMTP_HOST || '';
    const port = config.smtpPort || Number(process.env.SMTP_PORT) || 587;
    const secure = config.smtpSecure || process.env.SMTP_SECURE === 'true';
    const user = config.smtpUser || process.env.SMTP_USER || '';
    const pass = config.smtpPass || process.env.SMTP_PASS || '';
    const from = config.mailFrom || process.env.MAIL_FROM || user;
    const to = config.mailTo || process.env.MAIL_TO || '';
    if (!host) bad('ยังไม่ได้ตั้งค่า SMTP host');
    if (!to) bad('ยังไม่ได้ตั้งค่าอีเมลผู้รับ');
    try {
      await assertSafeHost(host, process.env.SMTP_ALLOW_PRIVATE === 'true');
    } catch (error) {
      bad(error instanceof Error ? error.message : 'SMTP host ไม่ปลอดภัย');
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transporter.sendMail({
      from: from || `SJP ERP <${user}>`,
      to,
      subject,
      text,
      html: `<div style="font-family:Tahoma,Segoe UI,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(text)}</div>`,
    }).catch(() => {
      throw bad('ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า SMTP');
    });
  }

  private async sendLine(text: string): Promise<void> {
    const config = this.read();
    const token = config.lineToken || process.env.LINE_CHANNEL_TOKEN || '';
    const to = config.lineTo || process.env.LINE_TO || '';
    if (!token) bad('ยังไม่ได้ตั้งค่า LINE channel access token');
    if (!to) bad('ยังไม่ได้ตั้งค่า LINE ปลายทาง');
    const response = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw bad('ส่ง LINE ไม่สำเร็จ: หมดเวลารอปลายทาง');
      }
      throw bad('ส่ง LINE ไม่สำเร็จ: เชื่อมต่อปลายทางไม่ได้');
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw bad(`ส่ง LINE ไม่สำเร็จ (${response.status}) ${body.slice(0, 200)}`);
    }
  }

  private read(): NotifyConfig {
    const row = this.db.select().from(settings).where(eq(settings.key, CONFIG_KEY)).all()[0];
    const value = row?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...(value as Partial<NotifyConfig>) };
  }

  private write(config: NotifyConfig): void {
    const row = this.db.select().from(settings).where(eq(settings.key, CONFIG_KEY)).all()[0];
    if (row) this.db.update(settings).set({ value: config }).where(eq(settings.key, CONFIG_KEY)).run();
    else this.db.insert(settings).values({ key: CONFIG_KEY, value: config }).run();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

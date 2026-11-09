import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { webhookDeliveries, webhooks } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { nowIso } from '../common/dates.js';
import { bad, notFound } from '../common/exceptions.js';
import { EventsService, type EventRow } from '../events/events.service.js';

export type WebhookRow = typeof webhooks.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

const MAX_ATTEMPTS = 5;
const RETRY_SECONDS = [30, 120, 600, 1800, 7200];
const WORKER_INTERVAL_MS = 15000;

export interface WebhookInput {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[] | string;
  enabled?: boolean;
}

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private processing = false;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.on((event) => {
      this.capture(event);
      setTimeout(() => void this.processQueue().catch(() => undefined), 0);
    });
    this.timer = setInterval(() => void this.processQueue().catch(() => undefined), WORKER_INTERVAL_MS);
    this.timer.unref?.();
    void this.processQueue().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
  }

  list(user: SafeUser) {
    this.access.require(user, 'settings', 'view');
    return this.db.select().from(webhooks).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => this.publicWebhook(row));
  }

  save(user: SafeUser, id: string | null, input: WebhookInput) {
    this.access.require(user, 'settings', 'edit');
    const name = String(input.name ?? '').trim();
    const url = String(input.url ?? '').trim();
    if (!name) bad('กรุณากรอกชื่อ Webhook');
    if (!/^https?:\/\//i.test(url)) bad('URL ต้องขึ้นต้นด้วย http:// หรือ https://');
    this.assertSafeUrl(url);
    const events = this.normalizeEvents(input.events);
    const existing = id ? this.db.select().from(webhooks).where(eq(webhooks.id, id)).all()[0] : undefined;
    if (id && !existing) notFound('ไม่พบ Webhook');
    const secret = input.secret ? String(input.secret) : existing?.secret ?? '';
    const now = nowIso();
    const row: typeof webhooks.$inferInsert = existing
      ? { ...existing, name, url, secret, events, enabled: input.enabled ?? existing.enabled, updatedAt: now }
      : {
          id: crypto.randomUUID(),
          name,
          url,
          secret,
          events,
          enabled: input.enabled !== false,
          createdAt: now,
          updatedAt: now,
        };
    if (existing) this.db.update(webhooks).set(row).where(eq(webhooks.id, existing.id)).run();
    else this.db.insert(webhooks).values(row).run();
    const saved = this.db.select().from(webhooks).where(eq(webhooks.id, existing?.id ?? row.id!)).all()[0];
    this.audit.log(user, {
      action: 'metadata',
      entity: 'settings',
      recordId: saved.id,
      recordCode: saved.name,
      summary: `${existing ? 'แก้ไข' : 'สร้าง'} Webhook ${saved.name}`,
    });
    return this.publicWebhook(saved);
  }

  remove(user: SafeUser, id: string): { ok: true } {
    this.access.require(user, 'settings', 'edit');
    const row = this.db.select().from(webhooks).where(eq(webhooks.id, id)).all()[0];
    if (!row) notFound('ไม่พบ Webhook');
    this.db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, id)).run();
    this.db.delete(webhooks).where(eq(webhooks.id, id)).run();
    this.audit.log(user, { action: 'delete', entity: 'settings', recordId: id, recordCode: row.name, summary: `ลบ Webhook ${row.name}` });
    return { ok: true };
  }

  deliveries(user: SafeUser, id: string, limitInput?: unknown) {
    this.access.require(user, 'settings', 'view');
    const webhook = this.db.select().from(webhooks).where(eq(webhooks.id, id)).all()[0];
    if (!webhook) notFound('ไม่พบ Webhook');
    const limit = Math.max(1, Math.min(Number(limitInput) || 30, 200));
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, id))
      .all()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async test(user: SafeUser, id: string) {
    this.access.require(user, 'settings', 'edit');
    const webhook = this.db.select().from(webhooks).where(eq(webhooks.id, id)).all()[0];
    if (!webhook) notFound('ไม่พบ Webhook');
    const delivery = await this.enqueue(webhook, {
      type: 'webhook.test',
      summary: 'ทดสอบการส่ง Webhook จาก SJP ERP',
      payload: { message: 'hello from SJP ERP' },
    });
    return this.attempt(delivery);
  }

  async retry(user: SafeUser, deliveryId: string) {
    this.access.require(user, 'settings', 'edit');
    const delivery = this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).all()[0];
    if (!delivery) notFound('ไม่พบรายการส่ง');
    const reset = this.db
      .update(webhookDeliveries)
      .set({ status: 'pending', attempts: 0, nextAttemptAt: nowIso(), updatedAt: nowIso() })
      .where(eq(webhookDeliveries.id, deliveryId))
      .run();
    void reset;
    const fresh = this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).all()[0];
    return this.attempt(fresh);
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = nowIso();
      const due = this.db
        .select()
        .from(webhookDeliveries)
        .all()
        .filter((row) => row.status === 'pending' && row.nextAttemptAt <= now)
        .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
        .slice(0, 20);
      for (const delivery of due) await this.attempt(delivery);
    } finally {
      this.processing = false;
    }
  }

  private capture(event: EventRow): void {
    if (event.type.startsWith('webhook.')) return;
    const hooks = this.db.select().from(webhooks).all().filter((hook) => hook.enabled);
    for (const hook of hooks) {
      if (!this.matches(hook.events, event.type)) continue;
      this.db.insert(webhookDeliveries).values({
        id: crypto.randomUUID(),
        webhookId: hook.id,
        eventId: event.id,
        eventType: event.type,
        payload: {
          id: event.id,
          type: event.type,
          entity: event.entity,
          recordId: event.recordId,
          code: event.code,
          actorName: event.actorName,
          summary: event.summary,
          payload: event.payload,
          at: event.at,
        },
        status: 'pending',
        attempts: 0,
        nextAttemptAt: nowIso(),
        lastError: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deliveredAt: null,
      }).run();
    }
  }

  private async enqueue(
    webhook: WebhookRow,
    event: { type: string; summary: string; payload: Record<string, unknown> },
  ): Promise<WebhookDeliveryRow> {
    const id = crypto.randomUUID();
    const now = nowIso();
    const row: typeof webhookDeliveries.$inferInsert = {
      id,
      webhookId: webhook.id,
      eventId: null,
      eventType: event.type,
      payload: { id, type: event.type, summary: event.summary, payload: event.payload, at: now },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      lastError: '',
      createdAt: now,
      updatedAt: now,
      deliveredAt: null,
    };
    this.db.insert(webhookDeliveries).values(row).run();
    const saved = this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).all()[0];
    return saved;
  }

  private async attempt(delivery: WebhookDeliveryRow): Promise<WebhookDeliveryRow> {
    const webhook = this.db.select().from(webhooks).where(eq(webhooks.id, delivery.webhookId)).all()[0];
    const now = nowIso();
    if (!webhook || !webhook.enabled) {
      return this.finish(delivery, webhook ? 'Webhook ถูกปิดใช้งาน' : 'ไม่พบ Webhook', now);
    }

    const body = JSON.stringify(delivery.payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SJP-ERP-Webhook/1.0',
      'X-SJP-Event': delivery.eventType,
      'X-SJP-Delivery': delivery.id,
    };
    if (webhook.secret) {
      headers['X-SJP-Signature'] = `sha256=${createHmac('sha256', webhook.secret).update(body, 'utf8').digest('hex')}`;
    }

    try {
      await this.assertSafeTarget(webhook.url);
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`ไม่อนุญาตให้ redirect (HTTP ${response.status})`);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
      }
      const attempts = delivery.attempts + 1;
      this.db.update(webhookDeliveries).set({
        status: 'success',
        attempts,
        lastError: '',
        deliveredAt: now,
        updatedAt: now,
      }).where(eq(webhookDeliveries.id, delivery.id)).run();
      return { ...delivery, status: 'success', attempts, lastError: '', deliveredAt: now, updatedAt: now };
    } catch (error) {
      return this.finish(delivery, error instanceof Error ? error.message : String(error), now);
    }
  }

  private finish(delivery: WebhookDeliveryRow, message: string, now: string): WebhookDeliveryRow {
    const attempts = delivery.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    const next = final
      ? delivery.nextAttemptAt
      : new Date(Date.now() + (RETRY_SECONDS[Math.min(attempts - 1, RETRY_SECONDS.length - 1)] ?? 60) * 1000).toISOString();
    const status = final ? 'failed' : 'pending';
    this.db.update(webhookDeliveries).set({
      status,
      attempts,
      nextAttemptAt: next,
      lastError: String(message).slice(0, 500),
      updatedAt: now,
    }).where(eq(webhookDeliveries.id, delivery.id)).run();
    return { ...delivery, status, attempts, nextAttemptAt: next, lastError: String(message).slice(0, 500), updatedAt: now };
  }

  private assertSafeUrl(raw: string): void {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      bad('URL ของ Webhook ไม่ถูกต้อง');
    }
    if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (this.isPrivateHost(host)) bad('ไม่อนุญาตให้ใช้ Webhook ไปยัง localhost หรือเครือข่ายภายใน');
  }

  private async assertSafeTarget(raw: string): Promise<void> {
    if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return;
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (this.isPrivateHost(host)) bad('ไม่อนุญาตให้ส่ง Webhook ไปยัง localhost หรือเครือข่ายภายใน');
    if (isIP(host)) return;
    const addresses = await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length) bad(`resolve hostname ของ Webhook ไม่ได้: ${host}`);
    if (addresses.some((entry) => this.isPrivateHost(entry.address))) {
      bad('ปลายทาง Webhook ชี้ไปยังเครือข่ายภายใน');
    }
  }

  private isPrivateHost(host: string): boolean {
    const value = host.toLowerCase();
    if (
      value === 'localhost' ||
      value === '0.0.0.0' ||
      value === '::1' ||
      value === '::' ||
      value.endsWith('.localhost') ||
      value.endsWith('.local') ||
      value.endsWith('.internal') ||
      value.endsWith('.lan') ||
      value.endsWith('.home')
    ) {
      return true;
    }
    if (isIP(value) === 4) {
      const parts = value.split('.').map(Number);
      if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
      if (parts[0] >= 224) return true;
      return false;
    }
    if (isIP(value) === 6) {
      return (
        value === '::1' ||
        value === '::' ||
        value.startsWith('fc') ||
        value.startsWith('fd') ||
        value.startsWith('fe8') ||
        value.startsWith('fe9') ||
        value.startsWith('fea') ||
        value.startsWith('feb') ||
        value.startsWith('::ffff:127.') ||
        value.startsWith('::ffff:10.') ||
        value.startsWith('::ffff:192.168.')
      );
    }
    return false;
  }

  private matches(patterns: string[], type: string): boolean {
    if (!patterns.length) return true;
    return patterns.some((pattern) => (pattern.endsWith('*') ? type.startsWith(pattern.slice(0, -1)) : pattern === type));
  }

  private normalizeEvents(input: string[] | string | undefined): string[] {
    const values = Array.isArray(input) ? input : String(input ?? '').split(/[\n,]/);
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 50);
  }

  private publicWebhook(row: WebhookRow) {
    return { ...row, secret: '', secretSet: !!row.secret };
  }
}

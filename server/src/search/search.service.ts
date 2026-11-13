import { Injectable } from '@nestjs/common';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { ENTITY_DEFS, type EntityDef } from '../meta/entities.js';
import { RecordsService } from '../records/records.service.js';

export interface SearchResult {
  entity: string;
  entityLabel: string;
  id: string;
  code: string;
  title: string;
  subtitle: string;
  link: string;
  score: number;
}

const SPECIAL_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  purchaseOrders: '/purchase-orders',
  projects: '/projects',
  pmRecords: '/pm/records',
};

const REF_LABELS = ['customer', 'vendor', 'site', 'project', 'assignee', 'owner'];

@Injectable()
export class SearchService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  search(user: SafeUser, queryInput: unknown, limitInput?: unknown) {
    const query = String(queryInput ?? '').trim().toLowerCase();
    if (query.length < 2) return { query, results: [] as SearchResult[] };
    const totalLimit = Math.max(1, Math.min(Number(limitInput) || 20, 50));
    const results: SearchResult[] = [];

    for (const def of Object.values(ENTITY_DEFS)) {
      if (!this.access.canEntity(user, def.key, 'view')) continue;
      const batch: SearchResult[] = [];
      for (const row of this.records.rawScoped(def, user).slice(0, 5000)) {
        const code = row.code.toLowerCase();
        const titleValue = this.titleValue(def, row.data);
        const title = String(titleValue ?? '').toLowerCase();
        let score = 0;
        if (code === query) score = 100;
        else if (code.startsWith(query)) score = 90;
        else if (code.includes(query)) score = 75;
        else if (title === query) score = 70;
        else if (title.startsWith(query)) score = 60;
        else if (title.includes(query)) score = 45;
        else {
          for (const field of def.fields) {
            if (field.type === 'section' || field.type === 'formula' || field.type === 'rows' || field.type === 'file') continue;
            const value = row.data[field.key];
            if (value === undefined || value === null || value === '') continue;
            if (String(value).toLowerCase().includes(query)) {
              score = 20;
              break;
            }
          }
        }
        if (!score) continue;
        batch.push({
          entity: def.key,
          entityLabel: def.label,
          id: row.id,
          code: row.code,
          title: String(titleValue || row.code),
          subtitle: this.subtitle(def, row.data, user),
          link: this.link(def.key, row.id),
          score,
        });
        if (batch.length >= 40) break;
      }
      batch.sort((a, b) => b.score - a.score);
      results.push(...batch.slice(0, 5));
      if (results.length >= totalLimit * 2) break;
    }

    results.sort((a, b) => b.score - a.score || a.entityLabel.localeCompare(b.entityLabel, 'th'));
    return { query, results: results.slice(0, totalLimit) };
  }

  private titleValue(def: EntityDef, data: Record<string, unknown>): unknown {
    if (def.title === 'code') return undefined;
    const direct = data[def.title];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const fallback = def.fields.find((field) => ['text', 'textarea'].includes(field.type) && data[field.key]);
    return fallback ? data[fallback.key] : undefined;
  }

  private subtitle(def: EntityDef, data: Record<string, unknown>, user: SafeUser): string {
    const parts: string[] = [def.label];
    for (const key of REF_LABELS) {
      const value = data[key];
      if (typeof value === 'string' && value) {
        const label = this.records.labelOf((def.fields.find((field) => field.key === key)?.ref) ?? 'users', value, user);
        if (label && !label.startsWith('(')) {
          parts.push(label);
          break;
        }
      }
    }
    return parts.filter(Boolean).join(' · ');
  }

  private link(entity: string, id: string): string {
    const base = SPECIAL_ROUTES[entity];
    return base ? `${base}/${id}` : `/entities/${entity}/${id}`;
  }
}

import { Injectable, signal } from '@angular/core';
import { Observable, of, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import type { EntityDef, MetaResponse, Option, ProjectStepDef, WorkflowStatus } from './models';

@Injectable({ providedIn: 'root' })
export class MetaService {
  readonly meta = signal<MetaResponse | null>(null);
  readonly loading = signal(false);
  private readonly optionCache = new Map<string, Option[]>();
  private started = false;
  private request$: Observable<MetaResponse> | null = null;

  constructor(private readonly api: ApiService) {}

  /** Loads metadata once and lets guards await it before activation. */
  ensureLoaded(): Observable<MetaResponse> {
    const current = this.meta();
    if (current) return of(current);
    if (!this.request$) {
      this.loading.set(true);
      this.request$ = this.api.get<MetaResponse>('/meta').pipe(
        tap({
          next: (meta) => {
            this.meta.set(meta);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.request$ = null;
          },
        }),
        shareReplay(1),
      );
    }
    return this.request$;
  }

  load(force = false): void {
    if (this.started && !force) return;
    this.started = true;
    if (force) this.request$ = null;
    this.ensureLoaded().subscribe({ error: () => undefined });
  }

  entity(key: string): EntityDef | undefined {
    return this.meta()?.entities[key];
  }

  ticketWorkflow(): WorkflowStatus[] {
    return this.meta()?.workflows.ticket.statuses ?? [];
  }

  poWorkflow(): WorkflowStatus[] {
    return this.meta()?.workflows.po.statuses ?? [];
  }

  workflowFor(entity: EntityDef | string): WorkflowStatus[] {
    const def = typeof entity === 'string' ? this.entity(entity) : entity;
    const key = def?.workflowKey ?? (typeof entity === 'string' ? entity : entity.key);
    const workflows = this.meta()?.workflows as unknown as Record<string, { statuses?: WorkflowStatus[] }> | undefined;
    const workflow = workflows?.[key];
    return workflow?.statuses ?? [];
  }

  projectSteps(): ProjectStepDef[] {
    return this.meta()?.workflows.project.steps ?? [];
  }

  lists(): { teams: string[]; depts: string[] } {
    return this.meta()?.lists ?? { teams: [], depts: [] };
  }

  options(entity: string): Observable<Option[]> {
    const cached = this.optionCache.get(entity);
    if (cached) return of(cached);
    return this.api.get<Option[]>(`/meta/options/${entity}`).pipe(
      tap((options) => this.optionCache.set(entity, options)),
    );
  }

  clearOptions(): void {
    this.optionCache.clear();
  }
}

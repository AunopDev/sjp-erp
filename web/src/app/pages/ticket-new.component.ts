import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { RecordFormComponent } from '../shared/record-form.component';
import type { FieldDef, RecordRow } from '../core/models';

@Component({
  selector: 'app-ticket-new',
  standalone: true,
  imports: [RecordFormComponent],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>เปิดเคสใหม่</h1><div class="muted">บันทึกการรับแจ้งเหตุ</div></div></div>
      @if (fields().length) {
        <app-record-form
          entity="tickets"
          entityLabel="Service Ticket"
          title="เปิดเคสใหม่"
          createUrl="/tickets"
          [inline]="true"
          [fields]="fields()"
          [lists]="meta.lists()"
          [defaults]="defaults"
          (saved)="saved($event)"
          (closed)="cancel()"
        />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketNewComponent {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  readonly fields = signal<FieldDef[]>([]);
  private created = false;
  readonly defaults: Record<string, unknown> = {
    receivedAt: new Date().toISOString(),
    priority: 'ปกติ',
    channel: 'โทรศัพท์',
  };

  constructor() {
    this.meta.load();
    effect(() => {
      if (this.meta.meta()) this.fields.set(this.filterFields());
    });
  }

  private filterFields(): FieldDef[] {
    return (this.meta.entity('tickets')?.fields ?? []).filter(
      (field) => !['cause', 'resolution', 'remarks', 'initialFinding'].includes(field.key),
    );
  }

  saved(record: RecordRow): void {
    this.created = true;
    void this.router.navigate(['/tickets', record.id]);
  }

  cancel(): void {
    if (!this.created) void this.router.navigate(['/tickets']);
  }
}

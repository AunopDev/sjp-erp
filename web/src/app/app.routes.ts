import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'my', loadComponent: () => import('./pages/my-work.component').then((m) => m.MyWorkComponent) },
      { path: 'approvals', loadComponent: () => import('./pages/approvals.component').then((m) => m.ApprovalsComponent) },
      { path: 'entities/:entity', loadComponent: () => import('./pages/entity-list.component').then((m) => m.EntityListComponent) },
      { path: 'entities/:entity/:id', loadComponent: () => import('./pages/entity-detail.component').then((m) => m.EntityDetailComponent) },
      { path: 'tickets', loadComponent: () => import('./pages/tickets.component').then((m) => m.TicketsComponent) },
      { path: 'tickets/new', loadComponent: () => import('./pages/ticket-new.component').then((m) => m.TicketNewComponent) },
      { path: 'tickets/:id', loadComponent: () => import('./pages/ticket-detail.component').then((m) => m.TicketDetailComponent) },
      { path: 'projects', loadComponent: () => import('./pages/projects.component').then((m) => m.ProjectsComponent) },
      { path: 'projects/:id', loadComponent: () => import('./pages/project-detail.component').then((m) => m.ProjectDetailComponent) },
      { path: 'calendar', loadComponent: () => import('./pages/calendar.component').then((m) => m.CalendarComponent) },
      { path: 'purchase-orders', loadComponent: () => import('./pages/purchase.component').then((m) => m.PurchaseComponent) },
      { path: 'purchase-orders/:id', loadComponent: () => import('./pages/purchase-detail.component').then((m) => m.PurchaseDetailComponent) },
      { path: 'warehouse', loadComponent: () => import('./pages/warehouse.component').then((m) => m.WarehouseComponent) },
      { path: 'pm', loadComponent: () => import('./pages/pm.component').then((m) => m.PmComponent) },
      { path: 'pm/records/:id', loadComponent: () => import('./pages/pm-record.component').then((m) => m.PmRecordComponent) },
      { path: 'reports', loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent) },
      { path: 'settings', loadComponent: () => import('./pages/settings.component').then((m) => m.SettingsComponent) },
      { path: '**', redirectTo: '' },
    ],
  },
];

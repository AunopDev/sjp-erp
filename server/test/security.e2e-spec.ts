import { rmSync } from 'node:fs';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dbPath = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || '.';
  const path = `${base}/sjp-security-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`;
  process.env.DATABASE_PATH = path;
  process.env.UPLOAD_DIR = `${base}/sjp-security-uploads-${Date.now()}`;
  return path;
});

const { AppModule } = await import('../src/app.module.js');

describe('security guards (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken = '';
  let techToken = '';
  let techId = '';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const setup = await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ name: 'Admin', username: 'admin', password: 'password123' })
      .expect(201);
    adminToken = setup.body.token;

    await request(app.getHttpServer())
      .put('/api/meta/roles/tech')
      .set(auth(adminToken))
      .send({ perms: { tickets: { view: true, edit: true }, projects: { view: true }, users: { view: true, edit: true }, settings: { view: true, edit: true } } })
      .expect(200);

    const tech = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(adminToken))
      .send({ name: 'Tech', username: 'tech.user', password: 'password123', roleId: 'tech', team: 'ทีมโครงการ' })
      .expect(201);
    techId = tech.body.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tech.user', password: 'password123' })
      .expect(200);
    techToken = login.body.token;
  });

  afterAll(async () => {
    await app.close();
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
    rmSync(process.env.UPLOAD_DIR ?? '', { recursive: true, force: true });
  });

  it('stores a workspace layout per user and sanitizes unsafe values', async () => {
    const workspaceAdmin = adminToken;
    const workspaceTech = techToken;
    const empty = await request(app.getHttpServer()).get('/api/prefs/workspace').set(auth(workspaceAdmin)).expect(200);
    expect(empty.body.widgets).toEqual({});

    const saved = await request(app.getHttpServer())
      .put('/api/prefs/workspace')
      .set(auth(workspaceAdmin))
      .send({
        version: 1,
        widgets: {
          kpi: { x: -10, y: -5, w: 400, z: 99_999 },
          queue: { x: 80, y: 120, w: 50 },
          'bad key!': { x: 0, y: 0, w: 10 },
        },
        hidden: ['finance', 'bad key!'],
      })
      .expect(200);

    expect(saved.body.widgets.kpi).toEqual({ x: 0, y: 0, w: 100, z: 10_000 });
    expect(saved.body.widgets.queue).toEqual({ x: 80, y: 120, w: 20, z: 0 });
    expect(saved.body.widgets['bad key!']).toBeUndefined();
    expect(saved.body.hidden).toEqual(['finance']);

    const again = await request(app.getHttpServer()).get('/api/prefs/workspace').set(auth(workspaceAdmin)).expect(200);
    expect(again.body.widgets.kpi).toEqual({ x: 0, y: 0, w: 100, z: 10_000 });

    const other = await request(app.getHttpServer()).get('/api/prefs/workspace').set(auth(workspaceTech)).expect(200);
    expect(other.body.widgets).toEqual({});

    await request(app.getHttpServer()).delete('/api/prefs/workspace').set(auth(workspaceAdmin)).expect(200);
    const reset = await request(app.getHttpServer()).get('/api/prefs/workspace').set(auth(workspaceAdmin)).expect(200);
    expect(reset.body.widgets).toEqual({});
  });

  it('rejects a vehicle booking that is created as already approved', async () => {
    await request(app.getHttpServer())
      .post('/api/records/vehicleBookings')
      .set(auth(adminToken))
      .send({
        title: 'Site visit',
        vehicle: 'missing',
        requester: 'Admin',
        destination: 'Bangkok',
        startAt: '2026-11-12T09:00:00.000Z',
        endAt: '2026-11-12T10:00:00.000Z',
        status: 'อนุมัติแล้ว',
      })
      .expect(400);
  });

  it('does not let a regular edit request approve its own booking', async () => {
    const vehicle = await request(app.getHttpServer())
      .post('/api/records/vehicles')
      .set(auth(adminToken))
      .send({ name: 'Car 1', plateNo: 'ABC-1234', type: 'รถเก๋ง', status: 'พร้อมใช้' })
      .expect(201);

    const booking = await request(app.getHttpServer())
      .post('/api/records/vehicleBookings')
      .set(auth(adminToken))
      .send({
        title: 'Site visit',
        vehicle: vehicle.body.id,
        requester: 'Admin',
        destination: 'Bangkok',
        startAt: '2026-11-12T09:00:00.000Z',
        endAt: '2026-11-12T10:00:00.000Z',
        status: 'รออนุมัติ',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/records/vehicleBookings/${booking.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'อนุมัติแล้ว' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/records/vehicleBookings/${booking.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'ยกเลิก' })
      .expect(200);
  });

  it('paginates and filters records at the database layer for all-scope users', async () => {
    const paged = await request(app.getHttpServer())
      .get('/api/records/vehicles')
      .query({ pageSize: '10', filters: JSON.stringify({ status: 'พร้อมใช้' }) })
      .set(auth(adminToken))
      .expect(200);
    expect(paged.body.total).toBeGreaterThanOrEqual(1);
    expect(paged.body.items[0].plateNo).toBe('ABC-1234');

    const searched = await request(app.getHttpServer())
      .get('/api/records/vehicles')
      .query({ pageSize: '10', search: 'Car 1', filters: JSON.stringify({ status: 'พร้อมใช้' }) })
      .set(auth(adminToken))
      .expect(200);
    expect(searched.body.total).toBeGreaterThanOrEqual(1);
    expect(searched.body.items[0].plateNo).toBe('ABC-1234');
  });

  it('applies row-level scope in SQL for team-scoped users', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/records/customers')
      .set(auth(adminToken))
      .send({ name: 'Scope Customer' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/records/projects')
      .set(auth(adminToken))
      .send({ name: 'Team A Project', customer: customer.body.id, team: 'ทีมโครงการ' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/records/projects')
      .set(auth(adminToken))
      .send({ name: 'Team B Project', customer: customer.body.id, team: 'ทีมเครือข่าย' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/records/projects')
      .query({ pageSize: '50' })
      .set(auth(techToken))
      .expect(200);
    expect(list.body.items.some((row: { name: string }) => row.name === 'Team A Project')).toBe(true);
    expect(list.body.items.some((row: { name: string }) => row.name === 'Team B Project')).toBe(false);

    const searched = await request(app.getHttpServer())
      .get('/api/records/projects')
      .query({ pageSize: '50', search: 'Scope Customer' })
      .set(auth(techToken))
      .expect(200);
    expect(searched.body.items.some((row: { name: string }) => row.name === 'Team A Project')).toBe(true);
    expect(searched.body.items.some((row: { name: string }) => row.name === 'Team B Project')).toBe(false);
  });

  it('rejects unsupported upload types and accepts allowlisted images', async () => {
    await request(app.getHttpServer())
      .post('/api/files')
      .set(auth(adminToken))
      .attach('file', Buffer.from('MZ'), 'evil.exe')
      .expect(400);

    const uploaded = await request(app.getHttpServer())
      .post('/api/files')
      .set(auth(adminToken))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'photo.png')
      .expect(201);
    expect(uploaded.body.id).toBeTruthy();
    expect(uploaded.body.mime).toBe('image/png');
  });

  it('blocks webhook URLs that resolve to loopback through IPv4-mapped IPv6', async () => {
    await request(app.getHttpServer())
      .post('/api/webhooks')
      .set(auth(adminToken))
      .send({ name: 'loopback', url: 'http://[::ffff:7f00:1]/hook', events: ['record.created'] })
      .expect(400);
  });

  it('blocks ticket assignment without tickets.assign', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/records/customers')
      .set(auth(adminToken))
      .send({ name: 'Ticket Customer' })
      .expect(201);
    const site = await request(app.getHttpServer())
      .post('/api/records/sites')
      .set(auth(adminToken))
      .send({ name: 'Ticket Site', customer: customer.body.id })
      .expect(201);
    const ticket = await request(app.getHttpServer())
      .post('/api/records/tickets')
      .set(auth(adminToken))
      .send({
        title: 'Assignment guard',
        reportedBy: 'Admin',
        receivedAt: '2026-11-11T09:00:00.000Z',
        customer: customer.body.id,
        site: site.body.id,
        category: 'IT Support',
        priority: 'ปกติ',
        symptom: 'test',
        team: 'ทีมโครงการ',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/records/tickets/${ticket.body.id}`)
      .set(auth(techToken))
      .send({ assignee: techId })
      .expect(403);
  });

  it('records structured audit changes for user updates', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/users/${techId}`)
      .set(auth(adminToken))
      .send({ name: 'Tech Updated' })
      .expect(200);

    const audit = await request(app.getHttpServer())
      .get('/api/audit')
      .query({ limit: '100' })
      .set(auth(adminToken))
      .expect(200);
    const entries = audit.body as { action: string; recordId: string; changes: { field: string }[] }[];
    const entry = entries.find((row) => row.action === 'user.update' && row.recordId === techId);
    expect(entry).toBeTruthy();
    expect(entry!.changes.some((change) => change.field === 'ชื่อ-สกุล')).toBe(true);
    expect(entries.some((row) => row.action === 'login_failed')).toBe(true);
  });

  it('blocks generic edits after a project is closed', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/records/customers')
      .set(auth(adminToken))
      .send({ name: 'Closed Project Customer' })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post('/api/records/projects')
      .set(auth(adminToken))
      .send({ name: 'Closed Project', customer: customer.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/projects/${project.body.id}/close`)
      .set(auth(adminToken))
      .send({ reason: 'done' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/records/projects/${project.body.id}`)
      .set(auth(adminToken))
      .send({ name: 'Changed after close' })
      .expect(400);
  });

  it('rejects custom module keys that collide with system resources', async () => {
    await request(app.getHttpServer())
      .post('/api/meta/entities')
      .set(auth(adminToken))
      .send({ key: 'users', label: 'Users clone', fields: [{ key: 'name', label: 'Name', type: 'text' }] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/meta/entities')
      .set(auth(adminToken))
      .send({ key: 'roles', label: 'Roles clone', fields: [{ key: 'name', label: 'Name', type: 'text' }] })
      .expect(400);
  });

  it('stops users.edit from escalating a role or resetting the admin password', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${techId}`)
      .set(auth(techToken))
      .send({ roleId: 'admin' })
      .expect(403);

    const users = await request(app.getHttpServer())
      .get('/api/users')
      .set(auth(adminToken))
      .expect(200);
    const admin = (users.body as { id: string; username: string }[]).find((row) => row.username === 'admin');
    expect(admin).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/users/${admin!.id}`)
      .set(auth(techToken))
      .send({ password: 'password456' })
      .expect(403);
  });

  it('requires an admin and re-authentication to export a backup', async () => {
    await request(app.getHttpServer())
      .post('/api/backup/export')
      .set(auth(techToken))
      .send({ password: 'password123' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/backup/export')
      .set(auth(adminToken))
      .send({ password: 'wrong-password' })
      .expect(400);
  });

  it('encrypts the backup and restores it with the same password', async () => {
    const exported = await request(app.getHttpServer())
      .post('/api/backup/export')
      .set(auth(adminToken))
      .send({ password: 'password123' })
      .expect(201);
    expect(exported.body.encrypted).toBe(true);
    expect(typeof exported.body.data).toBe('string');
    expect(JSON.stringify(exported.body)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .post('/api/backup/restore')
      .set(auth(adminToken))
      .send({ payload: exported.body, confirm: 'RESTORE', password: 'wrong-password' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/backup/restore')
      .set(auth(adminToken))
      .send({ payload: exported.body, confirm: 'RESTORE', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer()).get('/api/auth/me').set(auth(adminToken)).expect(401);
  });

  it('supports HttpOnly cookie auth and requires a CSRF header for mutations', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tech.user', password: 'password123' })
      .expect(200);
    const cookies = (login.headers['set-cookie'] ?? []) as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('sjp_session=') && cookie.includes('HttpOnly'))).toBe(true);
    const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const csrf = /sjp_csrf=([^;]+)/.exec(cookieHeader)?.[1] ?? '';
    expect(csrf).not.toBe('');

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieHeader).expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader)
      .send({ currentPassword: 'password123', newPassword: 'password456' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'password123', newPassword: 'password456' })
      .expect(200);
  });

  it('revokes the session server-side on logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' })
      .expect(200);
    const cookies = (login.headers['set-cookie'] ?? []) as unknown as string[];
    const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const csrf = /sjp_csrf=([^;]+)/.exec(cookieHeader)?.[1] ?? '';

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieHeader).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieHeader).expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set(auth(adminToken)).expect(401);
  });

});


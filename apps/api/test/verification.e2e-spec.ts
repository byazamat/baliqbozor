import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated } from './fixtures.js';

describe('organization verification (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  /** Документ, уже загруженный в хранилище (сама загрузка покрыта media.e2e-spec). */
  const uploadedDoc = (
    orgId: string,
    uploaderId: string,
    status: 'UPLOADED' | 'PENDING_UPLOAD' = 'UPLOADED',
  ) =>
    prismaOf(app).mediaFile.create({
      data: {
        uploaderId,
        orgId,
        kind: 'IMAGE',
        status,
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        storageKey: `org_verification/${orgId}/${Math.random().toString(36).slice(2)}`,
      },
    });

  it('runs the M1 flow: submit → PENDING + task → operator verifies → VERIFIED', async () => {
    const owner = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId, { type: 'SELLER', name: 'Samarqand Baliq' });
    const doc = await uploadedDoc(org.id, owner.userId);

    const submitted = await http()
      .post(`/api/v1/orgs/${org.id}/verification`)
      .set(bearer(owner))
      .send({ mediaIds: [doc.id], note: 'Свидетельство и фото прудов' })
      .expect(200);
    expect(submitted.body.status).toBe('PENDING');
    const prisma = prismaOf(app);
    expect(
      await prisma.opsTask.findUniqueOrThrow({ where: { id: submitted.body.taskId as string } }),
    ).toMatchObject({
      type: 'VERIFY_ORG',
      status: 'OPEN',
      orgId: org.id,
      description: 'Свидетельство и фото прудов',
    });

    const again = await http()
      .post(`/api/v1/orgs/${org.id}/verification`)
      .set(bearer(owner))
      .send({ mediaIds: [doc.id] })
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    const queue = await http()
      .get('/api/v1/admin/orgs?status=PENDING')
      .set(bearer(operator))
      .expect(200);
    expect(queue.body.items).toEqual([
      expect.objectContaining({ id: org.id, name: 'Samarqand Baliq', type: 'SELLER' }),
    ]);
    const card = await http().get(`/api/v1/admin/orgs/${org.id}`).set(bearer(operator)).expect(200);
    expect(card.body.documents).toEqual([expect.objectContaining({ id: doc.id })]);
    expect(card.body.tasks).toHaveLength(1);
    expect(card.body.members).toEqual([
      expect.objectContaining({ userId: owner.userId, role: 'OWNER' }),
    ]);

    const verified = await http()
      .post(`/api/v1/admin/orgs/${org.id}/verify`)
      .set(bearer(operator))
      .send({ note: 'Позвонил, всё верно' })
      .expect(200);
    expect(verified.body.status).toBe('VERIFIED');
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({
      verificationStatus: 'VERIFIED',
      verifiedById: operator.userId,
      verificationNote: 'Позвонил, всё верно',
    });
    expect((await prisma.opsTask.findFirstOrThrow()).status).toBe('DONE');
    const types = (await prisma.domainEvent.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (e) => e.type,
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'org.verification.submitted',
        'ops.task.created',
        'org.verification.approved',
      ]),
    );
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['org.verification.submit', 'org.approve'] } },
      }),
    ).toBe(2);
  });

  it('rejects with a note, allows resubmission, suspends and unsuspends', async () => {
    const owner = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId, { type: 'CARRIER' });
    const doc = await uploadedDoc(org.id, owner.userId);
    const submit = () =>
      http()
        .post(`/api/v1/orgs/${org.id}/verification`)
        .set(bearer(owner))
        .send({ mediaIds: [doc.id] });
    const admin = (action: string, body: object = {}) =>
      http().post(`/api/v1/admin/orgs/${org.id}/${action}`).set(bearer(operator)).send(body);

    await submit().expect(200);
    await admin('reject').expect(400);
    expect((await admin('reject', { note: 'Нечитаемое фото' }).expect(200)).body.status).toBe(
      'REJECTED',
    );
    const own = await http().get(`/api/v1/orgs/${org.id}`).set(bearer(owner)).expect(200);
    expect(own.body.private.verificationNote).toBe('Нечитаемое фото');
    expect(
      await prismaOf(app).domainEvent.count({ where: { type: 'org.verification.rejected' } }),
    ).toBe(1);

    await submit().expect(200);
    await admin('verify').expect(200);
    await admin('verify').expect(409);
    expect((await admin('suspend', { note: 'Жалобы' }).expect(200)).body.status).toBe('SUSPENDED');
    expect((await admin('unsuspend').expect(200)).body.status).toBe('VERIFIED');
  });

  it('validates documents: own, uploaded, non-empty', async () => {
    const owner = await actor(app, sms);
    const other = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const foreignOrg = await createOrg(app, other.userId);
    const foreign = await uploadedDoc(foreignOrg.id, other.userId);
    const pending = await uploadedDoc(org.id, owner.userId, 'PENDING_UPLOAD');
    const post = (mediaIds: unknown) =>
      http().post(`/api/v1/orgs/${org.id}/verification`).set(bearer(owner)).send({ mediaIds });
    await post([]).expect(400);
    await post(['not-uuid']).expect(400);
    await post([foreign.id]).expect(400);
    await post([pending.id]).expect(400);
    expect(
      (await prismaOf(app).organization.findUniqueOrThrow({ where: { id: org.id } }))
        .verificationStatus,
    ).toBe('UNVERIFIED');
  });

  it('lists uploaded documents to members and operators only', async () => {
    const owner = await actor(app, sms);
    const staff = await actor(app, sms);
    const outsider = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId);
    await addMember(app, org.id, staff.userId, 'STAFF');
    const first = await uploadedDoc(org.id, owner.userId);
    const second = await uploadedDoc(org.id, owner.userId);
    await uploadedDoc(org.id, owner.userId, 'PENDING_UPLOAD');
    const url = `/api/v1/orgs/${org.id}/documents`;

    const own = await http().get(url).set(bearer(owner)).expect(200);
    expect((own.body as { id: string }[]).map((d) => d.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(own.body[0]).toEqual(
      expect.objectContaining({ kind: 'IMAGE', status: 'UPLOADED', sizeBytes: 1000 }),
    );
    await http().get(url).set(bearer(staff)).expect(200);
    await http().get(url).set(bearer(operator)).expect(200);
    await expectIsolated(http().get(url).set(bearer(outsider)));
    await http().get(url).expect(401);
  });

  it('lets only the owner submit and only operators decide; isolates organizations', async () => {
    const owner = await actor(app, sms);
    const manager = await actor(app, sms);
    const outsider = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    await addMember(app, org.id, manager.userId, 'MANAGER');
    const doc = await uploadedDoc(org.id, owner.userId);

    await http()
      .post(`/api/v1/orgs/${org.id}/verification`)
      .set(bearer(manager))
      .send({ mediaIds: [doc.id] })
      .expect(403);
    await expectIsolated(
      http()
        .post(`/api/v1/orgs/${org.id}/verification`)
        .set(bearer(outsider))
        .send({ mediaIds: [doc.id] }),
    );
    for (const path of ['orgs', `orgs/${org.id}`, 'tasks']) {
      await http().get(`/api/v1/admin/${path}`).set(bearer(owner)).expect(403);
    }
    await http()
      .post(`/api/v1/admin/orgs/${org.id}/verify`)
      .set(bearer(owner))
      .send({})
      .expect(403);
    await http().get('/api/v1/admin/orgs').expect(401);
  });

  it('searches organizations and manages tasks', async () => {
    const owner = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const admin = await actor(app, sms, 'ADMIN');
    const org = await createOrg(app, owner.userId, { name: 'Forel Chorvoq' });
    await prismaOf(app).organization.update({ where: { id: org.id }, data: { tin: '305123456' } });
    await createOrg(app, owner.userId, { name: 'Boshqa' });

    const byName = await http().get('/api/v1/admin/orgs?q=forel').set(bearer(operator)).expect(200);
    expect((byName.body.items as { id: string }[]).map((o) => o.id)).toEqual([org.id]);
    const byTin = await http().get('/api/v1/admin/orgs?q=305123').set(bearer(operator)).expect(200);
    expect(byTin.body.items).toHaveLength(1);
    const byPhone = await http()
      .get(`/api/v1/admin/orgs?q=${owner.phone.slice(-7)}`)
      .set(bearer(operator))
      .expect(200);
    expect(byPhone.body.items).toHaveLength(2);
    const paged = await http().get('/api/v1/admin/orgs?limit=1').set(bearer(admin)).expect(200);
    expect(paged.body.items).toHaveLength(1);
    const next = await http()
      .get(`/api/v1/admin/orgs?limit=1&cursor=${paged.body.nextCursor as string}`)
      .set(bearer(admin))
      .expect(200);
    expect(next.body.items[0].id).not.toBe(paged.body.items[0].id);

    const doc = await uploadedDoc(org.id, owner.userId);
    await http()
      .post(`/api/v1/orgs/${org.id}/verification`)
      .set(bearer(owner))
      .send({ mediaIds: [doc.id] })
      .expect(200);
    const tasks = await http()
      .get('/api/v1/admin/tasks?type=VERIFY_ORG')
      .set(bearer(operator))
      .expect(200);
    const taskId = tasks.body.items[0].id as string;
    const assigned = await http()
      .patch(`/api/v1/admin/tasks/${taskId}`)
      .set(bearer(operator))
      .send({ assigneeId: operator.userId })
      .expect(200);
    expect(assigned.body.assigneeId).toBe(operator.userId);
    await http()
      .patch(`/api/v1/admin/tasks/${taskId}`)
      .set(bearer(operator))
      .send({ assigneeId: owner.userId })
      .expect(400);
    await http()
      .patch(`/api/v1/admin/tasks/${taskId}`)
      .set(bearer(operator))
      .send({ assigneeId: null, status: 'CANCELLED' })
      .expect(200);
    expect(
      (await http().get('/api/v1/admin/tasks').set(bearer(operator)).expect(200)).body.items,
    ).toEqual([]);
  });
});

import { seedReference } from '@baliqbozor/db/seed';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms, loginAs } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, expectIsolated } from './fixtures.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/**
 * Критерий готовности M1 (SPEC 14.1) через публичный API: регистрация продавца → организация →
 * документы (настоящая загрузка в MinIO) → оператор проверяет и верифицирует → событие для
 * уведомления владельцу. Само уведомление из события создаёт worker (его e2e и Playwright).
 */
describe('M1 acceptance: seller verification end to end (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
    await seedReference(prismaOf(app));
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('registers a seller, verifies the organization and notifies the owner', async () => {
    const prisma = prismaOf(app);

    // 1. Регистрация: новый номер → OTP → пользователь, онбординг нужен.
    const phone = '+998 93 210 00 01';
    await http()
      .post('/api/v1/auth/otp/request')
      .set('Accept-Language', 'ru')
      .send({ phone })
      .expect(200);
    const login = await http()
      .post('/api/v1/auth/otp/verify')
      .set('Accept-Language', 'ru')
      .send({ phone, code: sms.lastCode('+998932100001') })
      .expect(200);
    expect(login.body).toMatchObject({ isNewUser: true, user: { locale: 'ru' } });
    const seller = {
      accessToken: login.body.accessToken as string,
      userId: login.body.user.id as string,
    };
    const me = await http().get('/api/v1/me').set(bearer(seller)).expect(200);
    expect(me.body.organizations).toEqual([]);

    // 2. Онбординг: организация-продавец, создатель — OWNER.
    const region = await prisma.region.findUniqueOrThrow({ where: { code: 'SAMARKAND' } });
    const created = await http()
      .post('/api/v1/orgs')
      .set(bearer(seller))
      .send({
        type: 'SELLER',
        legalForm: 'FARM_ENTERPRISE',
        name: 'Zarafshon Baliq',
        tin: '309876543',
        regionId: region.id,
        contactPhone: '+998932100001',
      })
      .expect(201);
    const orgId = created.body.id as string;
    expect(created.body).toMatchObject({
      verificationStatus: 'UNVERIFIED',
      private: { myRole: 'OWNER' },
    });

    // 3. Документ: presigned PUT в хранилище → complete → в списке документов.
    const upload = await http()
      .post('/api/v1/media/upload-url')
      .set(bearer(seller))
      .set('X-Org-Id', orgId)
      .send({
        kind: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
        purpose: 'ORG_VERIFICATION',
      })
      .expect(201);
    const put = await fetch(upload.body.uploadUrl as string, {
      method: 'PUT',
      headers: upload.body.headers as Record<string, string>,
      body: PNG,
    });
    expect(put.ok).toBe(true);
    const mediaId = upload.body.mediaId as string;
    await http().post(`/api/v1/media/${mediaId}/complete`).set(bearer(seller)).expect(200);
    const docs = await http()
      .get(`/api/v1/orgs/${orgId}/documents`)
      .set(bearer(seller))
      .expect(200);
    expect(docs.body).toEqual([expect.objectContaining({ id: mediaId, status: 'UPLOADED' })]);

    // 3a. Хозяйство до верификации (D-28): без него отправка отклоняется.
    const noFarm = await http()
      .post(`/api/v1/orgs/${orgId}/verification`)
      .set(bearer(seller))
      .send({ mediaIds: [mediaId] })
      .expect(400);
    expect(noFarm.body.error.details.fields).toEqual([
      { field: 'farms', constraints: ['farmRequired'] },
    ]);
    const samarkand = await prismaOf(app).region.findUniqueOrThrow({
      where: { code: 'SAMARKAND' },
    });
    await http()
      .post('/api/v1/farms')
      .set(bearer(seller))
      .set('X-Org-Id', orgId)
      .send({
        name: 'Zarafshon hovuzlari',
        regionId: samarkand.id,
        lat: '39.654200',
        lng: '66.959700',
        waterBodyTypes: ['POND'],
      })
      .expect(201);

    // 4. Отправка на проверку → PENDING и задача оператору.
    const submitted = await http()
      .post(`/api/v1/orgs/${orgId}/verification`)
      .set(bearer(seller))
      .send({ mediaIds: [mediaId], note: 'Свидетельство фермерского хозяйства' })
      .expect(200);
    expect(submitted.body.status).toBe('PENDING');

    // 5. Оператор: очередь → карточка → документ по подписанной ссылке → верификация.
    const operator = await actor(app, sms, 'OPERATOR');
    const queue = await http()
      .get('/api/v1/admin/orgs')
      .query({ status: 'PENDING', q: 'zarafshon' })
      .set(bearer(operator))
      .expect(200);
    expect(queue.body.items).toEqual([expect.objectContaining({ id: orgId })]);
    const card = await http().get(`/api/v1/admin/orgs/${orgId}`).set(bearer(operator)).expect(200);
    expect(card.body).toMatchObject({
      org: { private: { tin: '309876543' } },
      documents: [{ id: mediaId }],
      tasks: [{ type: 'VERIFY_ORG', description: 'Свидетельство фермерского хозяйства' }],
    });
    const link = await http().get(`/api/v1/media/${mediaId}/url`).set(bearer(operator)).expect(200);
    const file = await fetch(link.body.url as string);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);

    await http()
      .post(`/api/v1/admin/orgs/${orgId}/verify`)
      .set(bearer(operator))
      .send({ note: 'Проверено по видеозвонку' })
      .expect(200);

    // 6. Владелец видит статус; событие для уведомления записано в outbox той же транзакцией.
    const after = await http().get('/api/v1/me').set(bearer(seller)).expect(200);
    expect(after.body.organizations).toEqual([
      expect.objectContaining({ id: orgId, role: 'OWNER', verificationStatus: 'VERIFIED' }),
    ]);
    const event = await prisma.domainEvent.findFirstOrThrow({
      where: { type: 'org.verification.approved', aggregateId: orgId },
    });
    expect(event.payload).toMatchObject({ orgId, operatorId: operator.userId });
    expect(
      await prisma.opsTask.count({ where: { orgId, type: 'VERIFY_ORG', status: 'OPEN' } }),
    ).toBe(0);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: orgId },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'org.create',
      'org.verification.submit',
      'org.approve',
    ]);

    // 7. Чужой пользователь ничего из этого не видит.
    const outsider = await loginAs(app, sms, '+998932100002');
    await expectIsolated(http().get(`/api/v1/orgs/${orgId}/documents`).set(bearer(outsider)));
    await http().get(`/api/v1/media/${mediaId}/url`).set(bearer(outsider)).expect(404);
    await http().get(`/api/v1/admin/orgs/${orgId}`).set(bearer(outsider)).expect(403);
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated } from './fixtures.js';

const PNG = Buffer.from(
  // Корректный PNG 2×2: worker проверяет содержимое и битый файл отклонит (D-52).
  '89504e470d0a1a0a0000000d494844520000000200000002080600000072b60d240000000970485973000003e8' +
    '000003e801b57b526b0000001149444154089963505a55fe1f8419600c004c9209093d223d910000000049454e44ae426082',
  'hex',
);

describe('media uploads (e2e, real MinIO)', () => {
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
  const requestUpload = (who: { accessToken: string }, orgId: string, over: object = {}) =>
    http()
      .post('/api/v1/media/upload-url')
      .set(bearer(who))
      .set('X-Org-Id', orgId)
      .send({
        kind: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
        purpose: 'ORG_VERIFICATION',
        ...over,
      });

  async function upload(url: string, headers: Record<string, string>, body: Buffer) {
    return fetch(url, { method: 'PUT', headers, body });
  }

  it('uploads through a presigned URL, completes and serves a signed download link', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const res = await requestUpload(owner, org.id).expect(201);
    expect(res.body).toMatchObject({ headers: { 'Content-Type': 'image/png' } });
    const mediaId = res.body.mediaId as string;

    const before = await http()
      .post(`/api/v1/media/${mediaId}/complete`)
      .set(bearer(owner))
      .expect(409);
    expect(before.body.error.details.reason).toBe('NOT_UPLOADED');

    const put = await upload(
      res.body.uploadUrl as string,
      res.body.headers as Record<string, string>,
      PNG,
    );
    expect(put.status).toBe(200);
    const done = await http()
      .post(`/api/v1/media/${mediaId}/complete`)
      .set(bearer(owner))
      .expect(200);
    expect(done.body).toMatchObject({
      id: mediaId,
      status: 'UPLOADED',
      kind: 'IMAGE',
      sizeBytes: PNG.length,
    });

    const link = await http().get(`/api/v1/media/${mediaId}/url`).set(bearer(owner)).expect(200);
    const file = await fetch(link.body.url as string);
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true);
    expect(
      await prismaOf(app).mediaFile.findUniqueOrThrow({ where: { id: mediaId } }),
    ).toMatchObject({
      orgId: org.id,
      uploaderId: owner.userId,
      storageKey: `org_verification/${org.id}/${mediaId}`,
    });
  });

  it('the storage refuses a file of another size than declared', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const res = await requestUpload(owner, org.id, { sizeBytes: PNG.length + 10 }).expect(201);
    const put = await upload(
      res.body.uploadUrl as string,
      res.body.headers as Record<string, string>,
      PNG,
    );
    expect(put.ok).toBe(false);
    await http()
      .post(`/api/v1/media/${res.body.mediaId as string}/complete`)
      .set(bearer(owner))
      .expect(409);
  });

  it('validates kind, MIME type and size (SPEC 10.3)', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    expect(
      (await requestUpload(owner, org.id, { kind: 'VIDEO', mimeType: 'video/mp4' }).expect(415))
        .body.error.code,
    ).toBe('MEDIA_TYPE_NOT_ALLOWED');
    await requestUpload(owner, org.id, { mimeType: 'image/gif' }).expect(415);
    expect(
      (await requestUpload(owner, org.id, { sizeBytes: 16 * 1024 * 1024 }).expect(413)).body.error
        .code,
    ).toBe('MEDIA_TOO_LARGE');
    await requestUpload(owner, org.id, { purpose: 'AVATAR' }).expect(400);
    await requestUpload(owner, org.id, { sizeBytes: 0 }).expect(400);
  });

  it('only the owner uploads verification documents; access to files is isolated', async () => {
    const owner = await actor(app, sms);
    const manager = await actor(app, sms);
    const outsider = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId);
    const otherOrg = await createOrg(app, outsider.userId);
    await addMember(app, org.id, manager.userId, 'MANAGER');

    await requestUpload(manager, org.id).expect(403);
    await expectIsolated(requestUpload(outsider, org.id));

    const res = await requestUpload(owner, org.id).expect(201);
    const mediaId = res.body.mediaId as string;
    await upload(res.body.uploadUrl as string, res.body.headers as Record<string, string>, PNG);
    await expectIsolated(http().post(`/api/v1/media/${mediaId}/complete`).set(bearer(manager)));
    await http().post(`/api/v1/media/${mediaId}/complete`).set(bearer(owner)).expect(200);

    await http().get(`/api/v1/media/${mediaId}/url`).set(bearer(manager)).expect(200);
    await http().get(`/api/v1/media/${mediaId}/url`).set(bearer(operator)).expect(200);
    await expectIsolated(http().get(`/api/v1/media/${mediaId}/url`).set(bearer(outsider)));
    await expectIsolated(
      http().get(`/api/v1/media/${mediaId}/url`).set(bearer(outsider)).set('X-Org-Id', otherOrg.id),
    );
    await http()
      .get('/api/v1/media/00000000-0000-4000-8000-000000000000/url')
      .set(bearer(owner))
      .expect(404);
  });

  it('seller photos and videos: OWNER/MANAGER of a seller upload, completion queues processing', async () => {
    const owner = await actor(app, sms);
    const manager = await actor(app, sms);
    const staff = await actor(app, sms);
    const buyer = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const buyerOrg = await createOrg(app, buyer.userId, { type: 'BUYER' });
    await addMember(app, org.id, manager.userId, 'MANAGER');
    await addMember(app, org.id, staff.userId, 'STAFF');

    await requestUpload(staff, org.id, { purpose: 'LISTING_MEDIA' }).expect(403);
    await requestUpload(buyer, buyerOrg.id, { purpose: 'FARM_PHOTO' }).expect(403);
    await requestUpload(manager, org.id, {
      purpose: 'FARM_PHOTO',
      kind: 'VIDEO',
      mimeType: 'video/mp4',
    }).expect(415);
    await requestUpload(manager, org.id, {
      purpose: 'LISTING_MEDIA',
      kind: 'VIDEO',
      mimeType: 'video/quicktime',
      sizeBytes: 60 * 1024 * 1024,
    }).expect(201);

    const res = await requestUpload(manager, org.id, { purpose: 'LISTING_MEDIA' }).expect(201);
    const mediaId = res.body.mediaId as string;
    await upload(res.body.uploadUrl as string, res.body.headers as Record<string, string>, PNG);
    await http().post(`/api/v1/media/${mediaId}/complete`).set(bearer(manager)).expect(200);
    const prisma = prismaOf(app);
    expect(await prisma.mediaFile.findUniqueOrThrow({ where: { id: mediaId } })).toMatchObject({
      purpose: 'LISTING_MEDIA',
      status: 'UPLOADED',
      orgId: org.id,
    });
    expect(
      await prisma.domainEvent.count({ where: { type: 'media.uploaded', aggregateId: mediaId } }),
    ).toBe(1);
    // повторный complete не пишет второе событие
    await http().post(`/api/v1/media/${mediaId}/complete`).set(bearer(manager)).expect(200);
    expect(
      await prisma.domainEvent.count({ where: { type: 'media.uploaded', aggregateId: mediaId } }),
    ).toBe(1);

    const status = await http().get(`/api/v1/media/${mediaId}`).set(bearer(staff)).expect(200);
    expect(status.body).toMatchObject({ id: mediaId, status: 'UPLOADED', hasThumbnail: false });
    await http().get(`/api/v1/media/${mediaId}/url?variant=thumb`).set(bearer(owner)).expect(404);
    await expectIsolated(http().get(`/api/v1/media/${mediaId}`).set(bearer(buyer)));

    // документы организации — только назначения ORG_VERIFICATION
    const docs = await http()
      .get(`/api/v1/orgs/${org.id}/documents`)
      .set(bearer(owner))
      .set('X-Org-Id', org.id)
      .expect(200);
    expect(docs.body).toEqual([]);
  });
});

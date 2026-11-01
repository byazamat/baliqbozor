import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated } from './fixtures.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
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
});

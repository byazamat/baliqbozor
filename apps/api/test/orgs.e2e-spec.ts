import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated, nextPhone } from './fixtures.js';

describe('profile, organizations and members (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();
  let regionId: number;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
    const region = await prismaOf(app).region.create({
      data: { code: 'SAMARKAND', nameUz: 'Samarqand', nameRu: 'Самаркандская' },
    });
    regionId = region.id;
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const sellerBody = () => ({
    type: 'SELLER',
    legalForm: 'FARM_ENTERPRISE',
    name: 'Baliq Xo‘jaligi',
    tin: '123456789',
    regionId,
    contactPhone: '+998 90 555 66 77',
  });

  describe('/me', () => {
    it('returns the profile with organizations and updates name and language', async () => {
      const u = await actor(app, sms);
      const org = await createOrg(app, u.userId, { type: 'BUYER', name: 'Restoran' });
      const me = await http().get('/api/v1/me').set(bearer(u)).expect(200);
      expect(me.body).toMatchObject({
        id: u.userId,
        phone: u.phone,
        organizations: [
          {
            id: org.id,
            name: 'Restoran',
            type: 'BUYER',
            role: 'OWNER',
            verificationStatus: 'UNVERIFIED',
          },
        ],
      });
      const upd = await http()
        .patch('/api/v1/me')
        .set(bearer(u))
        .send({ fullName: '  Azamat  ', locale: 'ru' })
        .expect(200);
      expect(upd.body).toMatchObject({ fullName: 'Azamat', locale: 'ru' });
      expect(await prismaOf(app).auditLog.count({ where: { action: 'user.update' } })).toBe(1);
    });

    it('validates input and requires authentication', async () => {
      const u = await actor(app, sms);
      await http().patch('/api/v1/me').set(bearer(u)).send({ locale: 'en' }).expect(400);
      await http().patch('/api/v1/me').set(bearer(u)).send({ phone: '+998900000000' }).expect(400);
      await http().get('/api/v1/me').expect(401);
    });
  });

  describe('POST /orgs and GET /orgs/:id', () => {
    it('creates an organization with the creator as OWNER, event and audit', async () => {
      const u = await actor(app, sms);
      const res = await http().post('/api/v1/orgs').set(bearer(u)).send(sellerBody()).expect(201);
      expect(res.body).toMatchObject({
        type: 'SELLER',
        name: 'Baliq Xo‘jaligi',
        verificationStatus: 'UNVERIFIED',
        region: { id: regionId, code: 'SAMARKAND' },
        private: { tin: '123456789', contactPhone: '+998905556677', myRole: 'OWNER' },
      });
      const prisma = prismaOf(app);
      expect(
        await prisma.membership.findFirst({ where: { orgId: res.body.id, userId: u.userId } }),
      ).toMatchObject({ role: 'OWNER' });
      expect(
        await prisma.domainEvent.count({
          where: { type: 'org.created', aggregateId: res.body.id },
        }),
      ).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'org.create' } })).toBe(1);
    });

    it('validates type, TIN rules (SPEC 8.1), region and phone', async () => {
      const u = await actor(app, sms);
      const post = (body: object) => http().post('/api/v1/orgs').set(bearer(u)).send(body);
      await post({ ...sellerBody(), type: 'SUPPLIER' }).expect(400);
      const noTin = await post({ ...sellerBody(), tin: undefined }).expect(400);
      expect(noTin.body.error.details.fields[0].field).toBe('tin');
      await post({ ...sellerBody(), tin: '12345' }).expect(400);
      await post({ ...sellerBody(), legalForm: 'INDIVIDUAL', tin: undefined }).expect(201);
      await post({ ...sellerBody(), regionId: 9999 }).expect(400);
      await post({ ...sellerBody(), contactPhone: '123' }).expect(400);
      await post({ ...sellerBody(), name: 'x' }).expect(400);
    });

    it('shows private fields only to members and platform staff', async () => {
      const owner = await actor(app, sms);
      const outsider = await actor(app, sms);
      const operator = await actor(app, sms, 'OPERATOR');
      const created = await http()
        .post('/api/v1/orgs')
        .set(bearer(owner))
        .send(sellerBody())
        .expect(201);
      const id = created.body.id as string;

      const pub = await http().get(`/api/v1/orgs/${id}`).set(bearer(outsider)).expect(200);
      expect(pub.body.private).toBeUndefined();
      expect(pub.body).toMatchObject({
        name: 'Baliq Xo‘jaligi',
        ratingCount: 0,
        completedOrders: 0,
      });
      const staff = await http().get(`/api/v1/orgs/${id}`).set(bearer(operator)).expect(200);
      expect(staff.body.private).toMatchObject({ tin: '123456789', myRole: null });
      await http()
        .get('/api/v1/orgs/00000000-0000-4000-8000-000000000000')
        .set(bearer(owner))
        .expect(404);
      await http().get('/api/v1/orgs/not-a-uuid').set(bearer(owner)).expect(400);
    });
  });

  describe('PATCH /orgs/:id', () => {
    it('lets the owner edit; locks legal fields during and after review (D-30)', async () => {
      const owner = await actor(app, sms);
      const org = await createOrg(app, owner.userId, { status: 'UNVERIFIED' });
      const patch = (body: object) =>
        http().patch(`/api/v1/orgs/${org.id}`).set(bearer(owner)).send(body);

      const ok = await patch({
        name: 'Yangi nom',
        tin: '987654321',
        description: 'Hovuzlar',
      }).expect(200);
      expect(ok.body).toMatchObject({
        name: 'Yangi nom',
        description: 'Hovuzlar',
        private: { tin: '987654321' },
      });
      await patch({ type: 'BUYER' }).expect(400);

      await prismaOf(app).organization.update({
        where: { id: org.id },
        data: { verificationStatus: 'VERIFIED' },
      });
      const locked = await patch({ name: 'Boshqa' }).expect(409);
      expect(locked.body.error.code).toBe('CONFLICT');
      await patch({ description: 'Yangilangan' }).expect(200);

      await prismaOf(app).organization.update({
        where: { id: org.id },
        data: { verificationStatus: 'SUSPENDED' },
      });
      expect((await patch({ description: 'x' }).expect(403)).body.error.code).toBe('ORG_SUSPENDED');
      expect(await prismaOf(app).domainEvent.count({ where: { type: 'org.updated' } })).toBe(2);
    });

    it('allows only OWNER and platform staff; isolates other organizations', async () => {
      const owner = await actor(app, sms);
      const manager = await actor(app, sms);
      const outsider = await actor(app, sms);
      const admin = await actor(app, sms, 'ADMIN');
      const org = await createOrg(app, owner.userId, { status: 'VERIFIED' });
      await addMember(app, org.id, manager.userId, 'MANAGER');

      await http()
        .patch(`/api/v1/orgs/${org.id}`)
        .set(bearer(manager))
        .send({ description: 'x' })
        .expect(403);
      await expectIsolated(
        http().patch(`/api/v1/orgs/${org.id}`).set(bearer(outsider)).send({ description: 'x' }),
      );
      const byAdmin = await http()
        .patch(`/api/v1/orgs/${org.id}`)
        .set(bearer(admin))
        .send({ name: 'Admin fix' })
        .expect(200);
      expect(byAdmin.body.name).toBe('Admin fix');
    });
  });

  describe('members and invitations', () => {
    it('adds existing users at once and invites new phones (SPEC 8.1)', async () => {
      const owner = await actor(app, sms);
      const existing = await actor(app, sms);
      const org = await createOrg(app, owner.userId);
      const invite = (body: object) =>
        http().post(`/api/v1/orgs/${org.id}/members`).set(bearer(owner)).send(body);

      const added = await invite({ phone: existing.phone, role: 'MANAGER' }).expect(201);
      expect(added.body).toMatchObject({
        result: 'ADDED',
        member: { userId: existing.userId, role: 'MANAGER' },
      });
      expect(
        (await invite({ phone: existing.phone, role: 'STAFF' }).expect(409)).body.error.details
          .reason,
      ).toBe('ALREADY_MEMBER');

      const newPhone = nextPhone();
      const invited = await invite({ phone: newPhone, role: 'STAFF' }).expect(201);
      expect(invited.body).toMatchObject({
        result: 'INVITED',
        invitation: { phone: newPhone, role: 'STAFF' },
      });
      await invite({ phone: newPhone, role: 'MANAGER' }).expect(201); // повтор обновляет приглашение

      const list = await http()
        .get(`/api/v1/orgs/${org.id}/members`)
        .set(bearer(owner))
        .expect(200);
      expect(list.body.members).toHaveLength(2);
      expect(list.body.invitations).toEqual([
        expect.objectContaining({ phone: newPhone, role: 'MANAGER' }),
      ]);
      const asManager = await http()
        .get(`/api/v1/orgs/${org.id}/members`)
        .set(bearer(existing))
        .expect(200);
      expect(asManager.body.invitations).toEqual([]);

      const prisma = prismaOf(app);
      expect(await prisma.domainEvent.count({ where: { type: 'org.member.added' } })).toBe(1);
      expect(await prisma.domainEvent.count({ where: { type: 'org.member.invited' } })).toBe(2);

      await invite({ phone: 'abc', role: 'STAFF' }).expect(400);
      await invite({ phone: newPhone, role: 'BOSS' }).expect(400);

      const invitationId = invited.body.invitation.id as string;
      await http()
        .delete(`/api/v1/orgs/${org.id}/invitations/${invitationId}`)
        .set(bearer(owner))
        .expect(204);
      await http()
        .delete(`/api/v1/orgs/${org.id}/invitations/${invitationId}`)
        .set(bearer(owner))
        .expect(404);
    });

    it('changes roles and removes members but keeps the last owner', async () => {
      const owner = await actor(app, sms);
      const staff = await actor(app, sms);
      const org = await createOrg(app, owner.userId);
      await addMember(app, org.id, staff.userId, 'STAFF');
      const base = `/api/v1/orgs/${org.id}/members`;

      await http()
        .patch(`${base}/${staff.userId}`)
        .set(bearer(owner))
        .send({ role: 'MANAGER' })
        .expect(200);
      const lastOwner = await http()
        .patch(`${base}/${owner.userId}`)
        .set(bearer(owner))
        .send({ role: 'STAFF' })
        .expect(409);
      expect(lastOwner.body.error.details.reason).toBe('LAST_OWNER');
      await http().delete(`${base}/${owner.userId}`).set(bearer(owner)).expect(409);
      await http()
        .patch(`${base}/${staff.userId}`)
        .set(bearer(owner))
        .send({ role: 'OWNER' })
        .expect(200);
      await http().delete(`${base}/${owner.userId}`).set(bearer(staff)).expect(204);
      await http()
        .delete(`${base}/00000000-0000-4000-8000-000000000000`)
        .set(bearer(staff))
        .expect(404);
      expect(await prismaOf(app).domainEvent.count({ where: { type: 'org.member.removed' } })).toBe(
        1,
      );
    });

    it('allows managing members only for OWNER; isolates outsiders', async () => {
      const owner = await actor(app, sms);
      const manager = await actor(app, sms);
      const outsider = await actor(app, sms);
      const org = await createOrg(app, owner.userId);
      await addMember(app, org.id, manager.userId, 'MANAGER');
      const base = `/api/v1/orgs/${org.id}/members`;

      await http()
        .post(base)
        .set(bearer(manager))
        .send({ phone: nextPhone(), role: 'STAFF' })
        .expect(403);
      await http()
        .patch(`${base}/${owner.userId}`)
        .set(bearer(manager))
        .send({ role: 'STAFF' })
        .expect(403);
      await http().delete(`${base}/${owner.userId}`).set(bearer(manager)).expect(403);
      await expectIsolated(http().get(base).set(bearer(outsider)));
      await expectIsolated(
        http().post(base).set(bearer(outsider)).send({ phone: nextPhone(), role: 'OWNER' }),
      );
    });
  });
});

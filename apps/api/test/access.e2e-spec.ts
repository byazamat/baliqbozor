import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { AuthContext } from '../src/common/request-context.js';
import { OrgScoped, PlatformRoles } from '../src/modules/auth/access.decorators.js';
import { CurrentAuth } from '../src/modules/auth/current-auth.decorator.js';
import { assertCanInOrg, assertOrgStatusAllows } from '../src/modules/auth/policy.js';
import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated } from './fixtures.js';

@Controller('test-access')
class AccessProbeController {
  @Get('platform')
  @PlatformRoles('OPERATOR', 'ADMIN')
  platform() {
    return { ok: true };
  }

  @Get('org')
  @OrgScoped()
  org(@CurrentAuth() auth: AuthContext) {
    return auth.org;
  }

  @Get('org-owner')
  @OrgScoped({ roles: ['OWNER'] })
  orgOwner() {
    return { ok: true };
  }

  @Get('seller')
  @OrgScoped({ types: ['SELLER'] })
  seller() {
    return { ok: true };
  }

  @Get('staff-ok')
  @OrgScoped({ allowPlatformStaff: true })
  staffOk(@CurrentAuth() auth: AuthContext) {
    return auth.org;
  }

  @Get('orgs/:id')
  @OrgScoped({ fromParam: 'id' })
  byPath(@CurrentAuth() auth: AuthContext) {
    return auth.org;
  }

  @Get('publish')
  @OrgScoped()
  publish(@CurrentAuth() auth: AuthContext) {
    assertOrgStatusAllows(auth, 'PUBLISH_LISTING');
    return { ok: true };
  }

  @Get('edit')
  @OrgScoped({ allowPlatformStaff: true })
  edit(@CurrentAuth() auth: AuthContext) {
    assertCanInOrg(auth, 'ORG_EDIT');
    return { ok: true };
  }
}

@Module({ controllers: [AccessProbeController] })
class AccessProbeModule {}

describe('access guards (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ token: SMS_PROVIDER, value: sms }],
      extraModules: [AccessProbeModule],
    });
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, who: { accessToken: string }, orgId?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/test-access/${path}`).set(bearer(who));
    return orgId ? req.set('X-Org-Id', orgId) : req;
  };

  it('restricts platform routes by platform role', async () => {
    const user = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const admin = await actor(app, sms, 'ADMIN');
    const denied = await get('platform', user).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    await get('platform', operator).expect(200);
    await get('platform', admin).expect(200);
  });

  it('requires membership in the X-Org-Id organization and exposes it to handlers', async () => {
    const a = await actor(app, sms);
    const b = await actor(app, sms);
    const orgA = await createOrg(app, a.userId, { type: 'BUYER', status: 'VERIFIED' });

    const res = await get('org', a, orgA.id).expect(200);
    expect(res.body).toEqual({
      id: orgA.id,
      type: 'BUYER',
      role: 'OWNER',
      verificationStatus: 'VERIFIED',
    });

    await expectIsolated(get('org', b, orgA.id));
    const missing = await get('org', a).expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
    await expectIsolated(get('org', a, '00000000-0000-4000-8000-000000000000'));
    await expectIsolated(get('org', a, 'not-a-uuid'));
  });

  it('checks organization roles and types', async () => {
    const owner = await actor(app, sms);
    const staff = await actor(app, sms);
    const seller = await createOrg(app, owner.userId, { type: 'SELLER' });
    const buyer = await createOrg(app, owner.userId, { type: 'BUYER' });
    await addMember(app, seller.id, staff.userId, 'STAFF');

    await get('org-owner', owner, seller.id).expect(200);
    await get('org-owner', staff, seller.id).expect(403);
    await get('org', staff, seller.id).expect(200);
    await get('seller', owner, seller.id).expect(200);
    await get('seller', owner, buyer.id).expect(403);
  });

  it('lets operators in only where allowed, without a membership role', async () => {
    const owner = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId);

    await expectIsolated(get('org', operator, org.id));
    const res = await get('staff-ok', operator, org.id).expect(200);
    expect(res.body.role).toBeNull();
    await get('edit', operator, org.id).expect(200);
  });

  it('applies service policies (SPEC 9) on top of membership', async () => {
    const owner = await actor(app, sms);
    const manager = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    await addMember(app, org.id, manager.userId, 'MANAGER');
    await get('edit', owner, org.id).expect(200);
    await get('edit', manager, org.id).expect(403);
  });

  it('takes the organization from the path and rejects a mismatching X-Org-Id (D-14)', async () => {
    const a = await actor(app, sms);
    const orgA = await createOrg(app, a.userId);
    const orgA2 = await createOrg(app, a.userId, { type: 'BUYER' });
    await get(`orgs/${orgA.id}`, a).expect(200);
    await get(`orgs/${orgA.id}`, a, orgA.id).expect(200);
    const mismatch = await get(`orgs/${orgA.id}`, a, orgA2.id).expect(403);
    expect(mismatch.body.error.code).toBe('FORBIDDEN');
  });

  it('applies status gates of SPEC 8.1', async () => {
    const owner = await actor(app, sms);
    const verified = await createOrg(app, owner.userId, { status: 'VERIFIED' });
    const pending = await createOrg(app, owner.userId, { status: 'PENDING' });
    const suspended = await createOrg(app, owner.userId, { status: 'SUSPENDED' });
    await get('publish', owner, verified.id).expect(200);
    expect((await get('publish', owner, pending.id).expect(403)).body.error.code).toBe(
      'ORG_NOT_VERIFIED',
    );
    expect((await get('publish', owner, suspended.id).expect(403)).body.error.code).toBe(
      'ORG_SUSPENDED',
    );
  });

  it('still requires authentication first', async () => {
    await request(app.getHttpServer()).get('/api/v1/test-access/org').expect(401);
  });
});

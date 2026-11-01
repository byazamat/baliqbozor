import { describe, expect, it } from 'vitest';

import { orgProfileIssues } from './profile.js';

describe('orgProfileIssues', () => {
  it('requires a 9-digit TIN except for individuals', () => {
    expect(orgProfileIssues({ legalForm: 'LLC', tin: '123456789' })).toEqual([]);
    expect(orgProfileIssues({ legalForm: 'INDIVIDUAL', tin: null })).toEqual([]);
    expect(orgProfileIssues({ legalForm: 'INDIVIDUAL', tin: ' ' })).toEqual([]);
    expect(orgProfileIssues({ legalForm: 'DEHKAN_FARM', tin: undefined })).toEqual(['tin']);
    expect(orgProfileIssues({ legalForm: 'LLC', tin: '12345678' })).toEqual(['tin']);
    expect(orgProfileIssues({ legalForm: 'INDIVIDUAL', tin: '12345678a' })).toEqual(['tin']);
  });
});

import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors.js';
import { assertMediaUploadAllowed, uploadedObjectIssue } from './rules.js';

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as DomainError).code;
  }
};

describe('assertMediaUploadAllowed', () => {
  const base = {
    kind: 'IMAGE' as const,
    mimeType: 'image/jpeg',
    sizeBytes: 2_000_000,
    purpose: 'ORG_VERIFICATION' as const,
  };

  it('accepts images and PDFs within limits for verification', () => {
    expect(code(() => assertMediaUploadAllowed(base))).toBeNull();
    expect(code(() => assertMediaUploadAllowed({ ...base, mimeType: 'IMAGE/HEIC' }))).toBeNull();
    expect(
      code(() => assertMediaUploadAllowed({ ...base, kind: 'PDF', mimeType: 'application/pdf' })),
    ).toBeNull();
  });

  it('rejects kinds not allowed for the purpose and wrong MIME types', () => {
    expect(
      code(() => assertMediaUploadAllowed({ ...base, kind: 'VIDEO', mimeType: 'video/mp4' })),
    ).toBe('MEDIA_TYPE_NOT_ALLOWED');
    expect(code(() => assertMediaUploadAllowed({ ...base, kind: 'OTHER' }))).toBe(
      'MEDIA_TYPE_NOT_ALLOWED',
    );
    expect(code(() => assertMediaUploadAllowed({ ...base, mimeType: 'image/gif' }))).toBe(
      'MEDIA_TYPE_NOT_ALLOWED',
    );
    expect(
      code(() => assertMediaUploadAllowed({ ...base, kind: 'PDF', mimeType: 'image/png' })),
    ).toBe('MEDIA_TYPE_NOT_ALLOWED');
  });

  it('enforces size: positive integer up to 15 MB', () => {
    expect(
      code(() => assertMediaUploadAllowed({ ...base, sizeBytes: 15 * 1024 * 1024 })),
    ).toBeNull();
    expect(code(() => assertMediaUploadAllowed({ ...base, sizeBytes: 15 * 1024 * 1024 + 1 }))).toBe(
      'MEDIA_TOO_LARGE',
    );
    expect(code(() => assertMediaUploadAllowed({ ...base, sizeBytes: 0 }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(code(() => assertMediaUploadAllowed({ ...base, sizeBytes: 1.5 }))).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('uploadedObjectIssue', () => {
  it('checks presence and declared size', () => {
    expect(uploadedObjectIssue(10, { sizeBytes: 10 })).toBeNull();
    expect(uploadedObjectIssue(10, null)).toBe('NOT_UPLOADED');
    expect(uploadedObjectIssue(10, { sizeBytes: 11 })).toBe('SIZE_MISMATCH');
  });
});

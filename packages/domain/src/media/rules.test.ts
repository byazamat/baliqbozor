import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors.js';
import {
  assertMediaUploadAllowed,
  classifyDetectedMedia,
  isVideoDurationAllowed,
  PURPOSE_UPLOAD_ACTION,
  uploadedObjectIssue,
} from './rules.js';

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

describe('M2 purposes', () => {
  it('allows images for farms and images or video for listings', () => {
    const base = { mimeType: 'image/jpeg', sizeBytes: 1000 };
    expect(
      code(() => assertMediaUploadAllowed({ ...base, kind: 'IMAGE', purpose: 'FARM_PHOTO' })),
    ).toBeNull();
    expect(
      code(() =>
        assertMediaUploadAllowed({
          kind: 'VIDEO',
          mimeType: 'video/mp4',
          sizeBytes: 1000,
          purpose: 'FARM_PHOTO',
        }),
      ),
    ).toBe('MEDIA_TYPE_NOT_ALLOWED');
    expect(
      code(() =>
        assertMediaUploadAllowed({
          kind: 'VIDEO',
          mimeType: 'video/quicktime',
          sizeBytes: 60 * 1024 * 1024,
          purpose: 'LISTING_MEDIA',
        }),
      ),
    ).toBeNull();
    expect(PURPOSE_UPLOAD_ACTION.LISTING_MEDIA).toBe('LISTINGS_MANAGE');
  });
});

describe('classifyDetectedMedia', () => {
  it('accepts content that matches the declared kind', () => {
    expect(classifyDetectedMedia('IMAGE', 'image/png')).toEqual({
      ok: true,
      mimeType: 'image/png',
    });
    expect(classifyDetectedMedia('IMAGE', 'image/heif')).toEqual({
      ok: true,
      mimeType: 'image/heic',
    });
    expect(classifyDetectedMedia('VIDEO', 'video/quicktime')).toEqual({
      ok: true,
      mimeType: 'video/quicktime',
    });
  });

  it('rejects unknown or mismatching content', () => {
    expect(classifyDetectedMedia('IMAGE', undefined)).toEqual({
      ok: false,
      reason: 'UNKNOWN_TYPE',
    });
    expect(classifyDetectedMedia('IMAGE', 'application/x-msdownload')).toEqual({
      ok: false,
      reason: 'UNKNOWN_TYPE',
    });
    expect(classifyDetectedMedia('IMAGE', 'application/pdf')).toEqual({
      ok: false,
      reason: 'TYPE_MISMATCH',
    });
  });

  it('limits video duration to 60 s', () => {
    expect(isVideoDurationAllowed(60.4)).toBe(true);
    expect(isVideoDurationAllowed(61)).toBe(false);
  });
});

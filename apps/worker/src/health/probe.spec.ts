import { probe } from './probe.js';

describe('probe', () => {
  it('reports up', async () => {
    await expect(probe(() => Promise.resolve())).resolves.toMatchObject({ status: 'up' });
  });

  it('reports error message, error name or unknown', async () => {
    await expect(probe(() => Promise.reject(new Error('refused')))).resolves.toMatchObject({
      status: 'down',
      error: 'refused',
    });
    await expect(probe(() => Promise.reject(new TypeError('x')))).resolves.toMatchObject({
      error: 'TypeError',
    });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- проверяем не-Error причину
    await expect(probe(() => Promise.reject('x'))).resolves.toMatchObject({ error: 'unknown' });
  });

  it('times out', async () => {
    const never = () => new Promise<void>(() => undefined);
    await expect(probe(never, 10)).resolves.toMatchObject({ status: 'down', error: 'timeout' });
  });
});

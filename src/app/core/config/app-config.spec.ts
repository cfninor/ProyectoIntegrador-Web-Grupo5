import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  it('lee la configuración del ambiente desde /config.json', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiBaseUrl: 'https://bff.dev.solventa.example' }),
    });

    const config = await loadAppConfig(fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
    expect(config.apiBaseUrl).toBe('https://bff.dev.solventa.example');
  });

  it('falla de forma explícita si el archivo no está disponible', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(loadAppConfig(fetchFn as unknown as typeof fetch)).rejects.toThrow('HTTP 404');
  });
});

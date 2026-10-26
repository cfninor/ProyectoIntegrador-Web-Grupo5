import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { APP_CONFIG, CONFIG_CARGADA, loadAppConfig, provideAppConfig } from './app-config';

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

describe('provideAppConfig', () => {
  it('carga config.json al arrancar y CONFIG_CARGADA se resuelve cuando ya está', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiBaseUrl: 'https://bff.qa', cognito: { userPoolId: 'p' } }),
    }) as unknown as typeof fetch;
    try {
      TestBed.configureTestingModule({ providers: [provideAppConfig()] });
      await TestBed.inject(ApplicationInitStatus).donePromise;

      await expect(TestBed.inject(CONFIG_CARGADA)).resolves.toBeUndefined();
      expect(TestBed.inject(APP_CONFIG)).toMatchObject({
        apiBaseUrl: 'https://bff.qa',
        cognito: { userPoolId: 'p' },
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

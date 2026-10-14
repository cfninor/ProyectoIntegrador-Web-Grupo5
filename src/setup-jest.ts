import '@angular/localize/init';
import '@testing-library/jest-dom';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv();

// Las pruebas corren en el idioma fuente del portal, como la aplicación (D12); Angular usa en-US si
// no se provee LOCALE_ID. Las pruebas en inglés lo cambian con IDIOMA_INGLES de src/testing/ingles.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'es-CO' }] });
});

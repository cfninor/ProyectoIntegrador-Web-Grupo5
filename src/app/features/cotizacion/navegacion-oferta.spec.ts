import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { estadoNavegacion } from './navegacion-oferta';

describe('estadoNavegacion', () => {
  afterEach(() => history.replaceState(null, ''));

  it('sin navegación en curso, toma el estado que quedó en el historial', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    history.replaceState({ busqueda: { tipoDocumento: 'CC', numeroDocumento: '123456' } }, '');

    expect(estadoNavegacion(TestBed.inject(Router))).toEqual({
      busqueda: { tipoDocumento: 'CC', numeroDocumento: '123456' },
    });
  });

  it('sin estado en el historial, no hay nada que recuperar', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    expect(estadoNavegacion(TestBed.inject(Router))).toEqual({});
  });

  it('durante una navegación, toma el estado de esa navegación', async () => {
    let leido: unknown;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'destino',
            canActivate: [
              () => {
                leido = estadoNavegacion(TestBed.inject(Router));
                return true;
              },
            ],
            children: [],
          },
        ]),
      ],
    });

    await TestBed.inject(Router).navigateByUrl('/destino', {
      state: { recotizar: { datosBien: { plazoAnios: 15 } } },
    });

    expect(leido).toEqual({ recotizar: { datosBien: { plazoAnios: 15 } } });
  });
});

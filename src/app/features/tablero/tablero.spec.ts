import { render, screen } from '@testing-library/angular';

import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { Tablero } from './tablero';

function renderizar(config: AppConfig) {
  return render(Tablero, {
    providers: [{ provide: APP_CONFIG, useValue: config }, provideSesionSimulada()],
  });
}

describe('Tablero', () => {
  it('da la bienvenida con el nombre del usuario de la sesión', async () => {
    await renderizar({
      apiBaseUrl: '',
      sesionSimulada: { usuario: { id: 'a', nombre: 'Asesor de prueba' }, rol: 'ASESOR' },
    });

    expect(screen.getByText('Hola de nuevo, Asesor de prueba.')).toBeInTheDocument();
  });

  it('sin sesión no se rompe', async () => {
    // No pasa en la aplicación, porque rolGuard no deja entrar sin sesión al portal.
    await renderizar({ apiBaseUrl: '' });

    expect(screen.getByText('Hola de nuevo, .')).toBeInTheDocument();
  });
});

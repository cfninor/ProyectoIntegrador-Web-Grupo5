import { ServicioSesion } from '../app/core/sesion/sesion';

/**
 * `ServicioSesion` de prueba para las pantallas de ingreso y crear cuenta: sin sesión, sin cuenta
 * sin registrar ni por confirmar, y con Cognito (puede crear cuentas). Cada prueba ajusta lo que
 * necesita con los `jest.fn` que devuelve.
 */
export function sesionFalsa(): jest.Mocked<ServicioSesion> {
  return {
    actual: jest.fn(() => null),
    restaurar: jest.fn(async () => undefined),
    iniciar: jest.fn(),
    cerrar: jest.fn(async () => undefined),
    token: jest.fn(async () => null),
    cuentaSinRegistrar: jest.fn(() => null),
    correoPorConfirmar: jest.fn(() => null),
    puedeCrearCuenta: jest.fn(() => true),
    registrar: jest.fn(),
    confirmar: jest.fn(),
    reenviarCodigo: jest.fn(),
    completarRegistro: jest.fn(),
  };
}

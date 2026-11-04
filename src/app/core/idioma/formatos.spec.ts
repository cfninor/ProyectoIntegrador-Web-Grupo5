import { fechaBogota, fechaCalendario, horaBogota, montoCop, numeroConMiles } from './formatos';

// Fechas en UTC y lo que se ve en Bogotá (UTC−05:00).
describe('fechaBogota y horaBogota', () => {
  it.each([
    // 14:30 UTC = 09:30 en Bogotá.
    ['2026-10-09T14:30:00Z', '09/10/2026', '09:30', 'Oct 9, 2026', '9:30 AM'],
    // 17:00 UTC = mediodía en Bogotá.
    ['2026-10-09T17:00:00Z', '09/10/2026', '12:00', 'Oct 9, 2026', '12:00 PM'],
    // 03:15 UTC del 10 = 22:15 del 9 en Bogotá: cambia el día.
    ['2026-10-10T03:15:00Z', '09/10/2026', '22:15', 'Oct 9, 2026', '10:15 PM'],
    // 05:00 UTC = medianoche en Bogotá.
    ['2026-01-01T05:00:00Z', '01/01/2026', '00:00', 'Jan 1, 2026', '12:00 AM'],
    // Con zona en el texto ISO: la misma hora de Bogotá.
    ['2026-12-31T23:59:00-05:00', '31/12/2026', '23:59', 'Dec 31, 2026', '11:59 PM'],
  ])('%s → «%s %s» en español y «%s %s» en inglés', (iso, fechaEs, horaEs, fechaEn, horaEn) => {
    expect(fechaBogota(iso, 'es-CO')).toBe(fechaEs);
    expect(horaBogota(iso, 'es-CO')).toBe(horaEs);
    expect(fechaBogota(iso, 'en-US')).toBe(fechaEn);
    expect(horaBogota(iso, 'en-US')).toBe(horaEn);
  });
});

describe('montos en COP (D8)', () => {
  it.each([
    [148_500, '148.500', '148,500', '$ 148.500', '$148,500'],
    [280_000_000, '280.000.000', '280,000,000', '$ 280.000.000', '$280,000,000'],
    [1_200_000_000, '1.200.000.000', '1,200,000,000', '$ 1.200.000.000', '$1,200,000,000'],
    [999, '999', '999', '$ 999', '$999'],
    [0, '0', '0', '$ 0', '$0'],
  ])('%s → «%s» y «%s»; «%s» y «%s»', (valor, milesEs, milesEn, montoEs, montoEn) => {
    expect(numeroConMiles(valor, 'es-CO')).toBe(milesEs);
    expect(numeroConMiles(valor, 'en-US')).toBe(milesEn);
    expect(montoCop(valor, 'es-CO')).toBe(montoEs);
    expect(montoCop(valor, 'en-US')).toBe(montoEn);
  });
});

// Fechas de calendario sin hora, como la vigencia de la póliza (SOLVENTAG5-56).
describe('fechaCalendario', () => {
  it.each([
    ['2026-10-14', '14/10/2026', 'Oct 14, 2026'],
    ['2046-02-28', '28/02/2046', 'Feb 28, 2046'],
  ])('%s no cambia de día', (fecha, espanol, ingles) => {
    expect(fechaCalendario(fecha, 'es-CO')).toBe(espanol);
    expect(fechaCalendario(fecha, 'en-US')).toBe(ingles);
  });
});

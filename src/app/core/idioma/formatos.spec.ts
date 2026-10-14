import { fechaBogota, horaBogota } from './formatos';

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

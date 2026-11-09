/** La bandeja de suscripción asistida del analista de riesgo (SOLVENTAG5-52). */
export const RUTA_BANDEJA = '/riesgo/bandeja';

/**
 * El detalle de revisión de una solicitud (SOLVENTAG5-53): `${RUTA_REVISION}/{solicitudId}`.
 * Cuelga de la bandeja, desde donde se abre con «Revisar».
 */
export const RUTA_REVISION = `${RUTA_BANDEJA}/revision`;

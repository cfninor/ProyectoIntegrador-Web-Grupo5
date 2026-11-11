/**
 * Entrega al navegador el PDF de la póliza con el nombre `poliza-<polizaId>.pdf` y libera el blob
 * después (SOLVENTAG5-56, CA4). Lo usan la descarga de SOLV-WEB-10 y «Ver póliza» de SOLV-WEB-11
 * (SOLVENTAG5-58): el PDF llega por `HttpClient`, con el token de la sesión.
 */
export function entregarPdf(documento: Document, pdf: Blob, polizaId: string): void {
  const url = URL.createObjectURL(pdf);
  const enlace = documento.createElement('a');
  enlace.href = url;
  enlace.download = `poliza-${polizaId}.pdf`;
  enlace.click();
  // El navegador ya tomó el blob: se libera en el siguiente ciclo.
  setTimeout(() => URL.revokeObjectURL(url));
}

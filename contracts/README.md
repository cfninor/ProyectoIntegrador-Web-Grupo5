# Contrato del BFF web

`bff-web.openapi.yaml` es una **copia** del contrato que vive en el repositorio principal
(`contracts/bff-web/openapi.yaml`). El repositorio principal es la fuente de verdad: los
cambios se acuerdan allá primero (contrato primero, BA-04) y luego se actualiza esta copia
mediante un PR en este repositorio.

Con esta copia el portal puede:

- generar el cliente TypeScript de la API, y
- trabajar contra un mock del contrato mientras el backend se construye.

Versión de la copia: 1.5.0, tomada de la rama `feature/SOLVENTAG5-53-revisar-solicitud-asistida`
del repositorio principal (commit de la SOLVENTAG5-313), que agrega el detalle de revisión de una
solicitud para el analista de riesgo (SOLVENTAG5-53). Incluye: autorización de datos
(SOLVENTAG5-65), cotización (SOLVENTAG5-47), búsqueda de cliente (SOLVENTAG5-132), solicitudes de
suscripción (SOLVENTAG5-133) con su resultado (SOLVENTAG5-55), consulta del perfil de riesgo de una
solicitud (SOLVENTAG5-67), el inicio de sesión con el ID token de Cognito, sus roles por operación,
crear cuenta del cliente y la consulta de trazabilidad (SOLVENTAG5-207), la consulta de los
consentimientos del cliente (SOLVENTAG5-84), la aceptación de la nueva prima, la generación y
consulta de la póliza y la descarga de su PDF (SOLVENTAG5-56), la bandeja de suscripción asistida
(SOLVENTAG5-52), el cobro de la primera prima (SOLVENTAG5-74) y el detalle de revisión de una
solicitud (SOLVENTAG5-53). 21 operaciones.

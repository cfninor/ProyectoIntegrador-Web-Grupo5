# Contrato del BFF web

`bff-web.openapi.yaml` es una **copia** del contrato que vive en el repositorio principal
(`contracts/bff-web/openapi.yaml`). El repositorio principal es la fuente de verdad: los
cambios se acuerdan allá primero (contrato primero, BA-04) y luego se actualiza esta copia
mediante un PR en este repositorio.

Con esta copia el portal puede:

- generar el cliente TypeScript de la API, y
- trabajar contra un mock del contrato mientras el backend se construye.

Versión de la copia: 1.3.0, tomada del commit `83b5e3f` del repositorio principal, rama
`feature/SOLVENTAG5-56-poliza-para-firma`, que agrega la aceptación de la nueva prima de una
solicitud ajustada y la póliza para firma (SOLVENTAG5-56). Incluye: autorización de datos
(SOLVENTAG5-65), cotización (SOLVENTAG5-47), búsqueda de cliente (SOLVENTAG5-132), solicitudes de
suscripción (SOLVENTAG5-133) con su resultado (SOLVENTAG5-55), consulta del perfil de riesgo de una
solicitud (SOLVENTAG5-67), el inicio de sesión con el ID token de Cognito, sus roles por operación,
crear cuenta del cliente y la consulta de trazabilidad (SOLVENTAG5-207), la consulta de los
consentimientos del cliente (SOLVENTAG5-84), y la aceptación de la nueva prima, la generación y
consulta de la póliza y la descarga de su PDF (SOLVENTAG5-56). 18 operaciones.

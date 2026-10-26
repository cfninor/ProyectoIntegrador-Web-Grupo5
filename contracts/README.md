# Contrato del BFF web

`bff-web.openapi.yaml` es una **copia** del contrato que vive en el repositorio principal
(`contracts/bff-web/openapi.yaml`). El repositorio principal es la fuente de verdad: los
cambios se acuerdan allá primero (contrato primero, BA-04) y luego se actualiza esta copia
mediante un PR en este repositorio.

Con esta copia el portal puede:

- generar el cliente TypeScript de la API, y
- trabajar contra un mock del contrato mientras el backend se construye.

<<<<<<< Updated upstream
Versión de la copia: 1.0.0, tomada de la rama `feature/SOLVENTAG5-67-consultar-perfil-riesgo` del
repositorio principal, sobre el commit `1f83988` de `main`: autorización de datos
(SOLVENTAG5-65), cotización (SOLVENTAG5-47), búsqueda de cliente (SOLVENTAG5-132), solicitudes de
suscripción (SOLVENTAG5-133) y consulta del perfil de riesgo de una solicitud (SOLVENTAG5-67).
=======
Versión de la copia: 1.1.0, tomada del commit `4e944f6` del repositorio principal, rama
`feature/SOLVENTAG5-207-inicio-sesion`: autorización de datos (SOLVENTAG5-65), cotización
(SOLVENTAG5-47), búsqueda de cliente (SOLVENTAG5-132), solicitudes de suscripción (SOLVENTAG5-133)
y el inicio de sesión con el ID token de Cognito, sus roles por operación, crear cuenta del
cliente y la consulta de trazabilidad (SOLVENTAG5-207). 12 operaciones.
>>>>>>> Stashed changes

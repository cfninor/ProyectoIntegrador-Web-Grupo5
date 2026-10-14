# Contrato del BFF web

`bff-web.openapi.yaml` es una **copia** del contrato que vive en el repositorio principal
(`contracts/bff-web/openapi.yaml`). El repositorio principal es la fuente de verdad: los
cambios se acuerdan allá primero (contrato primero, BA-04) y luego se actualiza esta copia
mediante un PR en este repositorio.

Con esta copia el portal puede:

- generar el cliente TypeScript de la API, y
- trabajar contra un mock del contrato mientras el backend se construye.

Versión de la copia: 1.0.0, tomada del commit `66639b5` del repositorio principal, rama
`feature/SOLVENTAG5-132-cotizacion-en-linea`: autorización de datos (SOLVENTAG5-65), cotización
(SOLVENTAG5-47) y búsqueda de cliente (SOLVENTAG5-132).

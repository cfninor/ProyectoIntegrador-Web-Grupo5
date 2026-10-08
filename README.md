# Solventa · Portal web

Cliente web de Solventa (MISW4501, Grupo 5). Según el caso, la web es la experiencia completa
de gestión: venta asistida, administración de pólizas, back-office de socios y tableros, para
asesores, operaciones, socios y clientes en escritorio.

Consume únicamente el **BFF web** (conector C1) del repositorio principal del proyecto.

## Stack

| Elemento | Herramienta |
|---|---|
| Framework | Angular 22 + TypeScript (componentes standalone, sin zone.js) |
| Pruebas unitarias y de componentes | Jest + Angular Testing Library |
| Pruebas E2E | Playwright |
| Internacionalización | Angular i18n (`@angular/localize`), idioma fuente `es-CO` |
| Calidad | ESLint (angular-eslint) + Prettier |

## Requisitos

- Node.js 24 LTS (ver `.nvmrc`; Angular 22 exige ≥ 22.22.3 o ≥ 24.15.0).

## Comandos

```bash
npm ci                  # instala exactamente las versiones de package-lock.json
npm start               # servidor local en http://localhost:4200
npm run lint            # ESLint
npm run format:check    # Prettier
npm test                # Jest
npm run test:ci         # Jest con cobertura (coverage/)
npm run build           # build de producción (dist/solventa-web/browser)
npx playwright install chromium   # una sola vez
npm run e2e             # Playwright (levanta npm start si no se define BASE_URL)
npm run extract-i18n    # extrae los textos a src/locale/messages.xlf
```

## Estructura

```
src/app/
├── core/        # servicios transversales de una sola instancia (configuración, cliente de la API, interceptores)
├── shared/      # componentes, pipes y directivas reutilizables
└── features/    # una carpeta por funcionalidad, con sus rutas cargadas de forma diferida
e2e/             # pruebas Playwright
contracts/       # copia del contrato OpenAPI del BFF web
public/          # archivos estáticos, incluido config.json
```

`shared/` y `features/` se crean con la primera historia que los necesite (por ejemplo
`features/consentimiento` para SOLVENTAG5-65 y `features/cotizacion` para SOLVENTAG5-132).

## Configuración por ambiente

La URL del BFF se lee en tiempo de ejecución desde `public/config.json`
(`src/app/core/config/app-config.ts`). Así el mismo build se promueve de DEV a QA y PROD:
el despliegue solo reemplaza `config.json`. Localmente apunta a `http://localhost:8010`, el
puerto del `bff-web` en el `docker-compose.yml` del repositorio principal.

## Internacionalización

Ningún texto visible queda fijo en un componente sin marcar: se usa el atributo `i18n` en las
plantillas y `$localize` en el código, con un id explícito (`i18n="@@modulo.clave"`). El idioma
fuente es `es-CO`; los idiomas adicionales se agregan en `angular.json` (`i18n.locales`) cuando
el equipo los defina.

## Integración continua

[`ci.yml`](.github/workflows/ci.yml) corre en cada PR y en cada push a `main`: lint y formato,
Jest con cobertura, build de producción y E2E con Playwright. `ci-gate` es el check
obligatorio de `main`.

## Cómo trabajamos

- `main` protegida: todo entra por PR con 1 aprobación y `ci-gate` en verde.
- Ramas cortas desde `main`: `feature/SOLVENTAG5-132-formulario-cotizacion`.
- Commits y título del PR con la clave de Jira: `feat(cotizacion): formulario de solicitud SOLVENTAG5-132`.
- Merge por squash. Release por sprint con tags `v0.1.0`, `v0.2.0` y `v1.0.0`.

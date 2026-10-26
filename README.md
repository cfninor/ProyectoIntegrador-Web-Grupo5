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
npm run extract-i18n    # extrae los textos a src/locale/messages.json
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
el despliegue solo reemplaza `config.json` con el de cada ambiente (ver «Despliegue»). Localmente
apunta a `http://localhost:8010`, el puerto del `bff-web` en el `docker-compose.yml` del
repositorio principal.

## Internacionalización

Ningún texto visible queda fijo en un componente sin marcar: se usa el atributo `i18n` en las
plantillas y `$localize` en el código, con un id explícito (`i18n="@@modulo.clave"`).

El portal está en español (`es-CO`, idioma fuente) y en inglés (`en-US`) con un solo build:

- `npm run extract-i18n` genera `src/locale/messages.json` con los textos en español.
- La traducción al inglés está en `public/i18n/en-US.json`, con los mismos ids. Una prueba de
  Jest falla si a un id le falta su traducción o si sus marcadores no coinciden.
- `src/main.ts` elige el idioma antes de iniciar la aplicación: la preferencia guardada en
  `localStorage` (`solventa.idioma`) o, si no hay, inglés con el navegador en inglés y español en
  cualquier otro caso. Para el inglés carga la traducción con `loadTranslations`, y luego provee
  `LOCALE_ID` y pone `<html lang>`.
- El selector ES / EN de la barra superior guarda la preferencia y recarga la página.

## Integración continua

[`ci.yml`](.github/workflows/ci.yml) corre en cada PR y en cada push a `main`: lint y formato,
Jest con cobertura, build de producción y E2E con Playwright. `ci-gate` es el check
obligatorio de `main`.

Solo en push a `main`, después de `ci-gate`:

| Job | Qué hace |
|---|---|
| Guardar el build del portal | Compila el portal una sola vez por commit y lo guarda en el bucket de artefactos, en `web/commits/<commit>/` |
| Publicar en DEV | Llama a [«Publicar portal»](.github/workflows/publicar-portal.yml) con `dev` y ese build |

## Despliegue

El portal es un sitio estático: cada ambiente (DEV, QA y PROD) lo sirve desde su bucket privado
detrás de CloudFront, con `/v1/*` hacia el BFF web del mismo ambiente. La infraestructura y los
ambientes se describen en `infra/terraform/README.md` del repositorio principal.

### Cómo se despliega

1. Cada merge a `main` compila el portal **una sola vez** y guarda el build, sin `config.json`, en
   `web/commits/<commit>/` del bucket de artefactos. Si el build de ese commit ya existe, no se
   compila de nuevo.
2. «Publicar portal» lo publica en DEV sin compilar nada: copia los archivos al bucket del
   ambiente (los que tienen hash con caché de un año; `index.html`, `config.json`, `i18n/*` y el
   resto, sin caché), escribe el `config.json` del ambiente, borra lo que ya no está en el build e
   invalida `/index.html`, `/config.json` e `/i18n/*` en CloudFront.
3. Registra lo publicado en `/solventa/<ambiente>/web/version` de SSM (commit, carpeta de origen,
   fecha y prueba de humo) y corre la prueba de humo: `index.html` y `config.json` con 200 por el
   dominio del portal. Si falla, el workflow falla.

El job declara el ambiente de GitHub, así el panel de ambientes del repositorio registra cada
publicación, y el resumen del workflow muestra el origen, el commit, la prueba de humo y la URL.

### De dónde sale cada ambiente

| Ambiente | Build que publica | Cómo llega |
|---|---|---|
| DEV | `web/commits/<commit>/` del último merge a `main` | Solo, con la CI |
| QA | El mismo build que está en DEV (o el de otro commit de `main`) | «Promover a QA» |
| PROD | El mismo build que está en QA, copiado a `web/releases/v<versión>/` | «Promover a PROD» |

QA y PROD no compilan: publican el build que ya pasó por el ambiente anterior. Lo único que cambia
entre ambientes es `config.json`. Un arreglo es otro PR a `main`, que vuelve a pasar por DEV, QA y
PROD: no hay ramas de release ni cherry-picks.

### Cómo promover

Los dos workflows se corren a mano desde `main` (Actions → el workflow → Run workflow). Se promueve
primero el repositorio principal y después el portal, porque el portal depende de la API.

**Promover a QA** ([`promover-qa.yml`](.github/workflows/promover-qa.yml)):

1. Sin `commit`, toma el de `/solventa/dev/web/version`, es decir, el que está en DEV. Con
   `commit` (completo o abreviado), toma ese, que tiene que ser de `main`.
2. Comprueba que su build exista en `web/commits/<commit>/` y llama a «Publicar portal» con `qa`,
   que publica, registra `/solventa/qa/web/version` y corre la prueba de humo.

Los builds de `web/commits/` se borran a los 60 días, y ECR solo conserva las 30 imágenes `sha-*`
más recientes del repositorio principal: conviene promover a QA antes de acumular 30 merges en
`main`.

**Promover a PROD** ([`promover-prod.yml`](.github/workflows/promover-prod.yml)), sin parámetros:

1. Falla si quien lo corre no está en `APROBADORES_PROD`.
2. Toma exactamente el commit de `/solventa/qa/web/version` y falla si su prueba de humo no está en
   `ok`.
3. Lee la versión de `package.json` en ese commit y falla si el tag `v<versión>` ya existe.
4. Copia el build a `web/releases/v<versión>/` (si ya está ahí con el mismo commit, no lo copia; con
   otro, falla) y llama a «Publicar portal» con `prod`.
5. Con la prueba de humo en verde, crea el tag `v<versión>` sobre ese commit y el GitHub Release con
   las notas generadas.

Si una ejecución falla a mitad de camino, se puede volver a correr.

### Quién aprueba PROD

La aprobación es correr «Promover a PROD»: solo lo pueden hacer las personas de la variable del
repositorio `APROBADORES_PROD` (usuarios de GitHub separados por coma), y solo publica lo que está
en QA con su prueba de humo en verde. La misma regla vale para «Publicar portal» en PROD.

### Cómo subir la versión

La versión sale de `version` en `package.json` (hoy `0.1.0`) y sube con un PR a `main`, por
ejemplo con `npm version 0.2.0 --no-git-tag-version`, que cambia `package.json` y
`package-lock.json` sin crear el tag:

- al cerrar el sprint, en los dos repositorios (`0.2.0`, `1.0.0`);
- al arreglar algo que ya está en PROD, solo en el repositorio que cambia (`0.1.1`).

Si se promueve a PROD sin subirla, «Promover a PROD» falla porque el tag ya existe.

### Revertir

«Publicar portal» también se corre a mano (Actions → Publicar portal → Run workflow), desde
`main`, con el ambiente y una carpeta que ya exista en el bucket de artefactos. En PROD solo acepta
una carpeta `web/releases/v<versión>/`, por ejemplo la de la versión anterior, y solo la pueden
correr las personas de `APROBADORES_PROD`. No compila nada ni cambia los tags; el arreglo llega
después con una versión nueva (`0.1.1`) por el camino de siempre.

### Configuración en GitHub

Cada ambiente de GitHub (`dev`, `qa` y `prod`, limitados a `main`) tiene dos variables:

| Variable | Contenido |
|---|---|
| `AWS_ROLE_ARN` | ARN del rol `solventa-<ambiente>-github-web` (salida `roles_github` de Terraform, clave `web`). El workflow lo asume por OIDC: no hay llaves de AWS en GitHub |
| `WEB_CONFIG` | El `config.json` del ambiente, en una línea |

`WEB_CONFIG` es un objeto JSON con `apiBaseUrl`, obligatorio y vacío, porque el BFF web está en
el mismo dominio (`/v1/*`). No lleva `sesionSimulada`: en DEV, QA y PROD se ingresa con Cognito
(SOLVENTAG5-207), y la sesión simulada solo existe en el `public/config.json` local. En los tres
ambientes queda así:

```json
{"apiBaseUrl":""}
```

«Publicar portal» lee los ids de Cognito del ambiente en SSM
(`/solventa/<ambiente>/cognito/user-pool-id` y `/solventa/<ambiente>/cognito/cliente-portal-id`, que
crea Terraform) y escribe el `config.json` con `WEB_CONFIG` más el objeto `cognito`:

```json
{"apiBaseUrl":"","cognito":{"region":"us-east-1","userPoolId":"<id>","clienteId":"<id>"}}
```

Si `WEB_CONFIG` todavía trae `sesionSimulada`, la descarta con un aviso. Falla antes de tocar AWS
si `WEB_CONFIG` falta o no tiene esa forma, y antes de publicar si faltan los parámetros de SSM.

Además, el repositorio tiene la variable `APROBADORES_PROD` (ver «Quién aprueba PROD»).

## Cómo trabajamos

- `main` protegida: todo entra por PR con 1 aprobación y `ci-gate` en verde.
- Ramas cortas desde `main`: `feature/SOLVENTAG5-132-formulario-cotizacion`.
- Commits y título del PR con la clave de Jira: `feat(cotizacion): formulario de solicitud SOLVENTAG5-132`.
- Merge por squash. Release por sprint con tags `v0.1.0`, `v0.2.0` y `v1.0.0`, que crea «Promover
  a PROD» (ver «Despliegue»).

# Levantar frontend, BFF y Usuarios desde los repositorios

Guía de la entrega de identidad del 26 de noviembre de 2026. No requiere copiar
la documentación ni las herramientas privadas del equipo donde se desarrolló.
Las funciones financieras y el asistente real todavía no se integran.

## Clones y herramientas

Los tres clones deben estar juntos y conservar estos nombres, porque el Compose
referencia sus directorios hermanos:

```text
workspace/
  billetera-ms-usuarios/
  billetera-bff-graphql/
  billetera-frontend/
```

Los otros tres microservicios pueden estar presentes, pero no son necesarios para
este flujo. Se necesita Docker con contenedores Linux, Go 1.27.4 para los comandos
Go y Node >=22.12 para comprobaciones JavaScript. Los ejemplos están escritos para
PowerShell. En este equipo el contexto Docker es desktop-linux: comprobarlo con
docker context ls y sustituir ese nombre si el equipo usa otro contexto.

Los scripts de Usuarios usan Go en PATH o el Go portable de ../.tools si existe.
Ese directorio portable no se versiona ni es obligatorio. Protoc y plugins solo
se necesitan al modificar el contrato; los stubs Go generados sí están en el repo.

## Preparar la base y la configuración

Desde billetera-ms-usuarios, si todavía no existe .env:

```powershell
Copy-Item .env.example .env
```

Editar el archivo local con estos valores. Reemplazar el marcador de contraseña
por un valor propio, no conservar la contraseña de ejemplo:

```dotenv
GRPC_PORT=50051
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=55431
POSTGRES_DB=billetera_usuarios
POSTGRES_USER=app_usuarios
POSTGRES_PASSWORD=<contraseña propia>
POSTGRES_SSLMODE=disable
KAFKA_BROKERS=kafka:9092
SESSION_TTL=24h
SESSION_IDLE_TIMEOUT=30m
```

Las rutas TLS de .env.example también pueden conservarse. Compose las sustituye
por sus rutas dentro de los contenedores. Kafka figura como configuración, pero
no se levanta ni se utiliza todavía: solo se guarda la outbox.

Si el volumen ya existe, conservar la configuración correspondiente. Cambiar
POSTGRES_PASSWORD en .env no cambia automáticamente la contraseña del rol ya
creado en PostgreSQL. No borrar volúmenes para corregir esa diferencia.

```powershell
docker --context desktop-linux compose -f compose.dev.yaml up -d --wait postgres
./scripts/dev.ps1 -Action migrate
```

Las dos migraciones crean las tablas y su historial. Repetir migrate verifica
checksum y no vuelve a aplicar una versión exitosa. Antes de apuntar a otra base
existente, inspeccionarla; los comandos no deben ejecutarse contra bases ajenas.

## Certificados y arranque

Solo si .local-certs no existe:

```powershell
./scripts/dev.ps1 -Action certs
```

El generador crea una CA local y certificados de servidor, BFF y salud; las hojas
duran siete días. No sobrescribe archivos existentes y no conserva la clave de la
CA. Para renovar, conservar el directorio anterior fuera de Git y generar un
nuevo conjunto, coordinando el reemplazo entre servidor y clientes. Los
certificados y .env se crean en cada equipo; no se incluyen en commits.

```powershell
docker --context desktop-linux compose -f compose.dev.yaml up -d --build --wait
docker --context desktop-linux compose -f compose.dev.yaml ps
```

Abrir **http://127.0.0.1:8080**. La interfaz permite crear una cuenta propia; no
hay credenciales precargadas. Los cuatro servicios deben estar healthy:

| Servicio | Acceso |
| --- | --- |
| frontend | 127.0.0.1:8080; sirve la SPA y enruta /graphql. |
| bff | HTTP 3000 solo dentro de Docker. |
| ms-usuarios | gRPC TLS mutuo en 127.0.0.1:50051 y red interna. |
| postgres | 127.0.0.1:55431 y puerto 5432 dentro de Docker. |

El navegador conserva una cookie HttpOnly/SameSite=Lax. La excepción sin Secure es
solo para HTTP local. BFF_PUBLIC_ORIGIN debe coincidir exactamente con el origen
del navegador; aquí PUBLIC_ORIGIN usa por defecto http://127.0.0.1:8080. Si se cambia
FRONTEND_PORT o se usa localhost en vez de 127.0.0.1, configurar PUBLIC_ORIGIN
con el mismo origen y recrear el BFF. No aplicar la excepción HTTP a otros hosts.

Para detener y conservar datos:

```powershell
docker --context desktop-linux compose -f compose.dev.yaml stop
```

## Pruebas propias y conjuntas

Desde Usuarios, crear una vez la base de test con el rol real de .env:

```powershell
docker --context desktop-linux compose -f compose.dev.yaml exec -T postgres createdb -U app_usuarios billetera_usuarios_test
./scripts/dev.ps1 -Action test-docker
./scripts/dev.ps1 -Action grpc-check-docker
```

Si billetera_usuarios_test ya existe, omitir createdb. Go usa esquemas temporales
y no limpia tablas de desarrollo. grpc-check-docker comprueba salud y validaciones
sin crear cuentas. En Windows de este equipo hubo una diferencia en el certificado
recibido por clientes gRPC directos; las pruebas dentro de Linux Docker pasaron
con validación TLS completa. No se desactiva la verificación de certificados.

Desde el BFF, con el entorno conjunto levantado:

```powershell
npm ci
npm run typecheck
npm run build
npm test
node scripts/integration/test-identity.mjs
```

La última prueba solo requiere Node y acceso local a Docker para su limpieza.
Comprueba registro, login, perfil, preferencias, precisión, aislamiento, conflictos,
CSRF y logout. Crea cuentas temporales propias y elimina únicamente sus IDs. El
helper obtiene rol/base del .env de Usuarios sin imprimir credenciales.

Para la prueba de navegador, instalar las dependencias del frontend con npm ci.
En Windows se usa Edge instalado; en otros sistemas, instalar Chromium con
npx playwright install chromium desde el frontend. Se puede elegir otro canal
instalado mediante IDENTITY_BROWSER_CHANNEL.

Desde BFF:

```powershell
node scripts/integration/test-identity-browser.mjs
```

La prueba busca Playwright en las dependencias del frontend. El fallback
../.tools/playwright-core/package solo corresponde a la instalación portable usada
durante el desarrollo. Se comprueban formularios, persistencia al recargar, cookie,
escritorio/móvil y revocación. Sus capturas se guardan en workspace/test-artifacts.

## Contratos y continuación

Usuarios es dueño del .proto de proto/billetera/usuarios/v1/usuarios.proto. El BFF
incluye una copia idéntica para construir independientemente. Cambiar ambos al
versionarlo y regenerar Go. El esquema GraphQL actual vive en src/auth.schema.ts.

Consentimiento IA, publicación Kafka de outbox, lectores internos de otros
servicios y módulos financieros siguen pendientes. Las funciones futuras están
separadas en las guías de entrega de cada repositorio. Consultar también el
[aviso de dependencia del BFF](DEPENDENCIAS.md).

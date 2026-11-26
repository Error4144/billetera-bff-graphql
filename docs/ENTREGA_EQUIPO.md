# Entrega al equipo: BFF

Estado del 26 de noviembre de 2026. Se convirtió el verificador de configuración
en un servidor NestJS/Apollo con GraphQL en /graphql, conectado a Usuarios por
gRPC con TLS mutuo. [Integración local](INTEGRACION_LOCAL.md) contiene el arranque
desde clones nuevos y las pruebas conjuntas.

## Operaciones disponibles

| GraphQL | Destino y efecto |
| --- | --- |
| registerUser(email, password, displayName) | RegisterUser: registra sin iniciar sesión. |
| login(email, password) | Login y lecturas propias: guarda cookie y devuelve perfil/preferencias. |
| viewer | Valida sesión y consulta perfil propio; devuelve null si no hay sesión vigente. |
| userPreferences | Valida sesión y consulta preferencias propias; devuelve null sin sesión vigente. |
| updateUserProfile(displayName, expectedVersion) | Modifica nombre; conserva correo. |
| updateUserPreferences(...) | Reemplaza el bloque mínimo de preferencias con versión esperada. |
| logout | Revoca en Usuarios y elimina la cookie. |

Esquema exacto y resolvers: [auth.schema.ts](../src/auth.schema.ts). Los argumentos
expectedVersion y microExpenseMaximumAmount son String con enteros decimales
positivos. Nunca convertir esos campos a Number para enviarlos a gRPC.

## Cómo se implementó

- [main.ts](../src/main.ts): levanta HTTP, valida origen/cabecera/JSON y ofrece /healthz.
- [app.module.ts](../src/app.module.ts): registra el módulo GraphQL y sus resolvers.
- [users.gateway.ts](../src/users.gateway.ts): carga Protobuf, configura certificados,
  llama a Usuarios con deadline y traduce errores sin exponer detalles internos.
- [settings.ts](../src/settings.ts): valida direcciones, origen, cookie y rutas TLS.
- [Contrato copiado](../proto/billetera/usuarios/v1/usuarios.proto): debe coincidir con
  el contrato fuente de Usuarios; se incluye en la imagen para construir de forma independiente.
- [tests/auth.test.cjs](../tests/auth.test.cjs): comprueba cookie, revocación, precisión y configuración.
- [scripts/integration](../scripts/integration): pruebas HTTP y de navegador que abarcan los tres repositorios.

La sesión viaja al navegador en cookie HttpOnly/SameSite=Lax. En HTTPS usa Secure
y prefijo __Host-. La excepción sin Secure solo se permite en HTTP local de
127.0.0.1/localhost. El token no se devuelve como campo GraphQL ni se guarda en el frontend.
El BFF valida la sesión en Usuarios, propaga el token en metadatos y no acepta un
usuarioId del navegador para elegir propietario.

Se requiere POST application/json, Origin igual a BFF_PUBLIC_ORIGIN y cabecera
x-billetera-request: 1. Las mutaciones por GET y orígenes ajenos se rechazan. El
certificado del BFF y su clave se montan fuera de la imagen; su URI autoriza el
acceso gRPC. /healthz indica proceso HTTP activo; no representa salud de todos los servicios.

## Comprobaciones realizadas

TypeScript y build pasaron. Las cuatro pruebas del BFF pasaron, al igual que las
pruebas conjuntas de registro, credenciales incorrectas, cookies HttpOnly, cambios
persistidos, aislamiento de dos cuentas, conflictos, cantidades superiores a
Number seguro, CSRF y revocación efectiva. Se probó la interfaz en Edge, escritorio
y móvil. Las cuentas temporales se limpiaron al finalizar. GitHub Actions no se
ha ejecutado ni verificado desde esta sesión.

## Pendientes

- Integrar Transacciones, Notificaciones y Agente con sus contratos. Configurar sus
  direcciones no significa que sus operaciones ya se hayan implementado.
- Agregar consentimiento IA al conectar el asistente; hoy no existe esa mutación.
- Coordinar nuevas versiones del .proto con Usuarios y consumidores.
- Resolver el [aviso de dependencia](DEPENDENCIAS.md) con un conjunto compatible
  de Apollo/GraphQL Tools y repetir sus verificaciones.
- Recuperación/cambio de contraseña, verificación de correo y eliminación de cuenta
  quedan como posibles entregas futuras, fuera del alcance actual.

## Para quien continúe

Mantener los tokens fuera del esquema, conservar la precisión int64 y no inferir
la identidad a partir de argumentos. Añadir operaciones financieras enviándolas al
servicio propietario por gRPC. El BFF no consulta bases ajenas ni calcula saldos.

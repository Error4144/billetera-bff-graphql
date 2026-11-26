# BFF GraphQL de Billetera Virtual

- [Qué se entregó, cómo y qué falta](docs/ENTREGA_EQUIPO.md).
- [Arranque desde los tres clones y pruebas conjuntas](docs/INTEGRACION_LOCAL.md).

El [aviso de dependencia detectado](docs/DEPENDENCIAS.md) queda registrado para mantenimiento.

NestJS con Apollo expone /graphql. La integración actual conecta identidad y
preferencias al servicio Usuarios por gRPC con TLS mutuo. Transacciones,
Notificaciones y Agente todavía no están integrados.

## Operaciones

- registerUser(email, password, displayName): crea cuenta sin iniciar sesión.
- login(email, password): establece cookie HttpOnly y devuelve perfil/preferencias.
- viewer y userPreferences: consultan la sesión propia; devuelven null si no hay
  sesión vigente. No reciben un usuarioId elegido por el navegador.
- updateUserProfile y updateUserPreferences: exigen sesión y versión esperada.
- logout: revoca la sesión en Usuarios y elimina la cookie.

Las versiones y cantidades CLP viajan como cadenas decimales exactas. Los tokens
no forman parte del esquema GraphQL. El BFF valida el origen y exige POST JSON y
cabecera x-billetera-request: 1; los clientes del mismo origen llevan cookies.
No se aceptan mutaciones por GET ni CORS con credenciales para orígenes ajenos.

En HTTPS se usa __Host-billetera_session con Secure. SESSION_COOKIE_SECURE=false
solo se permite junto con un BFF_PUBLIC_ORIGIN HTTP de localhost o 127.0.0.1, para
el entorno local. Nunca configurar esa excepción para un host público.

## Arranque y contrato

El entorno compartido está en ../billetera-ms-usuarios/compose.dev.yaml. Allí se
configuran certificados del BFF, origen público y dirección de Usuarios. El único
punto HTTP público de desarrollo es Nginx en http://127.0.0.1:8080.

proto/billetera/usuarios/v1/usuarios.proto es copia del contrato de Usuarios.
Sincronizar ambos al versionarlo. No se copian claves al código ni a la imagen.
El cliente gRPC se cierra al detener la aplicación.

```powershell
npm ci
npm run typecheck
npm run build
npm test
node --env-file=.env.example dist/main.js --check-config
```

--check-config valida variables sin abrir conexiones. El arranque normal carga
certificados y levanta GraphQL. /healthz indica que el proceso HTTP está activo;
la salud de PostgreSQL se comprueba en Usuarios.

El modo de integración del frontend ya consume estas operaciones. El consentimiento
de IA queda pendiente antes de conectar el asistente; los demás flujos de cuenta
fuera del alcance universitario acordado están documentados como futuros.

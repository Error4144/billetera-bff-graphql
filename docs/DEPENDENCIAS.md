# Aviso de dependencia pendiente

Durante la construcción del 26 de noviembre de 2026, npm audit --omit=dev reportó
un aviso alto para la copia raíz de @graphql-tools/utils 12.0.1:
[GHSA-c4qx-w738-7hr3](https://github.com/advisories/GHSA-c4qx-w738-7hr3).

El aviso corresponde a mergeIncrementalResult con segmentos de ruta no primitivos
en respuestas incrementales de otro servidor GraphQL. La corrección publicada es
12.0.2. La versión fijada de @apollo/server exige un rango que excluye esa versión;
el intento de npm audit fix --package-lock-only, sin force ni scripts, no resolvió
el aviso y no cambió el lockfile. No se forzó un override incompatible.

El código propio del BFF no usa ese helper ni consume respuestas incrementales
de otro servidor GraphQL: consulta Usuarios por gRPC. Esa observación limita la
aplicabilidad al flujo implementado, pero no elimina el aviso del árbol instalado.

Pendiente: actualizar Apollo y sus dependencias con un conjunto compatible que
incluya la corrección, y repetir build, pruebas y auditoría. Esto es mantenimiento
de dependencias, separado de las funcionalidades de identidad ya verificadas.

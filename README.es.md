# Steam Review Lab

[English](README.md) · [Русский](README.ru.md) · **Español**

Una herramienta local para explorar reseñas públicas de Steam de **cualquier juego**. Introduce un App ID, elige un período y un límite de descarga, y analiza las fechas de publicación, el tiempo de juego, la actividad de los autores y los textos repetidos.

Desarrollada con **Vite+, React, TypeScript, Mantine, Recharts y un pequeño servidor Express**. La interfaz está disponible en ruso, inglés y español. El idioma se guarda en el navegador y cambiarlo no reinicia el análisis.

No requiere registro, una base de datos externa ni una clave API de Steam. No se publica nada ni se envían datos a un servicio de análisis en la nube.

## Inicio rápido

Necesitas npm y **Node.js compatible con `^22.18.0 || ^24.11.0 || >=26.0.0`**. Se recomienda Node.js 24 LTS.

```sh
npm ci
npm run dev
```

Abre **http://127.0.0.1:5173** y mantén la terminal abierta. Para detener el servidor, pulsa `Ctrl+C`.

Para ejecutar la versión de producción en tu equipo:

```sh
npm run build
npm start
```

El servidor Node es necesario en ambos modos porque gestiona la API de descarga. No abras `index.html` directamente ni publiques únicamente `dist/` en un alojamiento estático.

## Uso

1. Introduce un **App ID numérico** o un enlace como `https://store.steampowered.com/app/440/`.
2. Elige un máximo de **1000, 10 000 o 50 000 reseñas**, o una cantidad personalizada entre 1 y 50 000. El límite se aplica al total combinado de reseñas positivas y negativas.
3. Selecciona todo el período o un intervalo de fechas. La última fecha del calendario se incluye completa. Los límites temporales se calculan en **UTC**.
4. Opcionalmente, pulsa **«Consultar cantidad disponible»**. Se solicita una página de una sola reseña para obtener el número de coincidencias antes de la descarga principal.
5. Pulsa **«Descargar reseñas»**. Puedes pausar y reanudar más tarde, incluso después de reiniciar la aplicación.
6. Analiza reseñas positivas, negativas o todas. El idioma de las reseñas y el período del análisis son independientes del idioma de la interfaz.

Se descargan primero las reseñas coincidentes **más recientes**. Si hay más resultados que el límite elegido, obtienes un subconjunto reciente limitado: no es una muestra aleatoria ni el historial completo. La interfaz indica expresamente los conjuntos parciales.

## Herramientas de análisis

| Vista                | Funciones                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resumen              | Cantidad de reseñas y autores, medianas de tiempo de juego y longitud, histogramas, nubes de palabras y pares de palabras.                       |
| Publicaciones        | Intervalos de días, horas, 15 minutos, 5 minutos o minutos; filtros de fecha y hora exactas; navegación de un día a sus horas y minutos.         |
| Ráfagas              | Hasta diez ventanas móviles densas sin superposición, incluidas las series que cruzan los límites de una hora.                                   |
| Coincidencias        | Grupos de textos normalizados idénticos; búsqueda, longitud mínima, orden por frecuencia, longitud o proximidad temporal; detalle de cada grupo. |
| Actividad de autores | Cantidad de autores únicos con exactamente 1, 2, 3, etc. reseñas públicas; acceso a sus reseñas.                                                 |
| Reseñas              | Búsqueda, orden, paginación, enlaces públicos opcionales y exportación JSON de la selección.                                                     |

Al pulsar una barra o una palabra se filtra el explorador de reseñas. Seleccionar un intervalo de publicación modifica todo el análisis. **«Todo el período»** restablece el filtro temporal.

### Definiciones

- El tiempo al publicar es `author.playtime_at_review`, en minutos. Se distingue del tiempo total actual.
- La actividad del autor es `author.num_reviews` en el momento de la descarga, incluida su reseña de este juego. No representa la antigüedad de la cuenta ni su actividad histórica en la fecha de publicación.
- Los valores ausentes se excluyen de las medianas; nunca se convierten en ceros.
- Las palabras son secuencias de letras, con posibles guiones o apóstrofos internos, después de retirar BBCode y enlaces. El recuento es aproximado para idiomas sin espacios.
- La nube cuenta reseñas que contienen un término, no sus repeticiones dentro de un texto. Se eliminan palabras vacías en ruso, inglés y español; no se aplica lematización.
- Las coincidencias ignoran BBCode, enlaces, puntuación, mayúsculas y la distinción rusa «ё/е». Se conservan los números. No se detectan similitud semántica ni paráfrasis.
- Los intervalos usan `[inicio, fin)`: incluyen el inicio y excluyen el fin. El calendario convierte la última fecha seleccionada en la medianoche del día siguiente.

## Límites de descarga y comportamiento de Steam

Las reseñas proceden del endpoint oficial [GetAppReviews](https://partner.steamgames.com/doc/webapi/IUserReviewsService#GetAppReviews), con paginación por cursor y páginas de hasta 100 registros.

**50 000 es el límite de esta aplicación, no una cuota garantizada de Steam.** Esa cantidad requiere unas 500 solicitudes correctas y, posiblemente, solicitudes adicionales para comprobar el final, reintentar o tratar páginas superpuestas. Con la pausa predeterminada de 1,5 segundos, calcula al menos unos 12,5 minutos, más la latencia y las restricciones de Steam. La aplicación no presupone un número oficial fijo de solicitudes anónimas por minuto.

El descargador:

- Ordena por fecha de creación (`filter: 1`) para que el recorrido por cursor pueda terminar.
- Incluye todos los idiomas, ambas valoraciones, todos los tipos de adquisición y las reseñas fuera de tema.
- Comparte una cola entre consultas previas y descargas; solo ejecuta una descarga principal a la vez.
- Respeta `Retry-After` y aplica espera exponencial ante HTTP 429, errores del servidor y tiempos de espera agotados, con hasta seis intentos por página.
- Guarda cada página y su cursor localmente, eliminando duplicados por ID de reseña.
- Se detiene al alcanzar el límite, encontrar una página vacía, recibir una pausa o producirse un error; las sesiones pausadas o con error se pueden reanudar.
- Detecta cursores que no avanzan para evitar bucles infinitos.

Steam puede almacenar en caché las respuestas anónimas hasta diez minutos. Una clave de editor asociada al juego puede recibir un límite mayor, pero no garantiza una descarga ininterrumpida. Los metadatos son opcionales: si no se puede obtener el nombre, se muestra `App <id>`.

## Almacenamiento y privacidad

Cada sesión se guarda en tu equipo:

```text
.data/<session-id>/
  state.json       # parámetros, cursor y estado de la descarga
  reviews.jsonl    # registros públicos originales, uno por línea
```

`.data/`, `.env`, `node_modules/`, `dist/` y `.vite-plus/` están excluidos de Git. El repositorio no contiene reseñas descargadas, identificadores reales de cuentas, credenciales ni un informe de un juego concreto. Los datos de prueba son sintéticos.

El servidor escucha en `127.0.0.1`. No utiliza analítica, almacenamiento alojado ni fuentes remotas. Las solicitudes a Steam salen de tu equipo. No expongas este servidor a Internet: es una herramienta local sin sistema de autenticación, no un servicio multiusuario.

Los enlaces públicos a autores están ocultos por defecto. La exportación JSON elimina los Steam ID y los ID de reseñas de forma predeterminada, sustituyendo los autores por alias locales al archivo. **Eliminar identificadores no equivale a anonimizar por completo**: el texto y las fechas pueden revelar información personal. La caché original conserva los registros públicos completos.

Usa la papelera para eliminar una sesión. Para borrar todas las descargas, detén el servidor y elimina `.data/`.

## Configuración

Copia `.env.example` a `.env` si necesitas cambiar los valores:

```dotenv
PORT=5173
STEAM_REQUEST_DELAY_MS=1500
# DATA_DIR=.data
# STEAM_WEB_API_KEY=
```

| Variable                 | Valor predeterminado | Función                                                                                            |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------- |
| `PORT`                   | `5173`               | Puerto HTTP local.                                                                                 |
| `STEAM_REQUEST_DELAY_MS` | `1500`               | Pausa entre solicitudes; mínimo de 500 ms.                                                         |
| `DATA_DIR`               | `.data`              | Directorio de caché relativo a la raíz. Si lo cambias, excluye también el nuevo directorio de Git. |
| `STEAM_WEB_API_KEY`      | Sin definir          | Clave opcional del servidor. No uses el prefijo `VITE_` ni la incluyas en el código del navegador. |

No ejecutes varios servidores sobre el mismo `DATA_DIR`.

## Desarrollo y herramientas

```sh
npm run dev          # Express y núcleo Vite+ en un proceso
npm run check        # Oxfmt, Oxlint y comprobación de tipos
npm run lint         # Linter; las advertencias hacen fallar la comprobación
npm run lint:fix     # Correcciones automáticas del linter
npm run format       # Aplicar formato con Oxfmt
npm run format:check # Comprobar formato sin modificar archivos
npm run typecheck    # Comprobar tipos con Vite+
npm test             # Vitest; sin solicitudes de red a Steam
npm run build        # Comprobaciones y compilación de producción
npm start            # Servir la compilación local de producción
```

Vite+ tiene una versión fijada y el servidor usa el alias correspondiente de `@voidzero-dev/vite-plus-core`. Se eliminó Prettier como herramienta independiente. La configuración está en `vite.config.ts`:

- Oxlint: corrección, TypeScript, React y hooks, accesibilidad, importaciones, variables sin usar, `no-debugger`, `no-var`, `prefer-const`, igualdad estricta, claves de React y dependencias de hooks.
- Tipos: `typeAware` y `typeCheck` están activados.
- Oxfmt: dos espacios, comillas simples, punto y coma, comas finales, ancho de 100 caracteres y finales de línea LF.
- Vitest: entorno Node y archivos `tests/**/*.test.ts`.

No necesitas instalar `vp` globalmente. Ejecuta **`npm run dev`** o `npx vp run dev` para iniciar la aplicación completa; `vp dev` por sí solo no arranca la API Express. No se instalan hooks de Git ni cambios globales del entorno.

Las pruebas cubren fechas, cursores, datos ausentes, paginación, pausa y reanudación, recuperación tras reinicio, colas de caché dañadas, reintentos, ráfagas, coincidencias, eliminación de identificadores y traducciones. La descarga de 50 000 registros se comprueba con 500 páginas simuladas, sin consultar Steam.

### Estructura

```text
src/App.tsx                    # formulario, historial y progreso
src/components/Dashboard.tsx   # vistas de análisis
src/components/Histogram.tsx   # gráfico compartido
src/lib/analysis.ts            # funciones puras de análisis
src/i18n.tsx                   # contexto de idioma y calendario
server/index.ts               # API HTTP y servidor local
server/steam.ts                # solicitudes, cola y reintentos
server/jobs.ts                 # ciclo de vida de las descargas
server/storage.ts              # JSONL y recuperación
shared/                        # tipos, validación y traducciones
tests/                         # datos sintéticos y pruebas
```

API local: `POST /api/preview`, `GET/POST /api/jobs`, `GET/DELETE /api/jobs/:id`, `GET /api/jobs/:id/reviews`, `POST /api/jobs/:id/pause` y `POST /api/jobs/:id/resume`. Parámetros: `{ "appid": 440, "limit": 1000, "start": null, "end": null }`; las fechas se indican en segundos Unix UTC y `end` es exclusivo.

## Localización

El idioma de la interfaz es independiente del filtro de idioma de las reseñas. Los textos originales y los nombres de los juegos no se traducen automáticamente. Los números, fechas, calendarios, etiquetas de accesibilidad, estados y errores conocidos siguen el idioma elegido; los límites de tiempo permanecen en UTC.

En la primera visita se utilizan los idiomas preferidos del navegador; si ninguno es compatible, se elige inglés. Una selección guardada tiene prioridad. Las traducciones están en `shared/messages.ts`, las funciones puras en `shared/i18n.ts` y el contexto React en `src/i18n.tsx`. Los mensajes externos desconocidos se muestran sin cambios. Los nombres de campos de JSON permanecen estables para su uso programático.

## Interpretación y limitaciones

La herramienta permite explorar hipótesis, pero no demuestra manipulación. Una única reseña, un texto corto, una frase repetida o una ráfaga pueden deberse al lanzamiento, a retransmisiones, promociones, memes, citas o la duración del juego.

Solo se obtienen las versiones actuales de reseñas públicas accesibles. No se pueden reconstruir registros eliminados ni versiones anteriores. Una descarga larga no es una instantánea histórica inmutable: los textos y los totales pueden cambiar mientras se descargan.

GetAppReviews no proporciona fechas de registro, privacidad del perfil ni cantidad de juegos comprados. La aplicación no recopila silenciosamente todos los perfiles ni clasifica cuentas como «limpias».

El análisis se realiza en la memoria del navegador: hasta 50 000 reseñas, textos paginados y gráficos temporales con hasta 2000 barras. No hay comparación semántica entre todos los pares. No se ha utilizado una descarga real de 50 000 reseñas como prueba de lanzamiento; los textos grandes pueden tardar más en equipos modestos.

## Solución de problemas

- **HTTP 429:** espera al reintento automático o pausa y reanuda más tarde.
- **Falta el nombre del juego:** los metadatos pueden no estar disponibles; la descarga por App ID puede seguir funcionando.
- **No hay reseñas:** comprueba el App ID y las fechas UTC; las demos y los DLC pueden tener identificadores propios.
- **Puerto ocupado:** cambia `PORT` en `.env` y reinicia.
- **El navegador no conecta:** mantén el servidor activo y usa la dirección indicada en la terminal.
- **Sesión pausada tras reiniciar:** ábrela y reanúdala; las páginas guardadas permanecen en el disco.

## Agradecimiento

Desarrollado con ayuda de [OpenAI Codex](https://openai.com/codex/) para la implementación, la documentación y las comprobaciones automáticas.

## Licencia

El código se distribuye bajo la [licencia MIT](LICENSE). El contenido descargado sigue sujeto a los derechos de sus autores y a las condiciones aplicables de Steam. Este proyecto es independiente de Valve y Steam.

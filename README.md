# La Carrera más Linda de Boyacá 2026

Aplicación web para consultar los resultados oficiales y descargar el diploma de cada deportista.

## Demo

Sitio publicado en Netlify: **https://lacarreramaslindadeboyaca.netlify.app**

Repositorio: https://github.com/vijumolo/LaCarreraMasLindadeBoyac-

## Funcionalidad

- **397 resultados** leídos del PDF oficial de clasificación.
- Filtros por categoría y género.
- Búsqueda por nombre, dorsal o municipio, sin distinguir tildes ni mayúsculas.
- Ordenamiento por posición, dorsal, nombre, tiempo, velocidad o ritmo.
- Ficha individual con posiciones y diploma oficial.
- Descarga del diploma en PNG.
- Diseño responsive con paleta musgo, nogal, amarillos y grises.
- Funciona sin servidor: los PDF se procesan en el navegador con PDF.js.

## Desarrollo local

No requiere instalación ni compilación. Abre `index.html` en Chrome, Edge o Firefox, o ejecuta `abrir-app.cmd` en Windows.

## Estructura

| Archivo / carpeta | Contenido |
| --- | --- |
| `index.html` | Página principal |
| `css/styles.css` | Estilos responsive |
| `js/app.js` | Lectura de PDF, filtros, ficha y descarga |
| `data/athletes.js` | Datos oficiales verificados (respaldo) |
| `data/final.b64.js` | PDF de resultados incrustado |
| `data/diplomas.b64.js` | PDF de diplomas incrustado (carga diferida) |
| `vendor/` | PDF.js |
| `assets/` | Logos y favicon |
| `DIPLOMAS.pdf` | Documento oficial de diplomas |
| `FINAL X CATEGORIAS Y GENERO.pdf` | Documento oficial de resultados |

## Despliegue en Netlify

El proyecto es estático y no necesita build:

- **Build command:** vacío
- **Publish directory:** `.`

La configuración está en `netlify.toml`.

## Notas

- El diploma se localiza por dorsal/chip: el orden de las páginas de `DIPLOMAS.pdf` coincide con el listado de chips.
- El deportista descalificado (DSQ) aparece sin posiciones válidas, tal como en el documento oficial.
- Si el navegador no puede procesar el PDF de resultados, la app usa automáticamente los datos verificados de `data/athletes.js`.

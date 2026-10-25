# La Carrera más Linda de Boyacá 2026

Aplicación web para consultar los resultados oficiales y el diploma de cada deportista.

## Cómo abrirla

1. Haz doble clic en **`abrir-app.cmd`**.
2. O abre **`index.html`** con tu navegador (Chrome, Edge o Firefox).

Funciona **sin internet** y sin instalar nada: los PDF oficiales están incluidos dentro de la carpeta y se leen directamente en el navegador.

También está publicada en:
**https://lacarreramaslindadeboyaca.netlify.app**

## Qué puedes hacer

- Ver los **397 resultados** del PDF oficial de clasificación.
- Filtrar por **categoría** (21K, 10K, 5K, 1K) y **género** (Damas / Hombres).
- Buscar por **nombre, dorsal o municipio** (sin importar tildes ni mayúsculas).
- Ordenar por posición, dorsal, nombre, tiempo, velocidad o ritmo.
- Abrir la ficha de cada deportista y ver su **diploma oficial**.
- **Descargar el diploma en PNG** desde la ficha del deportista.

## Estructura

| Archivo / carpeta | Contenido |
| --- | --- |
| `index.html` | Página principal |
| `DIPLOMAS.pdf` | PDF oficial de diplomas |
| `FINAL X CATEGORIAS Y GENERO.pdf` | PDF oficial de resultados |
| `css/styles.css` | Diseño responsive (musgo, nogal, amarillos y grises) |
| `js/app.js` | Lectura de PDF, filtros, búsqueda, ficha y descarga |
| `data/athletes.js` | Datos oficiales verificados (respaldo si falla la lectura del PDF) |
| `data/final.b64.js` | PDF de resultados incrustado |
| `data/diplomas.b64.js` | PDF de diplomas incrustado (se carga al abrir una ficha) |
| `vendor/` | PDF.js |
| `assets/` | Logos y favicon |

## Notas

- Los resultados se leen en tiempo real de **`FINAL X CATEGORIAS Y GENERO.pdf`**. Si el navegador no puede procesarlo, la app usa automáticamente los datos verificados de `data/athletes.js`.
- El diploma se localiza por **dorsal/chip**: el orden de las páginas de `DIPLOMAS.pdf` coincide con el listado de chips.
- El deportista descalificado (**DSQ**) aparece sin posiciones válidas, tal como en el documento oficial.
- El enlace “PDF de resultados” del pie de página abre el documento original.

## Actualizar datos

Si el evento publica nuevos PDF, reemplaza los archivos `DIPLOMAS.pdf` y `FINAL X CATEGORIAS Y GENERO.pdf` de esta carpeta y actualiza los documentos incrustados de `data/` (`final.b64.js` y `diplomas.b64.js`) junto con `data/athletes.js` / `data/athletes.json`. Mientras no se reemplacen, la app sigue mostrando la edición 2026.

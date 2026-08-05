# MEKORA v1.1.0

Actualización de integración jugable sobre la base modular oficial de MEKORA.

## Contenido de esta versión

La v1.1.0 conecta el contenido externo con el runtime jugable y evita que armas, módulos o catálogos queden registrados únicamente como tarjetas visuales.

### Mechas jugables

Los seis mechas disponen de estadísticas y rasgos propios:

- `AXIOM`: unidad equilibrada con regeneración lenta fuera de peligro.
- `ORIGINS`: restaura escudo y activa una sobrecarga breve cada veinte bajas.
- `LANCER`: mayor movilidad, cadencia y daño mientras se desplaza.
- `BASTION`: blindaje reforzado, reducción de daño y onda de contraataque.
- `WEAVER`: bonificación para drones, torretas, minas y unidades de apoyo.
- `WRAITH`: ignora periódicamente un impacto y recibe una aceleración temporal.

Los perfiles viven en `src/data/mecha-profiles.js` y su integración se encuentra en `src/modules/gameplay-profile-module.js`.

### Mapas con reglas propias

- `DESGUACE PRIME`: más chatarra y menor frecuencia de peligros.
- `CORREDOR MAGNÉTICO`: enemigos a distancia más activos y recarga más rápida.
- `FUNDICIÓN NOCTURNA`: menor visibilidad, mayor presión, enemigos reforzados y daño explosivo aumentado.

Los modificadores se encuentran en `src/data/map-modifiers.js`.

### Arsenal y sinergias

- 30 armas y poderes activos.
- 18 módulos pasivos.
- 30 sinergias.
- Pulso Electromagnético y Sobrecarga de Reactor regresan al draft como poderes utilizables.
- La auditoría compara los datos modulares contra el runtime real de combate.

### Cosméticos

Las skins y efectos ya pueden equiparse desde la Tienda después de obtenerlos. La selección queda guardada en la progresión local.

### Auditoría de contenido

Developer incorpora una pestaña `AUDITORÍA` que comprueba:

- colecciones obligatorias;
- IDs duplicados;
- armas y módulos faltantes;
- requisitos rotos de sinergias;
- perfiles de mecha y modificadores de mapa;
- referencias de misiones y jefes;
- coincidencia entre datos modulares y runtime heredado;
- campos obligatorios de contenido.

También puede ejecutarse desde la consola:

```js
window.mekora.content.audit();
```

## Estructura principal

```text
src/core/       Runtime, eventos, Store, servicios y módulos
src/modules/    Sistemas modulares de juego y herramientas
src/data/       Catálogos externos y perfiles jugables
src/ui/         Paneles de arquitectura y auditoría
src/styles/     Estilos separados y responsivos
src/legacy/     Compatibilidad temporal con el juego existente
```

## Desarrollo local

Requiere Node.js 22.12 o posterior. Vite se instala dentro del proyecto, no como programa separado.

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run verify
```

Comprueba archivos obligatorios, sintaxis JavaScript, imports, referencias del HTML, CSS y módulos.

## Build de producción

```bash
npm run build
```

Vite generará `dist/` usando rutas relativas compatibles con GitHub Pages.

## GitHub Pages

1. Extrae el ZIP.
2. Sube el contenido de la carpeta a la raíz del repositorio.
3. Mantén `.github/workflows/deploy.yml`.
4. Selecciona `GitHub Actions` en `Settings → Pages`.
5. Haz commit o push a `main`.

El workflow usa `npm install`, por lo que no requiere `package-lock.json` para publicar esta versión.

## Estado de migración

La arquitectura modular, datos, perfiles, cosméticos y auditoría ya están separados. El combate, renderizado, enemigos y algunas pantallas todavía conservan una capa heredada para no perder funcionalidad durante la migración. Los nuevos sistemas deben agregarse fuera de `src/legacy/legacy-game.js` siempre que sea posible.

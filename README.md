# MEKORA v1.0.0

Reinicio de versión y primera base oficial del proyecto modular de MEKORA.

## Qué cambió

La versión anterior estaba concentrada en un solo HTML. Esta versión separa el proyecto en:

- `src/core/`: runtime, Event Bus, Store, servicios, módulos y máquina de estados.
- `src/modules/`: persistencia, progresión, configuración de run, entrada, UI, Developer, workflow y puente de compatibilidad.
- `src/data/`: registros y esquemas reutilizables para mechas, armas, habilidades, enemigos, mapas y tienda.
- `src/ui/`: componentes de interfaz nuevos.
- `src/styles/`: tokens visuales, estilos base, estilos heredados y estilos responsivos.
- `src/legacy/`: capa temporal que conserva el juego funcional mientras sus sistemas se migran gradualmente.
- `.github/workflows/`: publicación automática en GitHub Pages.

El juego conserva la compatibilidad con los sistemas de la versión 3.4.2 mediante `legacy-bridge-module.js`. Esta capa evita perder funciones mientras cada sistema se extrae del bloque heredado.

## Requisitos para desarrollo local

- Node.js 22.12 o superior.
- npm incluido con Node.js.

No se descarga Vite manualmente. Se instala dentro del proyecto con:

```bash
npm install
```

## Ejecutar MEKORA localmente

```bash
npm install
npm run dev
```

Abre la dirección que muestre la terminal, normalmente `http://localhost:5173/`.

## Verificar todos los archivos

```bash
npm run verify
```

La verificación comprueba archivos obligatorios, sintaxis JavaScript, imports, referencias del HTML, estructura CSS y cantidad mínima de módulos.

## Construir la versión final

```bash
npm run build
```

Vite generará la carpeta `dist/`. La configuración usa rutas relativas, así que el mismo build funciona en repositorios normales de GitHub Pages sin conocer previamente el nombre del repositorio.

## Publicar en GitHub Pages

1. Extrae el ZIP.
2. Sube el contenido de esta carpeta a la raíz del repositorio.
3. En GitHub, abre `Settings` → `Pages`.
4. En `Source`, selecciona `GitHub Actions`.
5. Haz un push a la rama `main`.
6. Revisa la pestaña `Actions` hasta que `Publicar MEKORA` termine con marca verde.

El workflow instala las dependencias, verifica el proyecto, ejecuta el build y publica `dist/`.

## API modular para pruebas

En la consola del navegador:

```js
window.mekora.snapshot();
window.mekora.modules.info();
window.mekora.workflow.listSchemas();
window.mekora.workflow.createEntry('weapon');
window.mekora.command('open:architecture');
```

## Migración futura

`src/legacy/legacy-game.js` sigue conteniendo la lógica heredada de combate y varias pantallas. No debe crecer con sistemas nuevos. Las nuevas funciones deben agregarse en módulos independientes y conectarse mediante eventos o servicios. La ruta de migración recomendada es:

1. datos de armas, poderes, mechas y enemigos;
2. UI de Garaje, Arsenal, Misiones y Tienda;
3. Run Manager, mapas, sectores y dificultad;
4. combate, proyectiles y enemigos;
5. render, cámara, niebla, partículas y audio.

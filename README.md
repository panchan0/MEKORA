# MEKORA v1.4.2

Roguelike 2D modular para navegador, preparado para Vite y GitHub Pages.

## Ejecutar en desarrollo

```bash
npm install
npm run dev
```

## Construir

```bash
npm run verify
npm run build
```

## Publicar

El proyecto incluye `.github/workflows/deploy.yml`. En GitHub, configura Pages con `GitHub Actions` como fuente.

## Revisión visual

La carpeta `docs/` contiene:

- changelog visual en PDF y DOCX;
- catálogo de implementación en PDF y DOCX;
- galería general;
- capturas PNG de cada cambio principal.

## Arquitectura

El runtime v1.4.2 registra 20 módulos. La lógica nueva se mantiene fuera del archivo heredado siempre que es posible. El puente legacy conserva compatibilidad mientras continúa la migración.

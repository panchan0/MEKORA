# Historial de cambios

## v1.1.0

### Jugabilidad

- Añadidos perfiles funcionales para AXIOM, ORIGINS, LANCER, BASTION, WEAVER y WRAITH.
- Añadidos modificadores jugables para los tres mapas disponibles.
- Integrada la visibilidad de mapa con la niebla procedural.
- Integrada la frecuencia de peligros con el modificador del mapa.
- Integradas modificaciones de vida, velocidad, daño y cadencia de enemigos.
- Integrada la bonificación de chatarra por mapa.
- Reactivados Pulso Electromagnético y Sobrecarga de Reactor como poderes del draft.

### Cosméticos

- Las skins compradas pueden equiparse o retirarse.
- Los efectos comprados pueden equiparse o retirarse.
- La selección se guarda dentro de la progresión local.
- Añadidos efectos visuales para impactos, estelas y destrucciones.

### Arquitectura

- Añadidos `contentService`, `contentAudit`, `gameplayProfile` y `cosmetics`.
- El runtime contiene 13 módulos activos.
- Añadidos registros externos para misiones, jefes, perfiles y modificadores.
- Añadido puente de eventos entre el runtime heredado y los módulos modernos.

### Developer

- Añadida pestaña de auditoría jugable.
- La auditoría cruza 116 enlaces de contenido entre la capa modular y la capa jugable.
- Se verifican referencias de misiones, jefes, mapas, mechas, sinergias y cosméticos.

### Publicación

- Workflow de GitHub Pages configurado con Node 22, `npm install`, verificación y build de Vite.
- Metadatos y textos visibles actualizados a v1.1.0.

export function createArchitecturePanel(runtime) {
  let root = document.getElementById('mekora-architecture-panel');
  if (root) return root;

  root = document.createElement('section');
  root.id = 'mekora-architecture-panel';
  root.className = 'modular-panel hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="modular-panel__card">
      <header class="modular-panel__header">
        <div>
          <span class="modular-panel__eyebrow">MEKORA RUNTIME</span>
          <h2>Arquitectura modular v${runtime.version}</h2>
          <p>Inspección del runtime, servicios y módulos activos.</p>
        </div>
        <button type="button" class="modular-panel__close" aria-label="Cerrar">×</button>
      </header>
      <div class="modular-panel__summary" data-summary></div>
      <div class="modular-panel__modules" data-modules></div>
      <footer class="modular-panel__footer">
        <code>window.mekora</code>
        <span>API pública para pruebas y workflow.</span>
      </footer>
    </div>`;

  root.addEventListener('click', (event) => {
    if (event.target === root) root.classList.add('hidden');
  });
  root.querySelector('.modular-panel__close')?.addEventListener('click', () => root.classList.add('hidden'));
  document.body.appendChild(root);
  return root;
}

export function renderArchitecturePanel(runtime) {
  const root = createArchitecturePanel(runtime);
  const state = runtime.store.getState();
  const cosmetics = runtime.services.get('cosmetics')?.getEquipped?.() || {};
  const profile = runtime.services.get('gameplayProfile')?.getActiveProfile?.();
  const audit = runtime.store.getState().contentAudit;
  const summary = [
    ['Estado', state.appState],
    ['Plataforma', `${state.platform} · ${state.inputDevice}`],
    ['Núcleos', state.cores],
    ['Run', `${state.selectedDifficulty} · ${state.selectedMap}`],
    ['Mecha', profile?.name || state.activeMecha || 'AXIOM'],
    ['Cosméticos', `${cosmetics.skin || 'sin skin'} · ${cosmetics.effect || 'sin efecto'}`],
    ['Contenido', audit?.ok ? 'AUDITADO' : 'REVISAR']
  ];

  const summaryNode = root.querySelector('[data-summary]');
  if (summaryNode) {
    summaryNode.innerHTML = summary.map(([label, value]) => `
      <article class="modular-stat">
        <span>${label}</span>
        <strong>${value}</strong>
      </article>`).join('');
  }

  const modulesNode = root.querySelector('[data-modules]');
  if (modulesNode) {
    modulesNode.innerHTML = runtime.modules.info().map((module) => `
      <article class="modular-module modular-module--${module.status}">
        <header><strong>${module.name}</strong><span>${module.status}</span></header>
        <p>${module.error ? `Error: ${module.error}` : 'Módulo cargado dentro del runtime modular.'}</p>
      </article>`).join('');
  }
  return root;
}

export function openArchitecturePanel(runtime) {
  const root = renderArchitecturePanel(runtime);
  root.classList.remove('hidden');
}

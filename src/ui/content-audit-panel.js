export function createContentAuditPanel() {
  let root = document.getElementById('mekora-content-audit-panel');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'mekora-content-audit-panel';
  root.className = 'modular-panel hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="modular-panel__card content-audit-card">
      <header class="modular-panel__header">
        <div>
          <span class="modular-panel__eyebrow">CONTROL DE CONTENIDO</span>
          <h2>Auditoría jugable</h2>
          <p>Comprueba que armas, módulos, sinergias, mechas, enemigos, misiones, jefes y cosméticos estén registrados.</p>
        </div>
        <button type="button" class="modular-panel__close" aria-label="Cerrar">×</button>
      </header>
      <div class="content-audit-status" data-audit-status></div>
      <div class="modular-panel__summary" data-audit-totals></div>
      <div class="content-audit-issues" data-audit-issues></div>
      <footer class="modular-panel__footer">
        <code>window.mekora.content.audit()</code>
        <span>Ejecuta esta misma comprobación desde la consola.</span>
      </footer>
    </div>`;
  root.addEventListener('click', (event) => {
    if (event.target === root) root.classList.add('hidden');
  });
  root.querySelector('.modular-panel__close')?.addEventListener('click', () => root.classList.add('hidden'));
  document.body.appendChild(root);
  return root;
}

export function renderContentAuditPanel(runtime) {
  const root = createContentAuditPanel();
  const report = runtime.store.getState().contentAudit || runtime.services.get('contentAudit')?.initialReport;
  const status = root.querySelector('[data-audit-status]');
  if (status) {
    status.className = `content-audit-status ${report?.ok ? 'content-audit-status--ok' : 'content-audit-status--error'}`;
    status.innerHTML = `<strong>${report?.ok ? 'CONTENIDO CONECTADO' : 'SE DETECTARON HUECOS'}</strong><span>${report?.ok ? 'Todos los registros obligatorios superaron la auditoría.' : `${report?.issues?.length || 0} problemas requieren revisión.`}</span>`;
  }
  const totals = root.querySelector('[data-audit-totals]');
  if (totals && report?.totals) {
    totals.innerHTML = Object.entries(report.totals).map(([label, value]) => `
      <article class="modular-stat"><span>${label}</span><strong>${value}</strong></article>`).join('');
  }
  const issues = root.querySelector('[data-audit-issues]');
  if (issues) {
    issues.innerHTML = report?.issues?.length
      ? report.issues.map((issue) => `<div class="content-audit-issue">${issue}</div>`).join('')
      : '<div class="content-audit-empty">No hay IDs duplicados, referencias rotas ni colecciones obligatorias ausentes.</div>';
  }
  return root;
}

export function openContentAuditPanel(runtime) {
  runtime.services.get('contentAudit')?.run?.();
  const root = renderContentAuditPanel(runtime);
  root.classList.remove('hidden');
}

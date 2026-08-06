const RELEASE = '1.4.2';

const ICON_RETRY = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M37 16a16 16 0 1 0 2.4 13"/><path d="M37 7v11H26"/></svg>`;
const ICON_HOME = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 23 24 8l17 15"/><path d="M12 21v19h24V21"/><path d="M20 40V28h8v12"/></svg>`;

function updateReleaseBadge() {
  const badge = document.getElementById('v130-release-badge');
  if (badge && badge.textContent !== `BUILD ${RELEASE}`) badge.textContent = `BUILD ${RELEASE}`;
  document.body.dataset.releaseV142 = RELEASE;
  document.documentElement.style.setProperty('--mk-release', `'${RELEASE}'`);
}

function cleanMenu() {
  const panel = document.querySelector('.menu-panel-v333');
  if (!panel) return;
  panel.dataset.v142Clean = 'true';
  panel.querySelector('h1')?.setAttribute('aria-hidden', 'true');
  panel.querySelector('.menu-subtitle-v333')?.setAttribute('aria-hidden', 'true');
  panel.querySelector('.v130-build-chip')?.setAttribute('aria-hidden', 'true');
  const stage = document.getElementById('menu-stage-v333');
  stage?.setAttribute('aria-label', 'Mecha activo');
}

function decorateGameover() {
  const panel = document.querySelector('.gameover-panel');
  if (!panel) return;
  const readyRetry = document.getElementById('btn-gameover-retry');
  const readyMenu = document.getElementById('btn-gameover-menu');
  if (panel.dataset.v142Ready === 'true') {
    if (readyRetry && !readyRetry.querySelector('svg')) { readyRetry.textContent = ''; readyRetry.innerHTML = ICON_RETRY; readyRetry.setAttribute('aria-label', 'Reintentar expedición'); }
    if (readyMenu && !readyMenu.querySelector('svg')) { readyMenu.textContent = ''; readyMenu.innerHTML = ICON_HOME; readyMenu.setAttribute('aria-label', 'Volver al menú'); }
    return;
  }
  const failed = document.getElementById('gameover-failed-label');
  const title = document.getElementById('gameover-title');
  const stats = panel.querySelector('.gameover-stats-grid');
  const actions = panel.querySelector('.gameover-actions');
  const retry = document.getElementById('btn-gameover-retry');
  const menu = document.getElementById('btn-gameover-menu');
  if (!failed || !title || !stats || !actions || !retry || !menu) return;

  panel.dataset.v142Ready = 'true';
  panel.classList.add('v142-gameover-panel');
  failed.textContent = 'UNIDAD FUERA DE COMBATE';
  title.textContent = 'MISIÓN FALLIDA';

  const header = document.createElement('header');
  header.className = 'v142-gameover-header';
  const signal = document.createElement('div');
  signal.className = 'v142-gameover-signal';
  signal.innerHTML = `<i></i><i></i><i></i><span>CONEXIÓN PERDIDA</span>`;
  const copy = document.createElement('div');
  copy.className = 'v142-gameover-copy';
  copy.append(failed, title);
  const note = document.createElement('p');
  note.textContent = 'La unidad quedó inoperativa. Conserva lo aprendido y vuelve a desplegarte.';
  copy.appendChild(note);
  header.append(signal, copy);

  stats.classList.add('v142-gameover-summary');
  actions.classList.add('v142-gameover-actions');
  retry.textContent = '';
  retry.innerHTML = ICON_RETRY;
  retry.setAttribute('aria-label', 'Reintentar expedición');
  retry.title = 'Reintentar';
  menu.textContent = '';
  menu.innerHTML = ICON_HOME;
  menu.setAttribute('aria-label', 'Volver al menú');
  menu.title = 'Menú';

  const footer = document.createElement('footer');
  footer.className = 'v142-gameover-footer';
  const hint = document.createElement('span');
  hint.textContent = 'REVISIÓN DE RUN';
  footer.append(hint, actions);

  panel.replaceChildren(header, stats, footer);
}

function decorateMainSettings() {
  const layout = document.querySelector('.settings-layout-v333');
  const panel = layout?.querySelector('.hud-border');
  if (!layout || !panel || layout.dataset.v142Ready === 'true') return;
  layout.dataset.v142Ready = 'true';
  const intro = document.createElement('aside');
  intro.className = 'v142-settings-identity';
  intro.innerHTML = `
    <div class="v142-settings-mark"><i></i><i></i><i></i></div>
    <span>SISTEMAS DE UNIDAD</span>
    <h2>CONFIGURACIÓN</h2>
    <p>Audio, idioma y respuesta de la interfaz comparten el mismo perfil dentro y fuera de una expedición.</p>`;
  layout.insertBefore(intro, panel);
  document.getElementById('settings-title')?.replaceChildren(document.createTextNode('PERFIL OPERATIVO'));
  document.getElementById('settings-bgm-label')?.replaceChildren(document.createTextNode('MÚSICA'));
  document.getElementById('settings-sfx-label')?.replaceChildren(document.createTextNode('EFECTOS'));
  document.getElementById('settings-language-label')?.replaceChildren(document.createTextNode('IDIOMA'));
}

export const interfaceRevisionModule = {
  start(runtime) {
    const refresh = () => {
      updateReleaseBadge();
      cleanMenu();
      decorateGameover();
      decorateMainSettings();
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-phase'] });
    const timer = window.setInterval(refresh, 900);
    const api = { refresh, release: RELEASE, stop() { observer.disconnect(); clearInterval(timer); } };
    runtime.services.set('interfaceRevision', api);
    runtime.events.emit('interface:v142-ready', { release: RELEASE });
    return api;
  },
  stop(runtime, api) { api?.stop?.(); }
};

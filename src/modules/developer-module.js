import { openArchitecturePanel, renderArchitecturePanel } from '../ui/architecture-panel.js';
import { openContentAuditPanel, renderContentAuditPanel } from '../ui/content-audit-panel.js';

export const developerModule = {
  start(runtime) {
    const api = {
      addCores(amount = 100) {
        if (window.mekoraV342?.developer?.addCores) return window.mekoraV342.developer.addCores(amount);
        return runtime.services.get('progression')?.addCores(amount);
      },
      unlockMechs() { return window.mekoraV342?.developer?.unlockMechs?.(); },
      unlockSkins() { return window.mekoraV342?.developer?.unlockSkins?.(); },
      unlockEffects() { return window.mekoraV342?.developer?.unlockEffects?.(); },
      unlockArsenal() { return window.mekoraV342?.developer?.unlockArsenal?.(); },
      unlockAll() { return window.mekoraV342?.developer?.unlockAll?.(); },
      summary() {
        return window.mekoraV342?.developer?.summary?.() ?? { cores: runtime.services.get('progression')?.getCores?.() ?? 0 };
      },
      ensureTabs() {
        const tabs = document.getElementById('dev-section-tabs');
        if (!tabs) return false;
        if (!document.getElementById('mekora-architecture-tab')) {
          const button = document.createElement('button');
          button.id = 'mekora-architecture-tab';
          button.type = 'button';
          button.className = 'dev-tab';
          button.textContent = 'ARQUITECTURA';
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openArchitecturePanel(runtime);
          });
          tabs.appendChild(button);
        }
        if (!document.getElementById('mekora-content-audit-tab')) {
          const button = document.createElement('button');
          button.id = 'mekora-content-audit-tab';
          button.type = 'button';
          button.className = 'dev-tab';
          button.textContent = 'AUDITORÍA';
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openContentAuditPanel(runtime);
          });
          tabs.appendChild(button);
        }
        return true;
      },
      openArchitecture() { openArchitecturePanel(runtime); },
      openContentAudit() { openContentAuditPanel(runtime); }
    };

    runtime.events.on('module:started', () => {
      api.ensureTabs();
      renderArchitecturePanel(runtime);
    });
    runtime.events.on('content:audit-complete', () => renderContentAuditPanel(runtime));
    runtime.store.subscribe(() => {
      api.ensureTabs();
      if (!document.getElementById('mekora-architecture-panel')?.classList.contains('hidden')) renderArchitecturePanel(runtime);
    });
    const observer = new MutationObserver(() => api.ensureTabs());
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => api.ensureTabs(), 250);
    runtime.services.set('developer', api);
    return { ...api, stop: () => observer.disconnect() };
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};

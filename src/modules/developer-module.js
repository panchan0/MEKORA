import { openArchitecturePanel, renderArchitecturePanel } from '../ui/architecture-panel.js';

export const developerModule = {
  start(runtime) {
    const api = {
      addCores(amount = 100) {
        if (window.mekoraV342?.developer?.addCores) return window.mekoraV342.developer.addCores(amount);
        return runtime.services.get('progression')?.addCores(amount);
      },
      unlockMechs() {
        return window.mekoraV342?.developer?.unlockMechs?.();
      },
      unlockSkins() {
        return window.mekoraV342?.developer?.unlockSkins?.();
      },
      unlockEffects() {
        return window.mekoraV342?.developer?.unlockEffects?.();
      },
      unlockArsenal() {
        return window.mekoraV342?.developer?.unlockArsenal?.();
      },
      unlockAll() {
        return window.mekoraV342?.developer?.unlockAll?.();
      },
      summary() {
        return window.mekoraV342?.developer?.summary?.() ?? {
          cores: runtime.services.get('progression')?.getCores?.() ?? 0
        };
      },
      attachArchitectureTab() {
        const tabs = document.getElementById('dev-section-tabs');
        if (!tabs || document.getElementById('mekora-architecture-tab')) return false;
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
        return true;
      },
      openArchitecture() {
        openArchitecturePanel(runtime);
      }
    };

    runtime.events.on('module:started', () => renderArchitecturePanel(runtime));
    runtime.store.subscribe(() => {
      if (!document.getElementById('mekora-architecture-panel')?.classList.contains('hidden')) {
        renderArchitecturePanel(runtime);
      }
    });
    window.setTimeout(() => api.attachArchitectureTab(), 250);
    runtime.services.set('developer', api);
    return api;
  }
};

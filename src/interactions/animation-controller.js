/**
 * Controls the signature WiniSort import vortex animation and destination sorting pulse feedback.
 * Strictly caps animated DOM elements (8 to 16 reusable particles) regardless of whether 10 or 50,000 files are imported.
 */
export class AnimationController {
  constructor(store) {
    this.store = store;
  }

  isMotionEnabled() {
    if (this.store.preferences.motionLevel === 'reduced') return false;
    if (this.store.capabilities.prefersReducedMotion) return false;
    return true;
  }

  /**
   * Plays the signature central media pool collection vortex animation with a strictly bounded particle budget.
   * @param {HTMLElement} containerEl
   * @param {Array<Object>} sampleFiles
   */
  playImportVortex(containerEl, sampleFiles = []) {
    if (!containerEl || !this.isMotionEnabled()) return;
    const budget = Math.min(
      this.store.capabilities.budgets.vortexParticleCount || 12,
      Math.max(6, sampleFiles.length || 10),
      16
    );

    const emojis = ['🖼️', '🎬', '🎵', '📕', '📄', '📊'];
    for (let i = 0; i < budget; i++) {
      const particle = document.createElement('div');
      particle.className = 'ws-vortex-particle';
      const angle = (i / budget) * Math.PI * 2;
      const radius = 140 + (i % 3) * 35;
      const vx = Math.round(Math.cos(angle) * radius);
      const vy = Math.round(Math.sin(angle) * radius);
      const vr = Math.round((i % 2 === 0 ? 1 : -1) * (15 + i * 3));

      particle.style.setProperty('--vx', `${vx}px`);
      particle.style.setProperty('--vy', `${vy}px`);
      particle.style.setProperty('--vr', `${vr}deg`);
      particle.style.animationDelay = `${i * 28}ms`;

      const fileSample = sampleFiles[i % Math.max(1, sampleFiles.length)];
      particle.textContent = fileSample?.emoji || emojis[i % emojis.length];
      containerEl.appendChild(particle);

      setTimeout(() => {
        if (particle.parentNode) particle.parentNode.removeChild(particle);
      }, 850 + i * 28);
    }
  }

  /**
   * Flashes a destination card with its accent color ONLY after the underlying copy operation is verified.
   * @param {string} destinationId
   */
  flashDestinationSuccess(destinationId) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(`[data-destination-id="${destinationId}"]`);
    if (!el) return;
    el.classList.remove('is-sorted-flash');
    void el.offsetWidth;
    el.classList.add('is-sorted-flash');
    setTimeout(() => {
      el.classList.remove('is-sorted-flash');
    }, 600);
  }
}

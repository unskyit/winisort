/**
 * Keyboard shortcut controller.
 * Never activates unexpectedly when the user is typing inside an input, textarea, select, or contentEditable element.
 */
export class ShortcutsController {
  constructor(store, handlers) {
    this.store = store;
    this.handlers = handlers;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  mount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  unmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
    }
  }

  _isTypingInInput(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  _onKeyDown(e) {
    const isMod = e.ctrlKey || e.metaKey;

    // Global Escape closes active modal
    if (e.key === 'Escape') {
      if (this.store.ui.activeModal) {
        e.preventDefault();
        this.handlers.onCloseModal?.();
        return;
      }
    }

    // Global Command Palette (Ctrl/Cmd + K)
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.handlers.onOpenCommandPalette?.();
      return;
    }

    // Do not intercept shortcuts when typing in inputs
    if (this._isTypingInInput(e.target)) return;

    // Undo / Redo
    if (isMod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.handlers.onRedo?.();
      } else {
        this.handlers.onUndo?.();
      }
      return;
    }

    // Select All filtered (Ctrl/Cmd + A)
    if (isMod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.handlers.onSelectAll?.();
      return;
    }

    // Focus search (/)
    if (e.key === '/') {
      e.preventDefault();
      this.handlers.onFocusSearch?.();
      return;
    }

    // Keyboard help (?)
    if (e.key === '?') {
      e.preventDefault();
      this.handlers.onOpenHelp?.();
      return;
    }

    // Quick destination shortcuts 1-9
    if (!isMod && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      this.handlers.onNumericShortcut?.(e.key);
      return;
    }

    // Previous / Next navigation
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.handlers.onNextFile?.();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.handlers.onPreviousFile?.();
      return;
    }

    // Spacebar fullscreen preview toggle
    if (e.key === ' ') {
      e.preventDefault();
      this.handlers.onToggleFullscreenPreview?.();
      return;
    }

    // Delete removes selected item from unsorted queue WITHOUT deleting source file
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.handlers.onSkipActiveFile?.();
    }
  }
}

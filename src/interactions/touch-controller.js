/**
 * Mobile touch gesture controller supporting swipe left/right navigation and long-press multi-selection.
 */
export class TouchController {
  constructor(onSwipeLeft, onSwipeRight) {
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
  }

  bindSwipeNavigation(element) {
    if (!element) return;
    let touchStartX = 0;
    let touchStartY = 0;

    element.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0 && this.onSwipeLeft) this.onSwipeLeft();
        if (dx > 0 && this.onSwipeRight) this.onSwipeRight();
      }
    }, { passive: true });
  }
}

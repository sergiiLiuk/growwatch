import { Directive, ElementRef, HostListener, inject, output, signal } from '@angular/core';

/**
 * Pure CSS + touch-event pull-to-refresh. Only fires when the host element is
 * scrolled to the top, so it never fights a normal scroll. The host can either
 * subscribe to (gwPullRefresh) or rely on the directive's transient signals
 * to draw a custom indicator.
 *
 * Usage:
 *   <div gwPullToRefresh (gwPullRefresh)="reload()"> … </div>
 */
@Directive({
  selector: '[gwPullToRefresh]',
  exportAs: 'gwPullToRefresh',
})
export class PullToRefreshDirective {
  private el = inject(ElementRef<HTMLElement>);

  /** Emits when the user has pulled past THRESHOLD and released. */
  gwPullRefresh = output<void>();

  /** Pixels of pull needed before a release triggers refresh. */
  private readonly THRESHOLD = 70;
  /** Soft cap so the pull doesn't drag the page across the screen. */
  private readonly MAX = 110;

  /** Current pull distance in pixels (0 when idle). For custom indicators. */
  pullDistance = signal(0);
  /** True once pullDistance crosses THRESHOLD — can drive a colour change. */
  isReady = signal(false);

  private startY: number | null = null;
  private active = false;

  @HostListener('touchstart', ['$event'])
  onTouchStart(ev: TouchEvent) {
    if (this.atTop() && ev.touches.length === 1) {
      this.startY = ev.touches[0].clientY;
    } else {
      this.startY = null;
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(ev: TouchEvent) {
    if (this.startY == null) return;
    const delta = ev.touches[0].clientY - this.startY;
    if (delta <= 0) return;
    this.active = true;
    // Soft damping past THRESHOLD so the pull "resists"
    const damped = Math.min(this.MAX, delta * 0.6);
    this.pullDistance.set(damped);
    this.isReady.set(damped >= this.THRESHOLD);
  }

  @HostListener('touchend')
  onTouchEnd() {
    if (this.active && this.pullDistance() >= this.THRESHOLD) {
      this.gwPullRefresh.emit();
    }
    this.startY = null;
    this.active = false;
    this.pullDistance.set(0);
    this.isReady.set(false);
  }

  /**
   * The host (or its scrolling ancestor) must be at the top before a pull is a
   * "pull-to-refresh" gesture rather than a normal scroll. We walk up to find
   * the nearest scrollable parent.
   */
  private atTop(): boolean {
    let node: HTMLElement | null = this.el.nativeElement;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY)) {
        return node.scrollTop <= 0;
      }
      node = node.parentElement;
    }
    return (window.scrollY ?? 0) <= 0;
  }
}

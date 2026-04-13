/**
 * Mobile Controls - Specialized for Epicenter City
 * Detects Taps (Left Click) and Long-Presses (Right Click)
 * Optimized to ignore multi-touch pinch gestures.
 */
export class MobileControls {
    constructor(bridge) {
        this.bridge = bridge;
        this.longPressTimer = null;
        this.isLongPressTriggered = false;
        this.touchStartPos = { x: 0, y: 0 };
        this.startTime = 0;
        
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            this.setupEvents();
        }
    }

    setupEvents() {
        const dom = document.body;

        dom.addEventListener('touchstart', (e) => {
            // 1. PINCH PROTECTION: If more than one finger is down, cancel any pending long press
            if (e.touches.length > 1) {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
                return; 
            }
            
            const touch = e.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
            this.isLongPressTriggered = false;
            this.startTime = performance.now();

            // Setup timer for Long Press (500ms)
            // This only happens if exactly one finger is on the screen
            this.longPressTimer = setTimeout(() => {
                this.isLongPressTriggered = true;
                this.bridge.handleInput('LONG_PRESS', touch);
                this.longPressTimer = null;
            }, 500);
        }, { passive: false });

        dom.addEventListener('touchmove', (e) => {
            // 2. PINCH PROTECTION: Cancel long press if a second finger joins during the move
            if (e.touches.length > 1) {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
                return;
            }
            
            const touch = e.touches[0];
            const dist = Math.hypot(touch.clientX - this.touchStartPos.x, touch.clientY - this.touchStartPos.y);
            
            // If movement detected (scroll/pan/drag), cancel the click/longpress logic
            if (dist > 15) {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        });

        dom.addEventListener('touchend', (e) => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            // If it wasn't a long press and we didn't move too far, and it was a single finger release
            if (!this.isLongPressTriggered && e.changedTouches.length === 1) {
                const duration = performance.now() - this.startTime;
                // Only trigger if it was a quick release and not a multi-touch end
                if (duration < 500) {
                    const touch = e.changedTouches[0];
                    this.bridge.handleInput('TAP', touch);
                }
            }
        });
    }
}
import { useEffect } from 'react';

/**
 * Drag-to-Scroll mit Schwung („iPhone-Gefühl") für Touch-Kiosks.
 *
 * Hintergrund: Auf dem Raspberry-Pi-Touchscreen liefert das Display
 * Maus-Ereignisse. Ein Finger-Zieh über eine Box wird dann als
 * Textauswahl (Maus-Drag) interpretiert statt als Scroll-Geste –
 * native „iOS"-Eigenschaften wie `-webkit-overflow-scrolling` helfen
 * dabei nicht. Dieser Hook übersetzt einen Zieh-Gestus per Pointer-
 * Events in echtes Scrollen des nächsten scrollbaren Containers und
 * lässt ihn nach dem Loslassen mit abnehmender Geschwindigkeit
 * nachlaufen (Trägheit).
 *
 * Pointer-Events vereinheitlichen Maus + Touch, daher funktioniert das
 * sowohl auf maus-emulierten als auch auf echten Touch-Displays.
 */

// Eingabe-Elemente nicht kapern: Textfelder bleiben selektierbar,
// Schieberegler (z. B. Sonos-Lautstärke) müssen ziehbar bleiben.
const NO_DRAG_SELECTOR = 'input, textarea, select, [contenteditable], [data-no-drag-scroll]';

const MOVE_THRESHOLD = 6;      // px, bis aus einem Tap ein Zieh-Gestus wird
const MAX_VELOCITY = 40;       // px/Frame, deckelt extreme Flings
const FRICTION = 0.95;         // Trägheits-Abbremsung pro Frame
const MIN_VELOCITY = 0.5;      // px/Frame, ab hier stoppt das Nachlaufen

interface Scrollable {
    el: HTMLElement;
    canY: boolean;
    canX: boolean;
}

// Nächsten scrollbaren Vorfahren suchen (vertikal oder horizontal).
function findScrollable(start: HTMLElement | null): Scrollable | null {
    let el: HTMLElement | null = start;
    while (el && el !== document.body) {
        const style = getComputedStyle(el);
        const canY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
        const canX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
        if (canY || canX) return { el, canY, canX };
        el = el.parentElement;
    }
    return null;
}

export function useDragScroll(enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        let target: Scrollable | null = null;
        let startX = 0, startY = 0, lastX = 0, lastY = 0;
        let scrollStartTop = 0, scrollStartLeft = 0;
        let lastT = 0;
        let velX = 0, velY = 0;
        let dragging = false;
        let moved = false;
        let suppressClick = false;
        let raf = 0;

        const stopInertia = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            suppressClick = false;
            const t = e.target as HTMLElement | null;
            if (!t || t.closest(NO_DRAG_SELECTOR)) return;
            const scrollable = findScrollable(t);
            if (!scrollable) return;

            stopInertia();
            target = scrollable;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            scrollStartTop = scrollable.el.scrollTop;
            scrollStartLeft = scrollable.el.scrollLeft;
            lastT = e.timeStamp;
            velX = velY = 0;
            dragging = true;
            moved = false;
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!dragging || !target) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (!moved) {
                if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
                moved = true;
                suppressClick = true; // der nachfolgende Klick gehört zum Ziehen, nicht zum Tippen
                try { target.el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
            }

            e.preventDefault(); // verhindert Textauswahl / natives Scrollen

            if (target.canY) target.el.scrollTop = scrollStartTop - dy;
            if (target.canX) target.el.scrollLeft = scrollStartLeft - dx;

            const dt = Math.max(1, e.timeStamp - lastT);
            velY = (e.clientY - lastY) / dt;
            velX = (e.clientX - lastX) / dt;
            lastX = e.clientX;
            lastY = e.clientY;
            lastT = e.timeStamp;
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            const t = target;
            const wasDrag = moved;
            target = null;
            moved = false;
            if (!t || !wasDrag) return;

            // Schwung: Geschwindigkeit (px/ms) → px/Frame, gedeckelt.
            let vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velX * 16));
            let vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velY * 16));
            if (Math.abs(vx) < MIN_VELOCITY && Math.abs(vy) < MIN_VELOCITY) return;

            const step = () => {
                vx *= FRICTION;
                vy *= FRICTION;
                if (t.canY) t.el.scrollTop -= vy;
                if (t.canX) t.el.scrollLeft -= vx;
                if (Math.abs(vx) > MIN_VELOCITY || Math.abs(vy) > MIN_VELOCITY) {
                    raf = requestAnimationFrame(step);
                } else {
                    raf = 0;
                }
            };
            raf = requestAnimationFrame(step);
        };

        // Den auf ein echtes Ziehen folgenden Klick schlucken, damit eine
        // Wischgeste keinen Button auslöst.
        const onClickCapture = (e: MouseEvent) => {
            if (suppressClick) {
                suppressClick = false;
                e.stopPropagation();
                e.preventDefault();
            }
        };

        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp, { passive: true });
        document.addEventListener('pointercancel', onPointerUp, { passive: true });
        document.addEventListener('click', onClickCapture, true);

        return () => {
            stopInertia();
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
            document.removeEventListener('click', onClickCapture, true);
        };
    }, [enabled]);
}

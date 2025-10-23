'use strict';

// Patch: Tutorial responsivo com opacidades personalizadas
(function () {
    const tutorialStyle = document.createElement('style');
    tutorialStyle.id = 'tutorial-dynamic-styles';
    tutorialStyle.textContent = `
        .tutorial-overlay {
            position: fixed !important;
            inset: 0 !important;
            z-index: 10000 !important;
            pointer-events: none !important;
        }
        .tutorial-highlight {
            position: fixed !important;
            background: transparent !important;
            border: 4px solid #4CAF50 !important;
            border-radius: 8px !important;
            z-index: 10001 !important;
            pointer-events: auto !important;
            transition: none !important;
        }
        .tutorial-tooltip {
            position: fixed !important;
            background: white !important;
            border-radius: 12px !important;
            padding: 20px !important;
            max-width: 400px !important;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
            z-index: 10002 !important;
            pointer-events: auto !important;
        }
        [data-theme="dark"] .tutorial-tooltip {
            background: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        .tutorial-tooltip h3 { margin: 0 0 10px 0; font-size: 18px; font-weight: 600; }
        .tutorial-tooltip p { margin: 0 0 15px 0; line-height: 1.6; }
        .tutorial-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e5e5; }
        .tutorial-buttons { display: flex; gap: 10px; }
        .btn-tutorial { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; }
        .btn-tutorial-prev { background: #e5e5e5; color: #333; }
        .btn-tutorial-prev:hover { background: #d0d0d0; }
        .btn-tutorial-prev:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-tutorial-next { background: #0066cc; color: white; }
        .btn-tutorial-next:hover { background: #0052a3; }
        .btn-tutorial-close { position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #999; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease; }
        .btn-tutorial-close:hover { background: #f0f0f0; color: #333; }
    `;
    document.head.appendChild(tutorialStyle);

    function detectPowerBIOffset(iframe) {
        const rect = iframe.getBoundingClientRect();
        const topOffset = Math.max(45, Math.min(60, rect.height * 0.06));
        const sideOffset = Math.max(6, rect.width * 0.008);
        const bottomOffset = Math.max(6, rect.height * 0.01);
        return { top: topOffset, left: sideOffset, right: sideOffset, bottom: bottomOffset };
    }

    function toPx(raw, total) {
        if (raw === undefined || raw === null) return 0;
        const s = String(raw).trim();
        if (s.endsWith('%')) {
            const p = parseFloat(s);
            return isNaN(p) ? 0 : (p / 100) * total;
        }
        if (s.endsWith('px')) {
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        }
        const n = parseFloat(s);
        if (isNaN(n)) return 0;
        if (n >= 0 && n <= 100) return (n / 100) * total;
        return n;
    }

    function computeLocalRect(highlight, usableWidth, usableHeight) {
        let topPx = toPx(highlight.top, usableHeight);
        let leftPx = toPx(highlight.left, usableWidth);
        let widthPx = toPx(highlight.width, usableWidth);
        let heightPx = toPx(highlight.height, usableHeight);

        widthPx = Math.max(1, Math.min(widthPx, usableWidth));
        heightPx = Math.max(1, Math.min(heightPx, usableHeight));
        topPx = Math.max(0, Math.min(topPx, usableHeight - heightPx));
        leftPx = Math.max(0, Math.min(leftPx, usableWidth - widthPx));

        return { top: topPx, left: leftPx, width: widthPx, height: heightPx };
    }

    function makeOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';

        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';

        const tooltip = document.createElement('div');
        tooltip.className = 'tutorial-tooltip';
        tooltip.innerHTML = `
            <button class="btn-tutorial-close" aria-label="Fechar">×</button>
            <h3></h3>
            <p></p>
            <div class="tutorial-footer">
                <span class="tutorial-progress"></span>
                <div class="tutorial-buttons">
                    <button class="btn-tutorial btn-tutorial-prev">Anterior</button>
                    <button class="btn-tutorial btn-tutorial-next">Próximo</button>
                </div>
            </div>
        `;

        overlay.appendChild(highlight);
        overlay.appendChild(tooltip);
        document.body.appendChild(overlay);

        overlay._highlight = highlight;
        overlay._tooltip = tooltip;
        overlay._controls = {
            prev: tooltip.querySelector('.btn-tutorial-prev'),
            next: tooltip.querySelector('.btn-tutorial-next'),
            close: tooltip.querySelector('.btn-tutorial-close'),
            title: tooltip.querySelector('h3'),
            desc: tooltip.querySelector('p'),
            progress: tooltip.querySelector('.tutorial-progress')
        };
        return overlay;
    }

    function placeHighlight(iframe, localRect, step, idx, total) {
        const overlay = document.querySelector('.tutorial-overlay');
        if (!overlay) return;

        const hl = overlay._highlight;
        const tt = overlay._tooltip;
        const c = overlay._controls;

        const iframeRect = iframe.getBoundingClientRect();
        const offset = detectPowerBIOffset(iframe);

        const hlTop = iframeRect.top + offset.top + localRect.top;
        const hlLeft = iframeRect.left + offset.left + localRect.left;
        const hlWidth = localRect.width;
        const hlHeight = localRect.height;

        // Opacidades customizadas (ou defaults)
        const overlayOpacity = step.overlayOpacity !== undefined ? step.overlayOpacity : 0.75;
        const highlightOpacity = step.highlightOpacity !== undefined ? step.highlightOpacity : 0.20;

        hl.style.top = hlTop + 'px';
        hl.style.left = hlLeft + 'px';
        hl.style.width = hlWidth + 'px';
        hl.style.height = hlHeight + 'px';
        hl.style.background = `rgba(76, 175, 80, ${highlightOpacity})`;
        hl.style.boxShadow = `
            0 0 0 4px rgba(76, 175, 80, 0.4),
            0 0 0 9999px rgba(0, 0, 0, ${overlayOpacity}),
            0 0 40px 5px rgba(76, 175, 80, 0.8)
        `;

        c.title.textContent = step.title || ('Passo ' + (idx + 1));
        c.desc.textContent = step.description || '';
        c.progress.textContent = (idx + 1) + ' / ' + total;
        c.prev.disabled = idx === 0;
        c.next.textContent = idx === total - 1 ? 'Concluir' : 'Próximo';

        const margin = 20;
        let ttLeft = hlLeft + hlWidth + margin;
        let ttTop = hlTop;

        tt.style.visibility = 'hidden';
        tt.style.left = '0px';
        tt.style.top = '0px';

        requestAnimationFrame(() => {
            const ttRect = tt.getBoundingClientRect();

            if (ttLeft + ttRect.width > window.innerWidth - 10) {
                ttLeft = hlLeft;
                ttTop = hlTop + hlHeight + margin;
            }
            if (ttTop + ttRect.height > window.innerHeight - 10) {
                ttTop = hlTop - ttRect.height - margin;
            }
            if (ttTop < 10) {
                ttLeft = hlLeft - ttRect.width - margin;
                ttTop = hlTop;
            }

            ttLeft = Math.max(10, Math.min(ttLeft, window.innerWidth - ttRect.width - 10));
            ttTop = Math.max(10, Math.min(ttTop, window.innerHeight - ttRect.height - 10));

            tt.style.left = ttLeft + 'px';
            tt.style.top = ttTop + 'px';
            tt.style.visibility = 'visible';
        });
    }

    function patchTutorial() {
        if (window.__TutorialPatched) return;
        window.__TutorialPatched = true;

        window.PortalTutorial = {
            startTutorial: async function(pageId) {
                try {
                    const resp = await fetch(`/api/tutorials/page/${pageId}`);
                    if (!resp.ok) { 
                        alert('Nenhum tutorial disponível para esta página'); 
                        return; 
                    }
                    const tutorial = await resp.json();
                    const steps = Array.isArray(tutorial.steps) ? tutorial.steps : [];
                    if (!steps.length) { 
                        alert('Tutorial sem passos'); 
                        return; 
                    }

                    const powerIframe = document.querySelector('#powerbiContainer iframe');
                    if (!powerIframe) { 
                        alert('Painel não está carregado'); 
                        return; 
                    }

                    const overlay = makeOverlay();
                    let currentIndex = 0;
                    let ro = null;
                    let rafId = null;

                    const reposition = () => {
                        if (rafId) cancelAnimationFrame(rafId);
                        rafId = requestAnimationFrame(() => {
                            if (!document.body.contains(overlay)) return;
                            const iframeRect = powerIframe.getBoundingClientRect();
                            const offset = detectPowerBIOffset(powerIframe);
                            const usableWidth = iframeRect.width - offset.left - offset.right;
                            const usableHeight = iframeRect.height - offset.top - offset.bottom;

                            const hl = steps[currentIndex]?.highlight || {};
                            const localRect = computeLocalRect(hl, usableWidth, usableHeight);
                            placeHighlight(powerIframe, localRect, steps[currentIndex], currentIndex, steps.length);
                            rafId = null;
                        });
                    };

                    const go = (delta) => {
                        currentIndex += delta;
                        if (currentIndex < 0) currentIndex = 0;
                        if (currentIndex >= steps.length) { 
                            close(); 
                            return; 
                        }
                        reposition();
                    };

                    const close = () => {
                        try {
                            if (rafId) cancelAnimationFrame(rafId);
                            window.removeEventListener('resize', reposition);
                            window.removeEventListener('scroll', reposition, true);
                            if (ro) ro.disconnect();
                            powerIframe.removeEventListener('load', reposition);
                        } catch (_) {}
                        if (document.body.contains(overlay)) {
                            document.body.removeChild(overlay);
                        }
                    };

                    overlay._controls.prev.onclick = () => go(-1);
                    overlay._controls.next.onclick = () => go(1);
                    overlay._controls.close.onclick = () => close();

                    window.addEventListener('resize', reposition);
                    window.addEventListener('scroll', reposition, true);
                    powerIframe.addEventListener('load', reposition);

                    if ('ResizeObserver' in window) {
                        ro = new ResizeObserver(reposition);
                        ro.observe(powerIframe);
                        const container = powerIframe.parentElement;
                        if (container) ro.observe(container);
                    }

                    reposition();
                } catch (e) {
                    console.error('[Tutorial] Erro:', e);
                    alert('Erro ao iniciar tutorial: ' + e.message);
                }
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchTutorial);
    } else {
        patchTutorial();
    }
})();

/**
 * adminConfirm — modal de confirmação estilizado, drop-in para confirm() nativo.
 *
 *   const ok = await adminConfirm({
 *       title: 'Excluir usuário',
 *       message: 'Tem certeza que deseja excluir "joao"?',
 *       confirmText: 'Excluir',
 *       cancelText: 'Cancelar',
 *       destructive: true
 *   });
 *
 * Aceita também a forma curta: await adminConfirm('Mensagem?')
 *
 * Acessibilidade: role="dialog" + aria-modal, foco vai pro botão Cancelar,
 * Esc fecha (rejeita), Enter confirma quando não-destrutivo.
 */
(function () {
    function buildOverlay(opts) {
        const overlay = document.createElement('div');
        overlay.className = 'admin-confirm-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'adminConfirmTitle');
        overlay.setAttribute('aria-describedby', 'adminConfirmMessage');

        const dialog = document.createElement('div');
        dialog.className = 'admin-confirm-dialog' + (opts.destructive ? ' is-destructive' : '');
        dialog.innerHTML = `
            <div class="admin-confirm-icon" aria-hidden="true">
                ${opts.destructive
                    ? '<i class="fas fa-exclamation-triangle"></i>'
                    : '<i class="fas fa-question-circle"></i>'}
            </div>
            <h3 id="adminConfirmTitle" class="admin-confirm-title"></h3>
            <p id="adminConfirmMessage" class="admin-confirm-message"></p>
            <div class="admin-confirm-actions">
                <button type="button" class="admin-confirm-btn admin-confirm-btn--secondary" data-role="cancel"></button>
                <button type="button" class="admin-confirm-btn ${opts.destructive ? 'admin-confirm-btn--destructive' : 'admin-confirm-btn--primary'}" data-role="confirm"></button>
            </div>
        `;

        dialog.querySelector('#adminConfirmTitle').textContent = opts.title;
        dialog.querySelector('#adminConfirmMessage').textContent = opts.message;
        dialog.querySelector('[data-role="cancel"]').textContent = opts.cancelText;
        dialog.querySelector('[data-role="confirm"]').textContent = opts.confirmText;

        overlay.appendChild(dialog);
        return overlay;
    }

    window.adminConfirm = function (input) {
        const opts = (typeof input === 'string')
            ? { message: input }
            : (input || {});

        const config = {
            title: opts.title || 'Confirmar ação',
            message: opts.message || 'Tem certeza?',
            confirmText: opts.confirmText || 'Confirmar',
            cancelText: opts.cancelText || 'Cancelar',
            destructive: !!opts.destructive
        };

        return new Promise((resolve) => {
            const overlay = buildOverlay(config);
            document.body.appendChild(overlay);

            // Foco inicial no Cancelar — comportamento seguro por padrão.
            const cancelBtn = overlay.querySelector('[data-role="cancel"]');
            const confirmBtn = overlay.querySelector('[data-role="confirm"]');

            const cleanup = (result) => {
                document.removeEventListener('keydown', onKey);
                overlay.classList.add('is-closing');
                setTimeout(() => overlay.remove(), 120);
                resolve(result);
            };

            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
                else if (e.key === 'Enter' && !config.destructive) { e.preventDefault(); cleanup(true); }
            };

            cancelBtn.addEventListener('click', () => cleanup(false));
            confirmBtn.addEventListener('click', () => cleanup(true));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
            document.addEventListener('keydown', onKey);

            // Pequeno delay para garantir transição.
            requestAnimationFrame(() => {
                overlay.classList.add('is-open');
                cancelBtn.focus();
            });
        });
    };
})();

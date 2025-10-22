(function() {
	// Carrega o módulo de backup (100% funcional) e aplica um pequeno patch para o modal do Tutorial Builder
	function ensureBuilderModal() {
		if (document.getElementById('tutorialBuilderModal')) return;
		const modal = document.createElement('div');
		modal.id = 'tutorialBuilderModal';
		modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;backdrop-filter:blur(2px);background:rgba(0,0,0,0.55)';
		modal.innerHTML = [
			'<div style="position:absolute;inset:30px;display:flex;flex-direction:column;">',
			'  <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">',
			'    <button id="closeTutorialBuilderBtn" aria-label="Fechar" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px 12px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.2);">×</button>',
			'  </div>',
			'  <div style="flex:1;min-height:0;background:#1f1f1f;border-radius:10px;overflow:hidden;border:1px solid #333;">',
			'    <iframe id="tutorialBuilderIframe" src="" title="Tutorial Builder" style="width:100%;height:100%;border:0;display:block;"></iframe>',
			'  </div>',
			'</div>'
		].join('');
		document.body.appendChild(modal);
	}

	function patchPortalAdmin() {
		if (!window.PortalAdmin) return;

		// Garante o modal pronto
		ensureBuilderModal();

		// Adiciona o método para abrir o Tutorial Builder dentro de um modal (sem nova aba)
		window.PortalAdmin.openTutorialBuilder = function(pageId) {
			const modal = document.getElementById('tutorialBuilderModal');
			const iframe = document.getElementById('tutorialBuilderIframe');
			const closeBtn = document.getElementById('closeTutorialBuilderBtn');
			if (!modal || !iframe || !closeBtn) {
				console.error('[TutorialBuilder] Modal não encontrado no DOM');
				// Fallback (caso falhe a injeção do modal)
				window.open(`/tutorial-builder.html?pageId=${pageId}`, 'TutorialBuilder');
				return;
			}

			iframe.src = `/tutorial-builder.html?pageId=${pageId}`;
			modal.style.display = 'block';
			const prevOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';

			const close = () => {
				iframe.src = '';
				modal.style.display = 'none';
				document.body.style.overflow = prevOverflow || '';
			};

			closeBtn.onclick = close;
			modal.onclick = (e) => {
				// Fecha ao clicar fora do conteúdo
				const path = e.composedPath ? e.composedPath() : [];
				const insideContent = path.some(el => el && el.style && el.style.minHeight === '0'); // caixa do iframe
				if (!insideContent) close();
			};
			document.addEventListener('keydown', function onKey(e) {
				if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
			});
		};
	}

	function loadBackupAndPatch() {
		// Se já existe PortalAdmin, apenas aplica o patch
		if (window.PortalAdmin && typeof window.PortalAdmin === 'object') {
			patchPortalAdmin();
			return;
		}
		// Injeta o script do backup e, após carregar, aplica o patch
		const s = document.createElement('script');
		s.src = 'assets/js/modules/admin_bkp.js';
		s.async = true;
		s.onload = () => {
			try { patchPortalAdmin(); } catch (e) { console.error('[Admin Loader] Patch error:', e); }
		};
		s.onerror = () => {
			console.error('[Admin Loader] Falha ao carregar admin_bkp.js');
		};
		document.head.appendChild(s);
	}

	// Start
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadBackupAndPatch);
	} else {
		loadBackupAndPatch();
	}
})();
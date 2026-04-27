/* ============================================================
   PORTAL AACD — icons.js (v2)
   Seletor de ícones com busca, categorias e grid denso.
   Drop-in: mantém 100% da API pública do icons.js antigo.
   ============================================================ */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // 1) PALETTE LEGACY (svg-0..svg-7 + emojis) — não mexer na ordem
  // -------------------------------------------------------------
  const LEGACY_SVGS = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-dollar-sign" aria-hidden="true"><line x1="12" x2="12" y1="2" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="18" y1="20" x2="18" y2="14"></line></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pie-chart" aria-hidden="true"><path d="M21 12A9 9 0 1 1 12 3v9z"></path><path d="M12 12h9"></path></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-.33-1.82L4.21 7.1A2 2 0 1 1 7 4.21l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="M3 9l9-7 9 7"></path><path d="M9 22V12h6v10"></path></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M4 21v-2a4 4 0 0 1 3-3.87"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  ];
  const SVG_NAMES = [
    'Cifrão', 'Gráfico Barras', 'Gráfico Pizza', 'Calendário',
    'Engrenagem', 'Casa', 'Usuário', 'Busca'
  ];
  const LEGACY_EMOJIS = ['📊','📈','📉','💹','📋','📑','💼','🎯','💰','📌'];

  // -------------------------------------------------------------
  // 2) CATÁLOGO EXPANDIDO — Font Awesome 6 (free)
  // -------------------------------------------------------------
  // formato: [classe-fa, "rótulo", "termos de busca extras"]
  const CATALOG = {
    'Assistencial': [
      ['fas fa-stethoscope',     'Estetoscópio',         'medico clinica consulta'],
      ['fas fa-bed-pulse',       'Leito monitorado',     'internacao uti hospital'],
      ['fas fa-bed',             'Leito',                'internacao quarto'],
      ['fas fa-hospital',        'Hospital',             'unidade pronto socorro'],
      ['fas fa-house-medical',   'Casa médica',          'home care'],
      ['fas fa-user-doctor',     'Médico',               'doutor profissional'],
      ['fas fa-user-nurse',      'Enfermeira',           'enfermagem cuidados'],
      ['fas fa-heart-pulse',     'Pulso cardíaco',       'ecg coracao monitor'],
      ['fas fa-heart',           'Coração',              'amor cuidado'],
      ['fas fa-syringe',         'Seringa',              'vacina injecao'],
      ['fas fa-pills',           'Medicamento',          'remedio farmacia'],
      ['fas fa-prescription-bottle-medical', 'Frasco médico', 'remedio farmacia'],
      ['fas fa-notes-medical',   'Prontuário',           'historico paciente registro'],
      ['fas fa-file-medical',    'Laudo',                'exame relatorio medico'],
      ['fas fa-microscope',      'Microscópio',          'laboratorio analise'],
      ['fas fa-vial',            'Tubo de ensaio',       'laboratorio amostra exame'],
      ['fas fa-vials',           'Tubos',                'laboratorio amostras exames'],
      ['fas fa-tooth',           'Dente',                'odonto dentista'],
      ['fas fa-eye',             'Olho',                 'oftalmo visao'],
      ['fas fa-brain',           'Cérebro',              'neuro mental'],
      ['fas fa-lungs',           'Pulmão',               'respiracao pneumo'],
      ['fas fa-bone',            'Osso',                 'orto reabilitacao'],
      ['fas fa-wheelchair',      'Cadeira de rodas',     'reabilitacao acessibilidade'],
      ['fas fa-person-cane',     'Bengala',              'idoso reabilitacao'],
      ['fas fa-person-walking',  'Pessoa caminhando',    'fisio reabilitacao'],
      ['fas fa-hand-holding-medical', 'Mão e cruz médica', 'cuidado atendimento'],
      ['fas fa-staff-snake',     'Caduceu',              'medicina simbolo'],
      ['fas fa-kit-medical',     'Maleta médica',        'primeiros socorros'],
      ['fas fa-briefcase-medical','Maleta médica 2',     'pronto atendimento'],
    ],

    'Financeiro': [
      ['fas fa-coins',           'Moedas',               'dinheiro caixa'],
      ['fas fa-dollar-sign',     'Cifrão',               'dolar dinheiro'],
      ['fas fa-sack-dollar',     'Saco de dinheiro',     'caixa receita'],
      ['fas fa-money-bill-wave', 'Nota de dinheiro',     'real reais'],
      ['fas fa-money-bill-trend-up', 'Receita crescente','aumento ganho'],
      ['fas fa-piggy-bank',      'Cofrinho',             'economia poupanca'],
      ['fas fa-wallet',          'Carteira',             'pagamento'],
      ['fas fa-credit-card',     'Cartão',               'cobranca pagamento'],
      ['fas fa-receipt',         'Recibo',               'nota fiscal cupom'],
      ['fas fa-file-invoice-dollar', 'Fatura',           'boleto pagamento'],
      ['fas fa-calculator',      'Calculadora',          'orcamento contas'],
      ['fas fa-scale-balanced',  'Balança',              'equilibrio resultado'],
      ['fas fa-hand-holding-dollar', 'Mão com dinheiro', 'pagamento doacao'],
      ['fas fa-vault',           'Cofre',                'reserva guardado'],
      ['fas fa-landmark',        'Banco',                'instituicao financeira'],
      ['fas fa-percent',          'Porcentagem',         'taxa juros'],
    ],

    'Dados': [
      ['fas fa-chart-bar',       'Gráfico de barras',    'analise estatistica'],
      ['fas fa-chart-column',    'Colunas',              'analise grafico'],
      ['fas fa-chart-line',      'Gráfico de linha',     'tendencia evolucao'],
      ['fas fa-chart-area',      'Gráfico de área',      'analise tendencia'],
      ['fas fa-chart-pie',       'Pizza',                'distribuicao percentual'],
      ['fas fa-chart-simple',    'Gráfico simples',      'analise dashboard'],
      ['fas fa-gauge-high',      'Velocímetro',          'indicador kpi performance anahp'],
      ['fas fa-gauge',           'Medidor',              'kpi indicador'],
      ['fas fa-tachograph-digital', 'Painel digital',    'monitor dashboard'],
      ['fas fa-magnifying-glass-chart', 'Lupa em gráfico', 'pesquisa analise'],
      ['fas fa-magnifying-glass-dollar', 'Lupa financeira', 'analise financeira'],
      ['fas fa-square-poll-vertical', 'Enquete',         'votacao pesquisa'],
      ['fas fa-arrow-trend-up',  'Tendência alta',       'crescimento subida'],
      ['fas fa-arrow-trend-down','Tendência baixa',      'queda reducao'],
      ['fas fa-bullseye',        'Alvo',                 'meta objetivo'],
      ['fas fa-bullseye-arrow',  'Alvo com flecha',      'meta objetivo bsc'],
      ['fas fa-database',        'Banco de dados',       'dados storage'],
      ['fas fa-server',          'Servidor',             'infra dados'],
      ['fas fa-table',           'Tabela',               'planilha dados'],
      ['fas fa-table-cells',     'Células',              'tabela planilha'],
      ['fas fa-filter',          'Filtro',               'pesquisa segmentacao'],
    ],

    'Pessoas': [
      ['fas fa-users',           'Pessoas',              'time grupo'],
      ['fas fa-user',            'Pessoa',               'usuario perfil'],
      ['fas fa-user-tie',        'Profissional',         'gestor lider'],
      ['fas fa-user-gear',       'Usuário e engrenagem','admin permissao'],
      ['fas fa-user-shield',     'Usuário protegido',    'seguranca acesso'],
      ['fas fa-user-check',      'Usuário verificado',   'aprovacao validacao'],
      ['fas fa-user-plus',       'Adicionar usuário',    'cadastro novo'],
      ['fas fa-user-group',      'Grupo de usuários',    'time equipe'],
      ['fas fa-people-group',    'Grupo grande',         'comunidade equipe'],
      ['fas fa-people-arrows',   'Pessoas e setas',      'distanciamento interacao'],
      ['fas fa-handshake',       'Aperto de mão',        'parceria acordo'],
      ['fas fa-hand-holding-heart', 'Mão com coração',   'doador doacao teleton'],
      ['fas fa-id-badge',        'Crachá',               'identificacao funcionario'],
      ['fas fa-id-card',         'Carteira de identidade','rg cpf documento'],
      ['fas fa-address-book',    'Agenda',               'contatos'],
      ['fas fa-graduation-cap',  'Capelo',               'formacao educacao treinamento'],
    ],

    'Suprimentos': [
      ['fas fa-box',             'Caixa',                'estoque embalagem'],
      ['fas fa-box-open',        'Caixa aberta',         'estoque entrega'],
      ['fas fa-boxes-stacked',   'Caixas empilhadas',    'estoque armazem'],
      ['fas fa-warehouse',       'Armazém',              'estoque deposito'],
      ['fas fa-truck',           'Caminhão',             'logistica entrega'],
      ['fas fa-truck-fast',      'Caminhão rápido',      'expressa logistica'],
      ['fas fa-truck-medical',   'Ambulância',           'samu emergencia'],
      ['fas fa-cart-shopping',   'Carrinho de compras',  'compra pedido'],
      ['fas fa-cart-flatbed',    'Carrinho industrial',  'transporte material'],
      ['fas fa-pallet',          'Pallet',               'logistica armazem'],
      ['fas fa-dolly',           'Carrinho',             'logistica transporte'],
      ['fas fa-clipboard-list',  'Prancheta com lista',  'pedido inventario opme'],
      ['fas fa-clipboard-check', 'Checklist',            'aprovacao verificacao'],
      ['fas fa-tag',             'Etiqueta',             'precificacao categoria'],
      ['fas fa-tags',            'Etiquetas',            'categorias precos'],
      ['fas fa-barcode',         'Código de barras',     'sku produto'],
    ],

    'Operação': [
      ['fas fa-calendar-check',  'Agenda confirmada',    'agendamento atendimento'],
      ['fas fa-calendar-day',    'Dia',                  'agenda hoje'],
      ['fas fa-calendar-days',   'Dias',                 'agenda semana mes'],
      ['fas fa-clock',           'Relógio',              'tempo prazo'],
      ['fas fa-stopwatch',       'Cronômetro',           'tempo medicao'],
      ['fas fa-hourglass-half',  'Ampulheta',            'aguardando processo'],
      ['fas fa-list',            'Lista',                'tarefas itens'],
      ['fas fa-list-check',      'Lista verificada',     'tarefas concluidas'],
      ['fas fa-tasks',           'Tarefas',              'projeto pendencias'],
      ['fas fa-diagram-project', 'Diagrama de projeto',  'fluxo workflow'],
      ['fas fa-sitemap',         'Estrutura',            'organograma hierarquia'],
      ['fas fa-network-wired',   'Rede',                 'conexao infra'],
      ['fas fa-route',           'Rota',                 'caminho fluxo'],
      ['fas fa-flag',            'Bandeira',             'meta marco'],
      ['fas fa-flag-checkered',  'Bandeira final',       'finalizacao meta'],
    ],

    'Comunicação': [
      ['fas fa-envelope',        'Envelope',             'email mensagem'],
      ['fas fa-comment',         'Comentário',           'mensagem'],
      ['fas fa-comments',        'Comentários',          'chat conversa'],
      ['fas fa-message',         'Mensagem',             'chat'],
      ['fas fa-bell',            'Sino',                 'notificacao alerta'],
      ['fas fa-bullhorn',        'Megafone',             'comunicado anuncio'],
      ['fas fa-paper-plane',     'Avião de papel',       'envio mensagem'],
      ['fas fa-headset',         'Headset',              'atendimento telemedicina'],
      ['fas fa-phone',           'Telefone',             'ligacao contato'],
      ['fas fa-share-nodes',     'Compartilhar',         'social rede'],
      ['fas fa-rss',             'RSS',                  'feed noticias'],
    ],

    'Sistema': [
      ['fas fa-home',            'Casa',                 'inicio principal'],
      ['fas fa-house',           'Casa moderna',         'inicio principal'],
      ['fas fa-gear',            'Engrenagem',           'configuracao admin'],
      ['fas fa-cogs',            'Engrenagens',          'sistemas configuracao'],
      ['fas fa-screwdriver-wrench', 'Ferramentas',       'manutencao admin'],
      ['fas fa-shield-halved',   'Escudo',               'seguranca permissao'],
      ['fas fa-lock',            'Cadeado',              'seguranca privado'],
      ['fas fa-unlock',          'Cadeado aberto',       'liberado'],
      ['fas fa-key',             'Chave',                'acesso senha'],
      ['fas fa-folder',          'Pasta',                'arquivo categoria'],
      ['fas fa-folder-open',     'Pasta aberta',         'arquivos categoria'],
      ['fas fa-file',            'Arquivo',              'documento'],
      ['fas fa-file-lines',      'Documento',            'relatorio texto'],
      ['fas fa-cloud',           'Nuvem',                'cloud servico'],
      ['fas fa-circle-info',     'Informação',           'ajuda detalhe'],
      ['fas fa-circle-question', 'Ajuda',                'duvida tutorial'],
      ['fas fa-circle-check',    'Validado',             'ok aprovado'],
      ['fas fa-circle-exclamation', 'Atenção',           'alerta aviso'],
      ['fas fa-link',            'Link',                 'conexao url'],
      ['fas fa-globe',           'Globo',                'internet web'],
      ['fas fa-star',            'Estrela',              'favorito destaque'],
      ['fas fa-bookmark',        'Marcador',             'salvo favorito'],
      ['fas fa-thumbtack',       'Tachinha',             'fixar pin'],
    ],
  };

  // ordem das tabs
  const CATEGORY_ORDER = [
    'Todos','Assistencial','Financeiro','Dados','Pessoas',
    'Suprimentos','Operação','Comunicação','Sistema','Clássicos'
  ];

  // -------------------------------------------------------------
  // 3) Helpers
  // -------------------------------------------------------------
  const escapeHtml = (text) => {
    if (window.PortalUtils && typeof window.PortalUtils.escapeHtml === 'function') {
      return window.PortalUtils.escapeHtml(text);
    }
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const isSvgString = (s) => {
    if (window.PortalUtils && typeof window.PortalUtils.isSvgString === 'function') {
      return window.PortalUtils.isSvgString(s);
    }
    return typeof s === 'string' && s.trim().startsWith('<svg');
  };
  const isIconClass = (s) => {
    if (window.PortalUtils && typeof window.PortalUtils.isIconClass === 'function') {
      return window.PortalUtils.isIconClass(s);
    }
    return typeof s === 'string' && /^(fa[srlbd]?\s+fa-[a-z0-9-]+|fa-[a-z0-9-]+)/i.test(s.trim());
  };

  // normaliza string p/ busca (sem acento, lower)
  const norm = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();

  // -------------------------------------------------------------
  // 4) Construção do índice unificado
  // -------------------------------------------------------------
  // cada item: { value, html, label, search, category }
  function buildIndex() {
    const items = [];

    // Categorias FA
    Object.entries(CATALOG).forEach(([cat, list]) => {
      list.forEach(([cls, label, extra]) => {
        items.push({
          value: cls,
          label,
          category: cat,
          search: norm([cls, label, extra, cat].join(' ')),
          html: `<i class="${cls}"></i>`,
          isFa: true,
        });
      });
    });

    // Clássicos: SVGs do palette legacy
    LEGACY_SVGS.forEach((svg, idx) => {
      const key = `svg-${idx}`;
      const label = SVG_NAMES[idx] || `Ícone SVG ${idx + 1}`;
      items.push({
        value: key,
        label,
        category: 'Clássicos',
        search: norm([label, key, 'svg legacy'].join(' ')),
        html: svg,
        isFa: false,
        isSvg: true,
      });
    });

    // Clássicos: emojis
    LEGACY_EMOJIS.forEach((emo) => {
      items.push({
        value: emo,
        label: emo,
        category: 'Clássicos',
        search: norm(emo + ' emoji'),
        html: `<span style="font-size:18px;line-height:1;">${escapeHtml(emo)}</span>`,
        isFa: false,
        isEmoji: true,
      });
    });

    return items;
  }

  // mapa svg-N -> svg cru (compat com chamadas antigas)
  const SVG_KEY_MAP = {};
  LEGACY_SVGS.forEach((svg, idx) => { SVG_KEY_MAP[`svg-${idx}`] = svg; });

  // -------------------------------------------------------------
  // 5) Estado por dropdown (categoria/busca atuais)
  // -------------------------------------------------------------
  const dropdownState = new WeakMap();

  // -------------------------------------------------------------
  // 6) PortalIcons público
  // -------------------------------------------------------------
  const PortalIcons = {
    // mantém propriedades expostas anteriormente p/ qualquer caller externo
    ICON_PALETTE: [...LEGACY_SVGS, ...LEGACY_EMOJIS],
    ICON_MAP: SVG_KEY_MAP,
    SVG_NAMES,

    _initIconMap() { /* já feito acima — kept for back-compat */ },

    // ---- conversões ----
    svgToKey(iconValue) {
      if (!iconValue || typeof iconValue !== 'string') return iconValue;
      if (iconValue.startsWith('svg-') && SVG_KEY_MAP[iconValue]) return iconValue;
      if (!iconValue.trim().startsWith('<svg')) return iconValue;
      for (const [k, v] of Object.entries(SVG_KEY_MAP)) if (v === iconValue) return k;
      return iconValue;
    },

    svgKeyLabel(key) {
      if (typeof key === 'string' && key.startsWith('svg-')) {
        const idx = parseInt(key.split('-')[1], 10);
        return SVG_NAMES[idx] || `Ícone SVG ${idx + 1}`;
      }
      return key;
    },

    // resolve qualquer valor armazenado para HTML renderizável
    _resolveHtml(icon) {
      if (!icon) return '';
      if (typeof icon === 'string' && icon.startsWith('svg-') && SVG_KEY_MAP[icon]) {
        return SVG_KEY_MAP[icon];
      }
      if (isSvgString(icon)) return icon;
      if (isIconClass(icon)) return `<i class="${escapeHtml(icon)}"></i>`;
      return `<span style="font-size:18px;line-height:1;">${escapeHtml(icon)}</span>`;
    },

    _resolveLabel(icon) {
      if (!icon) return '';
      if (typeof icon === 'string' && icon.startsWith('svg-')) return this.svgKeyLabel(icon);
      if (isSvgString(icon)) return 'Ícone SVG';
      if (isIconClass(icon)) {
        // tenta achar label no catálogo
        for (const list of Object.values(CATALOG)) {
          for (const [cls, label] of list) if (cls === icon) return label;
        }
        return icon;
      }
      return icon;
    },

    // ---- render para sidebar/cards (chamado por menu.js / pages.js) ----
    renderIconHTML(icon) {
      if (!icon) return '<span class="menu-icon"></span>';
      let html;
      if (typeof icon === 'string' && icon.startsWith('svg-') && SVG_KEY_MAP[icon]) {
        html = SVG_KEY_MAP[icon];
      } else if (isSvgString(icon)) {
        html = icon;
      } else if (isIconClass(icon)) {
        html = `<i class="${escapeHtml(icon)}"></i>`;
      } else {
        return `<span class="menu-icon">${escapeHtml(icon)}</span>`;
      }
      return `<span class="menu-icon">${html}</span>`;
    },

    // ---- preview helpers (usados pelo admin.js) ----
    _setPreview(elementId, icon) {
      const preview = document.getElementById(elementId);
      if (!preview) return;
      if (!icon) { preview.innerHTML = ''; return; }
      preview.innerHTML = this._resolveHtml(icon);
    },
    updateIconPreview(icon)     { this._setPreview('menuIconPreview', icon); },
    updatePageIconPreview(icon) { this._setPreview('pageIconPreview', icon); },
    updateHomeIconPreview(icon) { this._setPreview('homeIconPreview', icon); },

    // ---- selected (chip do dropdown) ----
    _setDropdownSelected(selectedEl, icon, placeholder) {
      if (!selectedEl) return;
      if (!icon) {
        selectedEl.innerHTML = `<span style="color:var(--portal-text-muted,#999);">${placeholder}</span>`;
        return;
      }
      const html  = this._resolveHtml(icon);
      const label = this._resolveLabel(icon);
      selectedEl.innerHTML = `
        <span class="picker-selected-icon">${html}</span>
        <span class="picker-selected-label">${escapeHtml(label)}</span>
      `;
    },
    setDropdownValueForIcon(icon) {
      this._setDropdownSelected(document.getElementById('iconDropdownSelected'),     icon, 'Selecione um ícone...');
    },
    setPageDropdownValueForIcon(icon) {
      this._setDropdownSelected(document.getElementById('pageIconDropdownSelected'), icon, 'Selecione um ícone...');
    },
    setHomeDropdownValueForIcon(icon) {
      this._setDropdownSelected(document.getElementById('homeIconDropdownSelected'), icon, 'Selecione um ícone para Home...');
    },

    // ---- builder único e configurável ----
    _wirePicker(config) {
      // config: { containerId, menuId, toggleId, selectedId, inputId, placeholder, updatePreview, setSelected }
      const containers = document.querySelectorAll('#' + config.containerId);
      if (!containers.length) return;

      containers.forEach((container) => {
        const menu      = container.querySelector('#' + config.menuId);
        const toggle    = container.querySelector('#' + config.toggleId);
        const selected  = container.querySelector('#' + config.selectedId);
        if (!menu || !toggle || !selected) return;

        // marca container p/ estilização específica
        container.classList.add('icon-picker');

        // Reconstrói a estrutura interna do menu
        menu.classList.add('icon-picker-menu');
        menu.innerHTML = `
          <div class="icon-picker-search">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Buscar ícone..." aria-label="Buscar ícone">
            <button type="button" class="icon-picker-clear" title="Limpar" aria-label="Limpar busca">
              <i class="fas fa-times-circle"></i>
            </button>
          </div>
          <div class="icon-picker-tabs" role="tablist"></div>
          <div class="icon-picker-grid" role="listbox"></div>
          <div class="icon-picker-empty" hidden>
            <i class="fas fa-face-frown"></i>
            <span>Nenhum ícone encontrado</span>
          </div>
        `;

        const searchInput = menu.querySelector('.icon-picker-search input');
        const clearBtn    = menu.querySelector('.icon-picker-clear');
        const tabsEl      = menu.querySelector('.icon-picker-tabs');
        const gridEl      = menu.querySelector('.icon-picker-grid');
        const emptyEl     = menu.querySelector('.icon-picker-empty');

        // estado
        const state = { category: 'Todos', query: '' };
        dropdownState.set(container, state);

        const ALL = buildIndex();

        // tabs
        CATEGORY_ORDER.forEach((cat) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'icon-picker-tab' + (cat === 'Todos' ? ' is-active' : '');
          btn.setAttribute('role', 'tab');
          btn.dataset.category = cat;
          btn.textContent = cat;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.category = cat;
            tabsEl.querySelectorAll('.icon-picker-tab').forEach(t =>
              t.classList.toggle('is-active', t.dataset.category === cat));
            renderGrid();
          });
          tabsEl.appendChild(btn);
        });

        // render grid
        const renderGrid = () => {
          const q = norm(state.query);
          const cat = state.category;
          const filtered = ALL.filter((it) => {
            if (cat !== 'Todos' && it.category !== cat) return false;
            if (q && !it.search.includes(q)) return false;
            return true;
          });

          gridEl.innerHTML = '';
          if (!filtered.length) {
            emptyEl.hidden = false;
            return;
          }
          emptyEl.hidden = true;

          // botão "Nenhum / Personalizar" sempre primeiro quando sem busca em "Todos"
          if (!q && cat === 'Todos') {
            const noneBtn = document.createElement('button');
            noneBtn.type = 'button';
            noneBtn.className = 'icon-picker-cell is-none';
            noneBtn.title = 'Nenhum / personalizar';
            noneBtn.innerHTML = `<span class="icon-picker-cell-icon"><i class="fas fa-ban"></i></span>
                                 <span class="icon-picker-cell-label">Nenhum</span>`;
            noneBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById(config.inputId);
              if (input) {
                input.value = '';
                config.updatePreview('');
                input.dispatchEvent(new Event('input'));
              }
              config.setSelected('');
              menu.style.display = 'none';
            });
            gridEl.appendChild(noneBtn);
          }

          const frag = document.createDocumentFragment();
          filtered.forEach((it) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'icon-picker-cell';
            cell.title = it.label;
            cell.dataset.value = it.value;
            cell.innerHTML = `
              <span class="icon-picker-cell-icon">${it.html}</span>
              <span class="icon-picker-cell-label">${escapeHtml(it.label)}</span>
            `;
            cell.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById(config.inputId);
              if (input) {
                input.value = it.value;
                config.updatePreview(it.value);
                input.dispatchEvent(new Event('input'));
              }
              config.setSelected(it.value);
              menu.style.display = 'none';
            });
            frag.appendChild(cell);
          });
          gridEl.appendChild(frag);
        };

        // busca
        searchInput.addEventListener('input', () => {
          state.query = searchInput.value;
          clearBtn.style.visibility = state.query ? 'visible' : 'hidden';
          renderGrid();
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { menu.style.display = 'none'; }
        });
        clearBtn.style.visibility = 'hidden';
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          searchInput.value = '';
          state.query = '';
          clearBtn.style.visibility = 'hidden';
          renderGrid();
          searchInput.focus();
        });

        // primeiro render
        renderGrid();

        // toggle (clona p/ remover listeners antigos)
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);

        newToggle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isOpen = menu.style.display === 'block';
          // fecha outros pickers
          document.querySelectorAll('.icon-picker-menu').forEach((m) => {
            if (m !== menu) m.style.display = 'none';
          });
          if (isOpen) {
            menu.style.display = 'none';
          } else {
            menu.style.display = 'block';
            // foco na busca
            setTimeout(() => searchInput.focus(), 50);
            const closeHandler = (event) => {
              if (!container.contains(event.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeHandler);
              }
            };
            requestAnimationFrame(() => document.addEventListener('click', closeHandler));
          }
        });
      });
    },

    buildAllPalettes() {
      this.buildIconPalette();
      this.buildPageIconPalette();
      this.buildHomeIconPalette();
    },
    buildIconPalette() {
      this._wirePicker({
        containerId: 'iconDropdown',
        menuId:      'iconDropdownMenu',
        toggleId:    'iconDropdownToggle',
        selectedId:  'iconDropdownSelected',
        inputId:     'menuIconInput',
        placeholder: 'Selecione um ícone...',
        updatePreview: (v) => this.updateIconPreview(v),
        setSelected:   (v) => this.setDropdownValueForIcon(v),
      });
    },
    buildPageIconPalette() {
      this._wirePicker({
        containerId: 'pageIconDropdown',
        menuId:      'pageIconDropdownMenu',
        toggleId:    'pageIconDropdownToggle',
        selectedId:  'pageIconDropdownSelected',
        inputId:     'pageIconInput',
        placeholder: 'Selecione um ícone...',
        updatePreview: (v) => this.updatePageIconPreview(v),
        setSelected:   (v) => this.setPageDropdownValueForIcon(v),
      });
    },
    buildHomeIconPalette() {
      this._wirePicker({
        containerId: 'homeIconDropdown',
        menuId:      'homeIconDropdownMenu',
        toggleId:    'homeIconDropdownToggle',
        selectedId:  'homeIconDropdownSelected',
        inputId:     'homeIconInput',
        placeholder: 'Selecione um ícone para Home...',
        updatePreview: (v) => this.updateHomeIconPreview(v),
        setSelected:   (v) => this.setHomeDropdownValueForIcon(v),
      });
    },
  };

  // -------------------------------------------------------------
  // 7) Exposição global (mantém TODA a API antiga)
  // -------------------------------------------------------------
  window.PortalIcons = PortalIcons;

  window.updateIconPreview        = (icon) => PortalIcons.updateIconPreview(icon);
  window.updatePageIconPreview    = (icon) => PortalIcons.updatePageIconPreview(icon);
  window.updateHomeIconPreview    = (icon) => PortalIcons.updateHomeIconPreview(icon);
  window.setDropdownValueForIcon  = (icon) => PortalIcons.setDropdownValueForIcon(icon);
  window.setPageDropdownValueForIcon = (icon) => PortalIcons.setPageDropdownValueForIcon(icon);
  window.setHomeDropdownValueForIcon = (icon) => PortalIcons.setHomeDropdownValueForIcon(icon);
  window.buildIconPalette         = () => PortalIcons.buildIconPalette();
  window.buildPageIconPalette     = () => PortalIcons.buildPageIconPalette();
  window.buildHomeIconPalette     = () => PortalIcons.buildHomeIconPalette();

  console.log('[PortalIcons v2] carregado — catálogo:',
    Object.values(CATALOG).reduce((n, l) => n + l.length, 0) + LEGACY_SVGS.length + LEGACY_EMOJIS.length, 'ícones');
})();

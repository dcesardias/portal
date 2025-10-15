window.PortalIcons = {
    ICON_PALETTE: [
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-dollar-sign" aria-hidden="true"><line x1="12" x2="12" y1="2" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="18" y1="20" x2="18" y2="14"></line></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pie-chart" aria-hidden="true"><path d="M21 12A9 9 0 1 1 12 3v9z"></path><path d="M12 12h9"></path></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-.33-1.82L4.21 7.1A2 2 0 1 1 7 4.21l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="M3 9l9-7 9 7"></path><path d="M9 22V12h6v10"></path></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M4 21v-2a4 4 0 0 1 3-3.87"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
        '📊','📈','📉','💹','📋','📑','💼','🎯','💰','📌'
    ],

    ICON_MAP: {},

    renderIconHTML(icon) {
        if (!icon) {
            return '<span class="menu-icon"></span>';
        }
        
        if (window.PortalUtils && window.PortalUtils.isSvgString(icon)) {
            return `<span class="menu-icon">${icon}</span>`;
        }
        
        if (window.PortalUtils && window.PortalUtils.isIconClass(icon)) {
            return `<span class="menu-icon"><i class="${window.PortalUtils.escapeHtml(icon)}"></i></span>`;
        }
        
        const span = document.createElement('span');
        span.className = 'menu-icon';
        span.textContent = String(icon);
        return span.outerHTML;
    },

    updateIconPreview(icon) {
        const preview = document.getElementById('menuIconPreview');
        if (!preview) return;
        
        if (!icon) {
            preview.innerHTML = '';
            return;
        }

        let resolved = icon;
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
        }

        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            preview.innerHTML = resolved;
            return;
        }
        
        if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            preview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}"></i>`;
            return;
        }
        
        const span = document.createElement('span');
        span.textContent = String(resolved);
        preview.innerHTML = '';
        preview.appendChild(span);
    },

    updatePageIconPreview(icon) {
        const preview = document.getElementById('pageIconPreview');
        if (!preview) return;
        
        if (!icon) {
            preview.innerHTML = '';
            return;
        }

        let resolved = icon;
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
        }

        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            preview.innerHTML = resolved;
            return;
        }
        
        if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            preview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}"></i>`;
            return;
        }
        
        const span = document.createElement('span');
        span.textContent = String(resolved);
        preview.innerHTML = '';
        preview.appendChild(span);
    },

    updateHomeIconPreview(icon) {
        const preview = document.getElementById('homeIconPreview');
        if (!preview) return;
        
        if (!icon) {
            preview.innerHTML = '';
            return;
        }

        let resolved = icon;
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
        }

        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            preview.innerHTML = resolved;
            return;
        }
        
        if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            preview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}"></i>`;
            return;
        }
        
        const span = document.createElement('span');
        span.textContent = String(resolved);
        preview.innerHTML = '';
        preview.appendChild(span);
    },

    setDropdownValueForIcon(icon) {
        const selected = document.getElementById('iconDropdownSelected');
        if (!selected) return;
        
        if (!icon) {
            selected.innerHTML = '<span style="color:#999;">Selecione um ícone...</span>';
            return;
        }
        
        selected.innerHTML = '';
        
        const iconPreview = document.createElement('span');
        iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
        
        let resolved = icon;
        let label = icon;
        
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
            label = `Ícone SVG ${icon.split('-')[1]}`;
        }
        
        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            iconPreview.innerHTML = resolved;
        } else if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            iconPreview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}" style="font-size:18px;"></i>`;
        } else {
            iconPreview.innerHTML = `<span style="font-size:18px;">${window.PortalUtils ? window.PortalUtils.escapeHtml(resolved) : resolved}</span>`;
        }
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        
        selected.appendChild(iconPreview);
        selected.appendChild(labelSpan);
    },

    setPageDropdownValueForIcon(icon) {
        const selected = document.getElementById('pageIconDropdownSelected');
        if (!selected) return;
        
        if (!icon) {
            selected.innerHTML = '<span style="color:#999;">Selecione um ícone...</span>';
            return;
        }
        
        selected.innerHTML = '';
        
        const iconPreview = document.createElement('span');
        iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
        
        let resolved = icon;
        let label = icon;
        
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
            label = `Ícone SVG ${icon.split('-')[1]}`;
        }
        
        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            iconPreview.innerHTML = resolved;
        } else if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            iconPreview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}" style="font-size:18px;"></i>`;
        } else {
            iconPreview.innerHTML = `<span style="font-size:18px;">${window.PortalUtils ? window.PortalUtils.escapeHtml(resolved) : resolved}</span>`;
        }
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        
        selected.appendChild(iconPreview);
        selected.appendChild(labelSpan);
    },

    setHomeDropdownValueForIcon(icon) {
        const selected = document.getElementById('homeIconDropdownSelected');
        if (!selected) return;
        
        if (!icon) {
            selected.innerHTML = '<span style="color:#999;">Selecione um ícone para Home...</span>';
            return;
        }
        selected.innerHTML = '';
        
        const iconPreview = document.createElement('span');
        iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
        
        let resolved = icon;
        let label = icon;
        if (typeof icon === 'string' && icon.startsWith('svg-') && this.ICON_MAP[icon]) {
            resolved = this.ICON_MAP[icon];
            label = `Ícone SVG ${icon.split('-')[1]}`;
        }
        if (window.PortalUtils && window.PortalUtils.isSvgString(resolved)) {
            iconPreview.innerHTML = resolved;
        } else if (window.PortalUtils && window.PortalUtils.isIconClass(resolved)) {
            iconPreview.innerHTML = `<i class="${window.PortalUtils.escapeHtml(resolved)}" style="font-size:18px;"></i>`;
        } else {
            iconPreview.innerHTML = `<span style="font-size:18px;">${window.PortalUtils ? window.PortalUtils.escapeHtml(resolved) : resolved}</span>`;
        }
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        selected.appendChild(iconPreview);
        selected.appendChild(labelSpan);
    },

    buildAllPalettes() {
        this.buildIconPalette();
        this.buildPageIconPalette();
        this.buildHomeIconPalette();
    },

    buildIconPalette() {
        // ...existing buildIconPalette logic from original...
        document.querySelectorAll('#iconDropdown').forEach(container => {
            const menu = container.querySelector('#iconDropdownMenu');
            const toggle = container.querySelector('#iconDropdownToggle');
            const selected = container.querySelector('#iconDropdownSelected');
            if (!menu || !toggle || !selected) return;

            menu.innerHTML = '';

            const createItemNode = (labelHtml, labelText, iconValue) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;';
                const iconPreview = document.createElement('span');
                iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
                iconPreview.innerHTML = labelHtml;
                const labelSpan = document.createElement('span');
                labelSpan.style.color = '#333';
                labelSpan.textContent = labelText;
                item.appendChild(iconPreview);
                item.appendChild(labelSpan);
                item.addEventListener('mouseover', () => item.style.backgroundColor = '#f5f5f5');
                item.addEventListener('mouseout', () => item.style.backgroundColor = '#fff');
                return { item, iconPreview, labelText, iconValue };
            };

            const emptyItem = createItemNode('<span style="color:#999;">∅</span>', '(Nenhum / Personalizar)', '');
            emptyItem.item.addEventListener('click', (e) => {
                e.stopPropagation();
                const input = document.getElementById('menuIconInput');
                if (input) {
                    input.value = '';
                    this.updateIconPreview('');
                    input.dispatchEvent(new Event('input'));
                }
                selected.innerHTML = '<span style="color:#999;">Selecione um ícone...</span>';
                menu.style.display = 'none';
            });
            menu.appendChild(emptyItem.item);

            this.ICON_PALETTE.forEach((ic, idx) => {
                let html = '';
                let label = '';
                if (window.PortalUtils && window.PortalUtils.isSvgString(ic)) {
                    const key = `svg-${idx}`;
                    this.ICON_MAP[key] = ic;
                    html = ic;
                    label = `Ícone SVG ${idx + 1}`;
                } else if (window.PortalUtils && window.PortalUtils.isIconClass(ic)) {
                    html = `<i class="${ic}" style="font-size:18px;"></i>`;
                    label = ic;
                } else {
                    const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
                    html = `<span style="font-size:18px;">${escapeHtml(ic)}</span>`;
                    label = ic;
                }
                const { item, iconPreview } = createItemNode(html, label, ic);
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const input = document.getElementById('menuIconInput');
                    if (input) {
                        input.value = ic;
                        this.updateIconPreview(ic);
                        input.dispatchEvent(new Event('input'));
                    }
                    selected.innerHTML = '';
                    selected.appendChild(iconPreview.cloneNode(true));
                    const lbl = document.createElement('span');
                    lbl.textContent = label;
                    selected.appendChild(lbl);
                    menu.style.display = 'none';
                });
                menu.appendChild(item);
            });

            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isOpen = menu.style.display === 'block';
                
                document.querySelectorAll('#iconDropdownMenu, #homeIconDropdownMenu, #pageIconDropdownMenu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                
                if (isOpen) {
                    menu.style.display = 'none';
                } else {
                    menu.style.display = 'block';
                    
                    const closeHandler = (event) => {
                        if (!container.contains(event.target)) {
                            menu.style.display = 'none';
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    
                    requestAnimationFrame(() => {
                        document.addEventListener('click', closeHandler);
                    });
                }
            });
        });
    },

    buildPageIconPalette() {
        document.querySelectorAll('#pageIconDropdown').forEach(container => {
            const menu = container.querySelector('#pageIconDropdownMenu');
            const toggle = container.querySelector('#pageIconDropdownToggle');
            const selected = container.querySelector('#pageIconDropdownSelected');
            if (!menu || !toggle || !selected) return;

            menu.innerHTML = '';

            const createItemNode = (labelHtml, labelText, iconValue) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;';
                const iconPreview = document.createElement('span');
                iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
                iconPreview.innerHTML = labelHtml;
                const labelSpan = document.createElement('span');
                labelSpan.style.color = '#333';
                labelSpan.textContent = labelText;
                item.appendChild(iconPreview);
                item.appendChild(labelSpan);
                item.addEventListener('mouseover', () => item.style.backgroundColor = '#f5f5f5');
                item.addEventListener('mouseout', () => item.style.backgroundColor = '#fff');
                return { item, iconPreview, labelText, iconValue };
            };

            const emptyItem = createItemNode('<span style="color:#999;">∅</span>', '(Nenhum / Personalizar)', '');
            emptyItem.item.addEventListener('click', (e) => {
                e.stopPropagation();
                const input = document.getElementById('pageIconInput');
                if (input) {
                    input.value = '';
                    this.updatePageIconPreview('');
                    input.dispatchEvent(new Event('input'));
                }
                selected.innerHTML = '<span style="color:#999;">Selecione um ícone...</span>';
                menu.style.display = 'none';
            });
            menu.appendChild(emptyItem.item);

            this.ICON_PALETTE.forEach((ic, idx) => {
                let html = '';
                let label = '';
                if (window.PortalUtils && window.PortalUtils.isSvgString(ic)) {
                    const key = `svg-${idx}`;
                    this.ICON_MAP[key] = ic;
                    html = ic;
                    label = `Ícone SVG ${idx + 1}`;
                } else if (window.PortalUtils && window.PortalUtils.isIconClass(ic)) {
                    html = `<i class="${ic}" style="font-size:18px;"></i>`;
                    label = ic;
                } else {
                    const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
                    html = `<span style="font-size:18px;">${escapeHtml(ic)}</span>`;
                    label = ic;
                }
                const { item, iconPreview } = createItemNode(html, label, ic);
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const input = document.getElementById('pageIconInput');
                    if (input) {
                        input.value = ic;
                        this.updatePageIconPreview(ic);
                        input.dispatchEvent(new Event('input'));
                    }
                    selected.innerHTML = '';
                    selected.appendChild(iconPreview.cloneNode(true));
                    const lbl = document.createElement('span');
                    lbl.textContent = label;
                    selected.appendChild(lbl);
                    menu.style.display = 'none';
                });
                menu.appendChild(item);
            });

            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isOpen = menu.style.display === 'block';
                
                document.querySelectorAll('#iconDropdownMenu, #homeIconDropdownMenu, #pageIconDropdownMenu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                
                if (isOpen) {
                    menu.style.display = 'none';
                } else {
                    menu.style.display = 'block';
                    
                    const closeHandler = (event) => {
                        if (!container.contains(event.target)) {
                            menu.style.display = 'none';
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    
                    requestAnimationFrame(() => {
                        document.addEventListener('click', closeHandler);
                    });
                }
            });
        });
    },

    buildHomeIconPalette() {
        document.querySelectorAll('#homeIconDropdown').forEach(container => {
            const menu = container.querySelector('#homeIconDropdownMenu');
            const toggle = container.querySelector('#homeIconDropdownToggle');
            const selected = container.querySelector('#homeIconDropdownSelected');
            if (!menu || !toggle || !selected) return;

            menu.innerHTML = '';

            const createItemNode = (labelHtml, labelText, iconValue) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;';
                const iconPreview = document.createElement('span');
                iconPreview.style.cssText = 'width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;';
                iconPreview.innerHTML = labelHtml;
                const labelSpan = document.createElement('span');
                labelSpan.style.color = '#333';
                labelSpan.textContent = labelText;
                item.appendChild(iconPreview);
                item.appendChild(labelSpan);
                item.addEventListener('mouseover', () => item.style.backgroundColor = '#f5f5f5');
                item.addEventListener('mouseout', () => item.style.backgroundColor = '#fff');
                return { item, iconPreview, labelText, iconValue };
            };

            const emptyItem = createItemNode('<span style="color:#999;">∅</span>', '(Nenhum)', '');
            emptyItem.item.addEventListener('click', (e) => {
                e.stopPropagation();
                const input = document.getElementById('homeIconInput');
                if (input) {
                    input.value = '';
                    this.updateHomeIconPreview('');
                    input.dispatchEvent(new Event('input'));
                }
                selected.innerHTML = '<span style="color:#999;">Selecione um ícone para Home...</span>';
                menu.style.display = 'none';
            });
            menu.appendChild(emptyItem.item);

            this.ICON_PALETTE.forEach((ic, idx) => {
                let html = '';
                let label = '';
                if (window.PortalUtils && window.PortalUtils.isSvgString(ic)) {
                    const key = `svg-${idx}`;
                    this.ICON_MAP[key] = ic;
                    html = ic;
                    label = `Ícone SVG ${idx + 1}`;
                } else if (window.PortalUtils && window.PortalUtils.isIconClass(ic)) {
                    html = `<i class="${ic}" style="font-size:18px;"></i>`;
                    label = ic;
                } else {
                    const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
                    html = `<span style="font-size:18px;">${escapeHtml(ic)}</span>`;
                    label = ic;
                }
                const { item, iconPreview } = createItemNode(html, label, ic);
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const input = document.getElementById('homeIconInput');
                    if (input) {
                        input.value = ic;
                        this.updateHomeIconPreview(ic);
                        input.dispatchEvent(new Event('input'));
                    }
                    selected.innerHTML = '';
                    selected.appendChild(iconPreview.cloneNode(true));
                    const lbl = document.createElement('span');
                    lbl.textContent = label;
                    selected.appendChild(lbl);
                    menu.style.display = 'none';
                });
                menu.appendChild(item);
            });

            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isOpen = menu.style.display === 'block';
                
                document.querySelectorAll('#iconDropdownMenu, #homeIconDropdownMenu, #pageIconDropdownMenu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                
                if (isOpen) {
                    menu.style.display = 'none';
                } else {
                    menu.style.display = 'block';
                    
                    const closeHandler = (event) => {
                        if (!container.contains(event.target)) {
                            menu.style.display = 'none';
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    
                    requestAnimationFrame(() => {
                        document.addEventListener('click', closeHandler);
                    });
                }
            });
        });
    }
};

// Expor funções globais para compatibilidade
window.updateIconPreview = (icon) => window.PortalIcons.updateIconPreview(icon);
window.updatePageIconPreview = (icon) => window.PortalIcons.updatePageIconPreview(icon);
window.updateHomeIconPreview = (icon) => window.PortalIcons.updateHomeIconPreview(icon);
window.setDropdownValueForIcon = (icon) => window.PortalIcons.setDropdownValueForIcon(icon);
window.setPageDropdownValueForIcon = (icon) => window.PortalIcons.setPageDropdownValueForIcon(icon);
window.setHomeDropdownValueForIcon = (icon) => window.PortalIcons.setHomeDropdownValueForIcon(icon);
window.buildIconPalette = () => window.PortalIcons.buildIconPalette();
window.buildPageIconPalette = () => window.PortalIcons.buildPageIconPalette();
window.buildHomeIconPalette = () => window.PortalIcons.buildHomeIconPalette();

window.PortalUtils = {
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    isSvgString(icon) {
        return typeof icon === 'string' && icon.trim().startsWith('<svg');
    },

    isIconClass(icon) {
        if (!icon || typeof icon !== 'string') return false;
        if (this.isSvgString(icon)) return false;
        const trimmed = icon.trim();
        return /\bfa[srbn]?[\s-]/.test(trimmed) || trimmed.startsWith('fa') || /fa-/.test(trimmed);
    }
};

/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export function loadUrl(url: string, restoreScrollY = false) {
    if (restoreScrollY) {
        handleScrollPosition();
    }

    const link = document.createElement('a');
    link.href = url;
    link.style.position = 'absolute';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function reloadPage() {
    loadUrl(location.href, true);
}

function handleScrollPosition() {
    const scrollY = window.scrollY;
    if (scrollY === 0) return;

    function scrollendHandler() {
        if (window.scrollY === 0) {
            window.scrollTo(0, scrollY);
        }
        document.removeEventListener('scrollend', scrollendHandler);
    }
    document.addEventListener('scrollend', scrollendHandler);
    setTimeout(() => document.removeEventListener('scrollend', scrollendHandler), 3000);
}

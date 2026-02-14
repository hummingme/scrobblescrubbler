/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export function loadUrl(url: string, newTab: boolean = false) {
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';
    if (newTab) {
        link.target = '_blank';
    }
    document.body.append(link);
    link.click();
}

export function reloadPage() {
    loadUrl(location.href);
}

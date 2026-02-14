/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import type { LibrarySubject } from '../types/lastfm.ts';

export function itemLinkSubject(url: string): LibrarySubject | null {
    const path = url.split('/music/')[1];
    if (!path) return null;
    const parts = path.split('/');
    if (parts[0] === '+noredirect') {
        parts.shift();
    }
    if (parts.includes('+albums') || parts.includes('+tracks')) {
        return null;
    }
    const depth = parts.length;
    return depth === 1 ? 'artist' : depth === 2 ? 'album' : depth === 3 ? 'track' : null;
}

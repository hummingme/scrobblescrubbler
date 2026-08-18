/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrubblerDB } from '../services/database.ts';

const ignoredCache: Set<string> = new Set();

export function addIgnoredSameTitle(db: ScrubblerDB, title: string) {
    db.ignored_same_title.put({ album_name: title });
    ignoredCache.add(title);
}

export async function isIgnoredSameTitle(db: ScrubblerDB, title: string) {
    if (ignoredCache.has(title)) {
        return true;
    }
    const isIgnored = Boolean(await db.ignored_same_title.get(title));
    if (isIgnored) {
        ignoredCache.add(title);
    }
    return isIgnored;
}

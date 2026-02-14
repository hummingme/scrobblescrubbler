/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import type { Scrobble, ScrobbleField } from '../types/lastfm.ts';

export type CountMap = Map<string, number>;

export const UNNAMED_ENTRY = '\u200B< unnamed >\u200B';

export function mapScrobbleCounts(
    scrobbles: Scrobble[],
    property: ScrobbleField,
    compose?: (s: Scrobble) => string,
) {
    const countMap: CountMap = new Map();
    scrobbles.forEach((s) => {
        const key =
            s[property] === undefined
                ? UNNAMED_ENTRY
                : compose
                  ? compose(s)
                  : s[property];
        if (countMap.has(key)) {
            countMap.set(key, countMap.get(key)! + 1);
        } else {
            countMap.set(key, 1);
        }
    });
    return countMap;
}

export function tracksCountsTitle(countMap: CountMap) {
    if (countMap.size === 0) return '';
    const sortedEntries = [...countMap.entries()].sort((a, b) => {
        if (a[1] !== b[1]) {
            return b[1] - a[1]; // first by count
        } else {
            return a[0] < b[0] ? -1 : 1; // second by title
        }
    });
    const maxCount = sortedEntries[0][1];
    const maxLength = String(maxCount).length;
    const nameEntries = sortedEntries.map((entry) => {
        return `${String(entry[1]).padStart(maxLength, '\u2007')}x ${entry[0]}`;
    });
    return nameEntries.join('\n');
}

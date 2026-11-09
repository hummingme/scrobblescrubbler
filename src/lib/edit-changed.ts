/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import {
    EditAlbumFormValues,
    EditFormValues,
    ScrobbleFormBaseKey,
    ScrobbleFormOriginalKey,
} from '../types/lastfm.ts';

export function scrobbleChanged(values: EditFormValues) {
    const scrobbleFields: ScrobbleFormBaseKey[] = [
        'artist_name',
        'track_name',
        'album_artist_name',
        'album_name',
    ];
    return scrobbleFields.some((key) => {
        const originalKey: ScrobbleFormOriginalKey<typeof key> = `${key}_original`;
        return values[originalKey].toLowerCase() !== values[key].toLowerCase();
    });
}

export function albumChanged(values: EditAlbumFormValues) {
    return (
        values['album_name'].toLowerCase() !==
            values['album_name_original'].toLowerCase() ||
        values['album_artist_name'].toLowerCase() !==
            values['album_artist_name_original'].toLowerCase()
    );
}

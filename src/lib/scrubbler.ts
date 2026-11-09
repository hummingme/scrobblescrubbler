/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import type { Scrobble } from '../types/lastfm.ts';
import { ScrubblerItem } from '../types/scrubbler.ts';

export const emptyScrubblerItem = () => ({
    trackName: '',
    artistName: '',
    albumName: '',
    albumArtistName: '',
});

export const itemEqualsScrobble = (item: ScrubblerItem, scrobble: Scrobble) => {
    return (
        item.albumName === (scrobble.album_name || '') &&
        item.albumArtistName === (scrobble.album_artist_name || '') &&
        item.trackName === scrobble.track_name &&
        item.artistName === scrobble.artist_name
    );
};

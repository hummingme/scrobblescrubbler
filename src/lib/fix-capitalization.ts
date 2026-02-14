/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from '../services/database.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

export default async function fixCapitalization(
    item: ScrubblerItem,
    db: ScrobbleScrubblerDB,
): Promise<boolean> {
    const { artistName, trackName, albumName, albumArtistName } = item;
    const counts: Record<string, number> = {};
    if (artistName) {
        counts.artist = await fixArtistName(item, db);
    }
    if (trackName) {
        counts.track = await fixTrackName(item, db);
    }
    if (albumName) {
        counts.album = await fixAlbumName(item, db);
    }
    if (albumArtistName) {
        counts.albumArtist = await fixAlbumArtistName(item, db);
        if (!artistName) {
            item = Object.assign(structuredClone(item), { artistName: albumArtistName });
            counts.artist = await fixArtistName(item, db);
        }
    }
    return Object.entries(counts).filter((entry) => entry[1] > 0).length > 0;
}

async function fixArtistName(item: ScrubblerItem, db: ScrobbleScrubblerDB) {
    const { artistName } = item;
    return await db.scrobbles
        .where('artist_name')
        .equalsIgnoreCase(artistName)
        .and((scrobble) => scrobble.artist_name !== artistName)
        .modify({ artist_name: artistName });
}

async function fixTrackName(item: ScrubblerItem, db: ScrobbleScrubblerDB) {
    const { artistName, trackName } = item;
    return await db.scrobbles
        .where('track_name')
        .equalsIgnoreCase(trackName)
        .and((scrobble) => {
            return (
                scrobble.artist_name === artistName && scrobble.track_name !== trackName
            );
        })
        .modify({ track_name: trackName });
}

async function fixAlbumName(item: ScrubblerItem, db: ScrobbleScrubblerDB) {
    const { albumName, albumArtistName } = item;
    return await db.scrobbles
        .where('album_name')
        .equalsIgnoreCase(albumName)
        .and((scrobble) => {
            return (
                scrobble.album_artist_name === albumArtistName &&
                scrobble.album_name !== albumName
            );
        })
        .modify({ album_name: albumName });
}

async function fixAlbumArtistName(item: ScrubblerItem, db: ScrobbleScrubblerDB) {
    const { albumName, albumArtistName } = item;
    return await db.scrobbles
        .where('album_name')
        .equals(albumName)
        .and((scrobble) => {
            return (
                scrobble.album_artist_name !== albumArtistName &&
                String(scrobble.album_artist_name).toLowerCase() ===
                    albumArtistName.toLowerCase()
            );
        })
        .modify({ album_artist_name: albumArtistName });
}

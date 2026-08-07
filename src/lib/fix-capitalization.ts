/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from '../services/database.ts';
import type { Scrobble } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

export async function fixCapitalization(
    item: ScrubblerItem,
    db: ScrobbleScrubblerDB,
): Promise<boolean> {
    const { artistName, trackName, albumName, albumArtistName } = item;
    const counts: Record<string, number> = {};
    if (trackName) {
        counts.track = await fixTrackName(item, db);
    }
    if (albumName) {
        counts.album = await fixAlbumName(item, db);
    }
    if (!trackName && !albumName) {
        if (artistName) {
            counts.artist = await fixArtistName(item, db);
        }
        if (albumArtistName) {
            counts.albumArtist = await fixAlbumArtistName(item, db);
            if (!artistName) {
                item = Object.assign(structuredClone(item), {
                    artistName: albumArtistName,
                });
                counts.artist = await fixArtistName(item, db);
            }
        }
    }
    return Object.entries(counts).filter((entry) => entry[1] > 0).length > 0;
}

async function fixArtistName(item: ScrubblerItem, db: ScrobbleScrubblerDB) {
    const { artistName } = item;
    return await db.scrobbles
        .where('artist_name')
        .equalsIgnoreCase(artistName)
        .and((scrobble) => {
            return (
                scrobble.artist_name !== artistName &&
                (!item.trackName || scrobble.track_name === item.trackName) &&
                (!item.albumName || scrobble.album_name === item.albumName)
            );
        })
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

export async function hasDivergentAlbumCapitalizations(
    item: ScrubblerItem,
    db: ScrobbleScrubblerDB,
) {
    const divergent = await db.scrobbles
        .where('album_name')
        .equalsIgnoreCase(item.albumName)
        .and((scrobble: Scrobble) => {
            return (
                scrobble.album_artist_name === item.albumArtistName &&
                scrobble.album_name !== item.albumName
            );
        })
        .count();
    return Boolean(divergent);
}

export async function hasDivergentAlbumArtistCapitalizations(
    albumArtistName: string,
    db: ScrobbleScrubblerDB,
) {
    const divergentAlbumArtistName = Boolean(
        await db.scrobbles
            .where('album_artist_name')
            .equalsIgnoreCase(albumArtistName)
            .and((scrobble: Scrobble) => scrobble.album_artist_name !== albumArtistName)
            .count(),
    );
    const divergentArtistName = Boolean(
        await db.scrobbles
            .where('artist_name')
            .equalsIgnoreCase(albumArtistName)
            .and((scrobble: Scrobble) => scrobble.artist_name !== albumArtistName)
            .count(),
    );
    return divergentAlbumArtistName || divergentArtistName;
}

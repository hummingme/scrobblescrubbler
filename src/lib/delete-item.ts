/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getUserName } from './lastfm-page.ts';
import { openDatabase, ScrubblerDB } from '../services/database.ts';
import { log } from '../services/logger.ts';
import { LibrarySubject, Scrobble } from '../types/lastfm.ts';
import { ScrubblerItem } from '../types/scrubbler.ts';

export async function externalDeleteItem(subject: LibrarySubject, item: ScrubblerItem) {
    const userName = getUserName();
    const db = await openDatabase(userName);
    await deleteItemData(subject, item, db);
}

async function deleteItemData(
    subject: LibrarySubject,
    item: ScrubblerItem,
    db: ScrubblerDB,
) {
    const { trackName, artistName, albumName, albumArtistName } = item;
    let count = 0;
    await db
        .transaction('rw', db.scrobbles, db.settings, async () => {
            if (subject === 'track' && trackName && artistName) {
                count = await db.scrobbles
                    .where('track_name')
                    .equalsIgnoreCase(trackName)
                    .and(
                        (scrobble: Scrobble) =>
                            scrobble.artist_name.toLowerCase() ===
                            artistName.toLowerCase(),
                    )
                    .delete();
            } else if (subject === 'album' && albumName && albumArtistName) {
                count = await db.scrobbles
                    .where('album_name')
                    .equalsIgnoreCase(albumName)
                    .and(
                        (scrobble: Scrobble) =>
                            String(scrobble.album_artist_name).toLowerCase() ===
                            albumArtistName.toLowerCase(),
                    )
                    .delete();
            } else if (subject === 'artist' && artistName) {
                count = await db.scrobbles
                    .where('artist_name')
                    .equalsIgnoreCase(artistName)
                    .delete();
            }
            log(
                `deleteItemData deleted data of ${count} ${subject} scrobble${count > 1 ? 's' : ''}`,
            );
            await db.settings
                .where('name')
                .equals('scrobblesCount')
                .modify((setting) => {
                    (setting.value as number) -= count;
                });
        })
        .catch((err) => {
            throw Error('deleteAutomaticEdit', err);
        });
}

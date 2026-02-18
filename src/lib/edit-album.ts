/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getUserName } from './lastfm-page.ts';
import { openDatabase } from '../services/database.ts';
import { log } from '../services/logger.ts';
import type { EditAlbumFormValues, Scrobble } from '../types/lastfm.ts';

export async function externalEditAlbum(data: EditAlbumFormValues) {
    const userName = getUserName();
    const db = await openDatabase(userName);
    const count = await db
        .transaction('rw', db.scrobbles, async () => {
            return await db.scrobbles
                .where('album_name')
                .equalsIgnoreCase(data.album_name_original)
                .and(
                    (scrobble: Scrobble) =>
                        data.album_artist_name_original.toLowerCase() ===
                        scrobble.album_artist_name?.toLowerCase(),
                )
                .modify({
                    album_name: data.album_name,
                    album_artist_name: data.album_artist_name,
                });
        })
        .catch((error) => {
            throw Error('updateScrobble', error);
        });
    log(`externalEditScrobble, updated ${count} scrobbles`, data);
}

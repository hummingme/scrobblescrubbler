/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getUserUrl, getUserName } from './lastfm-page.ts';
import postRequest from './post-request.ts';
import { openDatabase, ScrobbleScrubblerDB } from '../services/database.ts';
import { error, log } from '../services/logger.ts';
import Settings from '../services/settings.ts';
import EditsFetcher from '../services/edits-fetcher.ts';
import type {
    EditFormValues,
    ExtendedEditFormValues,
    Scrobble,
} from '../types/lastfm.ts';
import type { EditScrobbleJob } from '../types/jobs.ts';

export default async function editScrobble(
    job: EditScrobbleJob,
    db: ScrobbleScrubblerDB,
) {
    const url = `${getUserUrl()}/library/edit-track?edited-variation=library-track-scrobble`;
    const { csrfmiddlewaretoken } = await new Settings(db).get(['csrfmiddlewaretoken']);
    const data = job.data;

    const formData = new FormData();
    formData.append('csrfmiddlewaretoken', csrfmiddlewaretoken);
    for (const [name, value] of Object.entries(data)) {
        if (typeof value === 'string') {
            formData.append(name, value);
        }
    }
    const response = await postRequest(url, formData);

    if (response.status === 200) {
        await db
            .transaction('rw', db.scrobbles, async () => {
                const { track_name, artist_name, album_name, album_artist_name } =
                    await normalizeCapitalization(data, db);

                return await db.scrobbles
                    .where('track_name')
                    .equals(data.track_name_original)
                    .and(
                        (scrobble: Scrobble) =>
                            data.artist_name_original === scrobble.artist_name &&
                            (data.album_name_original === scrobble.album_name ||
                                (data.album_name_original === '' &&
                                    scrobble.album_name === undefined)) &&
                            (data.album_artist_name_original ===
                                scrobble.album_artist_name ||
                                (data.album_artist_name_original === '' &&
                                    scrobble.album_artist_name === undefined)),
                    )
                    .modify({
                        artist_name,
                        track_name,
                        album_name,
                        album_artist_name,
                    });
            })
            .catch((error) => {
                throw Error('editScrobble', error);
            });
        if (job.data.create_automatic_edit_rule === 'on') {
            await maintainEdits(data, db);
        }
        return { job, success: true };
    } else {
        return { job, success: false };
    }
}

/*
 * Use the capitalization for the data that is already present in the database.
 * When the result is overall wrong, the capitalization will be corrected when displayed.
 * With mixed capitalization, incorrect numbers would be determined and displayed.
 */
async function normalizeCapitalization(data: EditFormValues, db: ScrobbleScrubblerDB) {
    let { track_name, artist_name, album_name, album_artist_name } = data;
    const artistScrobble = await db.scrobbles
        .where('artist_name')
        .equalsIgnoreCase(artist_name)
        .first();
    if (artistScrobble) {
        artist_name = artistScrobble.artist_name;
    }

    const trackScrobble = await db.scrobbles
        .where('track_name')
        .equalsIgnoreCase(track_name)
        .and(
            (scrobble: Scrobble) =>
                artist_name.toLowerCase() === scrobble.artist_name.toLowerCase(),
        )
        .first();
    if (trackScrobble) {
        track_name = trackScrobble.track_name;
    }

    if (album_name !== '') {
        const albumScrobble = await db.scrobbles
            .where('album_name')
            .equalsIgnoreCase(album_name)
            .and(
                (scrobble: Scrobble) =>
                    album_artist_name.toLowerCase() ===
                    scrobble.album_artist_name?.toLowerCase(),
            )
            .first();
        if (albumScrobble) {
            album_name = albumScrobble.album_name || '';
            album_artist_name = albumScrobble.album_artist_name || '';
        }
    }
    return { track_name, artist_name, album_name, album_artist_name };
}

export async function externalEditScrobble(data: ExtendedEditFormValues) {
    const userName = getUserName();
    const db = await openDatabase(userName);
    const timestampCheck =
        data['edit_all'] === 'on'
            ? () => true
            : (dataTS: string, scrobbleTS: number) => Number(dataTS) === scrobbleTS;
    const count = await db
        .transaction('rw', db.scrobbles, async () => {
            return await db.scrobbles
                .where('track_name')
                .equalsIgnoreCase(data.track_name_original)
                .and(
                    (scrobble: Scrobble) =>
                        (timestampCheck(data.timestamp, scrobble.timestamp) &&
                            data.artist_name_original.toLowerCase() ===
                                scrobble.artist_name.toLowerCase() &&
                            data.album_name_original === '' &&
                            scrobble.album_name === undefined) ||
                        (data.album_name_original.toLowerCase() ===
                            scrobble.album_name?.toLowerCase() &&
                            ((data.album_artist_name_original === '' &&
                                scrobble.album_artist_name === undefined) ||
                                data.album_artist_name_original.toLowerCase() ===
                                    scrobble.album_artist_name?.toLowerCase())),
                )
                .modify({
                    artist_name: data.artist_name,
                    track_name: data.track_name,
                    album_name: data.album_name,
                    album_artist_name: data.album_artist_name,
                });
        })
        .catch((error) => {
            throw Error('updateScrobble', error);
        });
    if (data.create_automatic_edit_rule === 'on') {
        await maintainEdits(data, db);
    }
    log(`externalEditScrobble, updated ${count} scrobbles`, data);
}

/**
 * When saving an edit, check if there are any existing edit records
 * that have the *_original data of the edit as their target data.
 * If so, update these old edits with the target data of the new edit.
 */
async function maintainEdits(data: ExtendedEditFormValues, db: ScrobbleScrubblerDB) {
    try {
        const count = await db.edits
            .where('track_name')
            .equalsIgnoreCase(data.track_name_original)
            .and(
                (row) =>
                    row.artist_name.toLowerCase() ===
                        data.artist_name_original.toLowerCase() &&
                    row.album_name.toLowerCase() ==
                        data.album_name_original.toLowerCase() &&
                    row.album_artist_name.toLowerCase() ===
                        data.album_artist_name_original.toLowerCase(),
            )
            .modify((row) => {
                row.artist_name = data.artist_name;
                row.track_name = data.track_name;
                row.album_name = data.album_name;
                row.album_artist_name = data.album_artist_name;
                row.hash = EditsFetcher.hash({
                    artist_name: data.artist_name,
                    artist_name_original: row.artist_name_original,
                    track_name: data.track_name,
                    track_name_original: row.track_name_original,
                    album_name: data.album_name,
                    album_name_original: row.album_name_original,
                    album_artist_name: data.album_artist_name,
                    album_artist_name_original: row.album_artist_name_original,
                });
            });
        if (count > 0) {
            log(`maintainEdits updated ${count} edits`, data);
        }
    } catch (err) {
        error('catched an error in maintainEdits.', err);
    }
}

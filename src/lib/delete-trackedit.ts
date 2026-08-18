/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getUserName } from './lastfm-page.ts';
import postRequest from './post-request.ts';
import { openDatabase, ScrubblerDB } from '../services/database.ts';
import EditsFetcher from '../services/edits-fetcher.ts';
import Settings from '../services/settings.ts';
import { DeleteTrackEditFormValues } from '../types/lastfm.ts';
import type { DeleteEditJob } from '../types/jobs.ts';

export async function deleteTrackedit(job: DeleteEditJob, db: ScrubblerDB) {
    const url = 'https://www.last.fm/settings/subscription/automatic-edits/tracks?page=1';
    const { csrfmiddlewaretoken } = await new Settings(db).get(['csrfmiddlewaretoken']);
    const row = await db.edits.where('hash').equals(job.data.hash).first();
    if (!row) {
        return { job, success: false };
    }
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('csrfmiddlewaretoken', csrfmiddlewaretoken);
    formData.append('artist_name', row['artist_name']);
    formData.append('artist_name_original', row['artist_name_original']);
    formData.append('track_name', row['track_name']);
    formData.append('track_name_original', row['track_name_original']);
    formData.append('album_name', row['album_name']);
    formData.append('album_name_original', row['album_name_original']);
    formData.append('album_artist_name', row['album_artist_name']);
    formData.append('album_artist_name_original', row['album_artist_name_original']);

    const response = await postRequest(url, formData);
    if (response.status === 200) {
        await deleteTrackeditData(row.hash, db);
        return { job, success: true };
    } else {
        return { job, success: false };
    }
}

export async function externalDeleteTrackedit(data: DeleteTrackEditFormValues) {
    const userName = getUserName();
    const db = await openDatabase(userName);
    const hash = EditsFetcher.hash(data);
    await deleteTrackeditData(hash, db);
}

async function deleteTrackeditData(hash: string, db: ScrubblerDB) {
    await db
        .transaction('rw', db.edits, db.settings, async () => {
            await db.edits.delete(hash);
            await db.settings
                .where('name')
                .equals('editsCount')
                .modify((setting) => {
                    (setting.value as number) -= 1;
                });
        })
        .catch((err) => {
            throw Error('deleteAutomaticEdit', err);
        });
}

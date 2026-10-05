/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { equalsFunction } from './data-queries.ts';
import { getUserName, getUserUrl } from './lastfm-page.ts';
import postRequest from './post-request.ts';
import { openDatabase, ScrubblerDB } from '../services/database.ts';
import { log } from '../services/logger.ts';
import Settings from '../services/settings.ts';
import type { DeleteFormValues, Scrobble } from '../types/lastfm.ts';
import type { DeleteScrobbleJob } from '../types/jobs.ts';

export async function deleteScrobble(job: DeleteScrobbleJob, db: ScrubblerDB) {
    const url = `${getUserUrl()}/library/delete`;
    const { csrfmiddlewaretoken } = await new Settings(db).get(['csrfmiddlewaretoken']);
    const data = job.data;

    const formData = new FormData();
    formData.append('csrfmiddlewaretoken', csrfmiddlewaretoken);
    formData.append('ajax', '1');
    for (const [name, value] of Object.entries(data)) {
        formData.append(name, String(value));
    }
    const response = await postRequest(url, formData);

    if (response.status === 200) {
        await deleteScrobbleData(data, db);
        return { job, success: true };
    } else {
        return { job, success: false };
    }
}

export async function externalDeleteScrobble(data: DeleteFormValues) {
    const userName = getUserName();
    const db = await openDatabase(userName);
    await deleteScrobbleData(data, db);
}

async function deleteScrobbleData(data: DeleteFormValues, db: ScrubblerDB) {
    const equalsFunc = equalsFunction(data.track_name);
    const count = await db.scrobbles
        .where('track_name')
        [equalsFunc](data.track_name)
        .and(
            (scrobble: Scrobble) =>
                data.artist_name.toLowerCase() === scrobble.artist_name.toLowerCase() &&
                Number(data.timestamp) === scrobble.timestamp,
        )
        .delete();
    log(`deleteScrobbleData deleted ${count} scrobbles.
    artist_name: ${data.artist_name}
    track_name: ${data.track_name}
    timestamp: ${data.timestamp} / ${new Date(Number(data.timestamp) * 1000).toLocaleString()}`);
}

/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { Dexie, Table } from 'dexie';
import type { Job } from '../types/jobs.ts';
import {
    editFormKeys,
    scrobbleFields,
    Loved,
    Scrobble,
    TrackEdit,
} from '../types/lastfm.ts';
import type { Setting } from '../types/settings.ts';

export async function openDatabase(userName: string) {
    if (userName.length === 0) {
        throw Error('[ScrobbleScrubbler] Cannot open database, username is empty!');
    }
    const db = new ScrobbleScrubblerDB(`scrobble-scrubbler.${userName}`);
    await db.open().catch((err) => {
        throw Error('Failed to open db: ' + (err.stack || err));
    });
    return db;
}

export class ScrobbleScrubblerDB extends Dexie {
    edits!: Table<TrackEdit, string>;
    jobs!: Table<Job, number>;
    loved!: Table<Loved, [string, string]>;
    scrobbles!: Table<Scrobble, [number, number]>;
    settings!: Table<Setting, string>;
    constructor(dbName: string) {
        super(dbName);

        const scrobblesIndexes = scrobbleFields
            .filter((field) => field !== 'timestamp')
            .join(',');
        const trackeditsIndexes = editFormKeys
            .filter((field) => field !== 'timestamp')
            .join(',');

        this.version(1).stores({
            settings: 'name',
            jobs: '++id,job,state,hash',
            edits: `hash,position,${trackeditsIndexes}`,
            trackedits: null,
            scrobbles: `[timestamp+sequence],timestamp,sequence,${scrobblesIndexes}`,
            loved: '[artist_name+track_name], track_name',
        });

        this.on('populate', function (tx) {
            tx.table('settings').bulkAdd([
                { name: 'initState', value: 'waiting' },
                { name: 'processJobs', value: true },
                { name: 'observeScrobbles', value: true },
                { name: 'observeEdits', value: true },
                { name: 'scrobblesCount', value: 0 },
                { name: 'lastScrobblesCheck', value: null },
                { name: 'editsCount', value: 0 },
                { name: 'lastEditsCheck', value: null },
                { name: 'csrfmiddlewaretoken', value: '' },
                { name: 'automaticEditChecked', value: false },
                { name: 'pageReloadChecked', value: false },
                { name: 'pageReloadUrl', value: '' },
                { name: 'loggingEnabled', value: false },
            ]);
        });
    }
}

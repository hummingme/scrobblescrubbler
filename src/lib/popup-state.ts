/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { waitingJobsCount } from './jobs-count.ts';
import { ScrubblerDB } from '../services/database.ts';
import Settings from '../services/settings.ts';
import type JobRunner from '../services/job-runner.ts';
import type { SendStateMesssage } from '../types/messages.ts';

export default async function popupState(
    db: ScrubblerDB,
    jobRunner: JobRunner,
): Promise<SendStateMesssage> {
    const {
        initState,
        processJobs,
        observeScrobbles,
        observeEdits,
        scrobblesCount,
        editsCount,
    } = await new Settings(db).get([
        'initState',
        'processJobs',
        'observeScrobbles',
        'observeEdits',
        'scrobblesCount',
        'editsCount',
    ]);
    const scrobblesFetched = await db.scrobbles.count();
    const editsFetched = await db.edits.count();
    const scrobblesJobs = await waitingJobsCount(db, 'getScrobbles');
    const editsJobs = await waitingJobsCount(db, 'getTrackedits');
    const editScrobbleJobs = await waitingJobsCount(db, 'editScrobble');
    const deleteEditJobs = await waitingJobsCount(db, 'deleteEdit');
    const deleteScrobbleJobs = await waitingJobsCount(db, 'deleteScrobble');

    const times = jobRunner.runningTimes;
    const averageTime = times.reduce((sum, num) => sum + num, 0) / times.length;
    const secondsRemaining = Math.floor(
        ((scrobblesJobs +
            editsJobs +
            editScrobbleJobs +
            deleteEditJobs +
            deleteScrobbleJobs) *
            averageTime) /
            1000,
    );
    const payload = {
        initState,
        processJobs,
        observeScrobbles,
        observeEdits,
        scrobblesCount,
        scrobblesFetched,
        scrobblesJobs,
        editsCount,
        editsFetched,
        editsJobs,
        editScrobbleJobs,
        deleteEditJobs,
        deleteScrobbleJobs,
        secondsRemaining,
    };
    return {
        type: 'SEND_STATE',
        payload,
    };
}

/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { messageBackground } from './message-background.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';
import { log } from '../services/logger.ts';
import { JobType } from '../types/jobs.ts';
import { JobsChangedMessage } from '../types/messages.ts';

export async function waitingJobsCount(
    db: ScrobbleScrubblerDB,
    type?: JobType,
    init?: boolean,
) {
    return await db.jobs
        .where('state')
        .equals('waiting')
        .and(
            (job) =>
                (typeof type === 'undefined' || job.job === type) &&
                (typeof init === 'undefined' ||
                    ('init' in job.data && job.data.init === true)),
        )
        .count();
}

let lastJobsCount = 0;
export async function reportJobsCount(db: ScrobbleScrubblerDB) {
    const jobsCount = await waitingJobsCount(db);
    if (jobsCount !== lastJobsCount) {
        const message: JobsChangedMessage = { type: 'JOBS_CHANGED', jobsCount };
        messageBackground(message);
        lastJobsCount = jobsCount;
        log(`reportJobsCount reported ${jobsCount} jobs`);
    }
}

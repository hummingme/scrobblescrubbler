/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { type Table } from 'dexie';

import { ScrobbleScrubblerDB } from './database.ts';
import EditsFetcher from './edits-fetcher.ts';
import ScrobblesFetcher from './scrobbles-fetcher.ts';
import { deleteTrackedit } from '../lib/delete-trackedit.ts';
import { deleteScrobble } from '../lib/delete-scrobble.ts';
import editScrobble from '../lib/edit-scrobble.ts';
import { messageBackground } from '../lib/message-background.ts';
import Settings from '../services/settings.ts';
import type {
    FetchTrackeditsJob,
    FetchScrobblesJob,
    Job,
    JobResponse,
} from '../types/jobs.ts';
import type { ReloadTabMessage } from '../types/messages.ts';

export default class JobRunner {
    scrobblesFetcher: ScrobblesFetcher;
    editsFetcher: EditsFetcher;
    db: ScrobbleScrubblerDB;
    runningFrequency = 5031;
    runnerInterval?: number;
    initializing = false;
    runningTimes: number[] = Array(300).fill(5423);
    runningLast: number = Date.now();
    constructor(
        scrobblesFetcher: ScrobblesFetcher,
        editsFetcher: EditsFetcher,
        db: ScrobbleScrubblerDB,
    ) {
        this.scrobblesFetcher = scrobblesFetcher;
        this.editsFetcher = editsFetcher;
        this.db = db;
    }
    run(initializing: boolean) {
        this.initializing = initializing;
        if (this.runnerInterval) return;
        this.runnerInterval = window.setInterval(
            this.execute.bind(this),
            this.runningFrequency,
        );
    }
    stop() {
        if (!this.runnerInterval) return;
        window.clearInterval(this.runnerInterval);
        this.runnerInterval = undefined;
    }
    execute() {
        const jobs = this.db.jobs;
        this.db
            .transaction('rw', jobs, async () => {
                const runningJob = await jobs.where('state').equals('running').first();
                if (runningJob) {
                    // keep it running for 60 seconds
                    if (runningJob.modified + 60000 > Date.now()) {
                        return;
                    }
                    // ... then fail
                    await this.failedJob(jobs, runningJob.id!);
                }
                return await this.nextJob();
            })
            .then(async (job) => {
                if (job == undefined) return;
                if (job.job == 'getScrobbles') {
                    return await this.scrobblesFetcher.fetch(job);
                } else if (job.job === 'getTrackedits') {
                    return await this.editsFetcher.fetch(job);
                } else if (job.job === 'editScrobble') {
                    return await editScrobble(job, this.db);
                } else if (job.job === 'deleteEdit') {
                    return await deleteTrackedit(job, this.db);
                } else if (job.job === 'deleteScrobble') {
                    return await deleteScrobble(job, this.db);
                }
            })
            .then((response: JobResponse | undefined) => {
                if (response === undefined) return;
                const { job, success } = response;
                this.runningStatistics();
                if (success) {
                    jobs.update(job.id!, { state: 'done', modified: Date.now() });
                } else {
                    this.failedJob(jobs, job.id!);
                }
                this.checkPageReload(job);
            })
            .catch((error) => {
                throw error;
            });
    }

    async failedJob(jobs: Table, id: number) {
        jobs.where('id')
            .equals(id)
            .modify((job) => {
                job.state = 'failed';
                job.retries += 1;
            });
    }
    runningStatistics() {
        const elapsed = Date.now() - this.runningLast;
        if (elapsed < 30000) {
            this.runningTimes.unshift(elapsed);
            this.runningTimes.pop();
        }
        this.runningLast = Date.now();
    }
    async nextJob() {
        const jobs = this.db.jobs;
        const prioritizedJob = await jobs
            .where('state')
            .equals('waiting')
            .filter((job) => {
                return (
                    ('page' in job.data &&
                        typeof job.data.page === 'number' &&
                        job.data.page <= 10) ||
                    ['editScrobble', 'deleteScrobble', 'deleteEdit'].includes(job.job)
                );
            })
            .first();
        if (prioritizedJob) {
            return prioritizedJob;
        }
        const job = await this.queryNextJob();
        if (job === undefined && this.initializing) {
            this.finishInitializing();
            this.initializing = false;
            return;
        }
        if (job === undefined) return;

        if (this.unknownJob(job)) {
            await jobs.update(job.id!, {
                state: 'failed',
                retries: 5,
                modified: Date.now(),
            });
            return;
        }
        jobs.update(job.id!, { state: 'running', modified: Date.now() });
        return job;
    }
    async queryNextJob(): Promise<Job | undefined> {
        return await this.db.jobs
            .where('state')
            .anyOf('waiting', 'failed')
            .filter((job: Job) => {
                return (
                    job.state === 'waiting' || (job.state === 'failed' && job.retries < 5)
                );
            })
            .first();
    }
    async finishInitializing() {
        this.db.jobs
            .where('state')
            .equals('failed')
            .filter((job: Job) => {
                return 'init' in job.data && job.data.init === true;
            })
            .modify((j) => {
                const job = j as FetchTrackeditsJob | FetchScrobblesJob;
                job.state = 'waiting';
                job.retries = 0;
                job.data.retry = true;
            });
        const lastEditsJob = (await this.db.jobs
            .where('job')
            .equals('getTrackedits')
            .filter((job: Job) => {
                return 'init' in job.data && job.data.init === true;
            })
            .limit(1)
            .reverse()
            .first()) as Job;
        if ('page' in lastEditsJob.data) {
            await this.editsFetcher.finishInitializing(lastEditsJob.data.page);
        }
        new Settings(this.db).set([{ name: 'initState', value: 'ready' }]);
    }
    unknownJob(job: Job) {
        return ![
            'getScrobbles',
            'getTrackedits',
            'editScrobble',
            'deleteEdit',
            'deleteScrobble',
        ].includes(job.job);
    }
    async checkPageReload(job: Job) {
        if (job.job !== 'editScrobble' || (await this.queryNextJob())) {
            return;
        }
        const { pageReloadChecked, pageReloadUrl } = await new Settings(this.db).get([
            'pageReloadChecked',
            'pageReloadUrl',
        ]);
        if (pageReloadChecked) {
            setTimeout(() => {
                const message: ReloadTabMessage = {
                    type: 'RELOAD_TAB',
                    url: pageReloadUrl,
                };
                messageBackground(message);
            }, 1000);
        }
    }
}

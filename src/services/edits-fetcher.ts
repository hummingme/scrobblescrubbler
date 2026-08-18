/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import md5 from 'blueimp-md5';

import { error, log } from './logger.ts';
import Settings from './settings.ts';
import { reportJobsCount, waitingJobsCount } from '../lib/jobs-count.ts';
import requestDocument from '../lib/request-document.ts';
import { ScrubblerDB } from '../services/database.ts';
import type { FetchTrackeditsJob } from '../types/jobs.ts';
import {
    deleteTrackEditFormKeys,
    DeleteTrackEditFormKey,
    DeleteTrackEditFormValues,
    TrackEdit,
} from '../types/lastfm.ts';

export default class EditsFetcher {
    db: ScrubblerDB;
    settings;
    checkFrequency = 1200107 as const; // 20 min
    checkInterval?: number;
    constructor(db: ScrubblerDB) {
        this.db = db;
        this.settings = new Settings(db);
    }
    async run() {
        if (this.checkInterval) return;
        this.checkInterval = window.setInterval(
            this.check.bind(this),
            this.checkFrequency,
        );
        const { lastEditsCheck } = await this.settings.get(['lastEditsCheck']);
        if (Date.now() - lastEditsCheck > this.checkFrequency) {
            // initial check, but not on every page reload
            await this.check();
        }
    }
    stop() {
        if (!this.checkInterval) return;
        window.clearInterval(this.checkInterval);
        this.checkInterval = undefined;
    }
    pageUrl = (page: number) =>
        `https://www.last.fm/settings/subscription/automatic-edits/tracks?page=${page}&sort=modification_date&sort-direction=asc`;
    async intialize() {
        const initJobsCount = await waitingJobsCount(this.db, 'getTrackedits', true);
        if (initJobsCount > 0) {
            return true;
        }

        const { count, dom } = await this.requestPage(1);
        log(`initializing EditsFetcher, found ${count} edits`);
        if (count === undefined || dom === undefined) return;

        this.settings.set([
            { name: 'editsCount', value: count },
            { name: 'lastEditsCheck', value: Date.now() },
        ]);
        await this.extractEdits(dom, count);
        this.addJobs(count, { skipFirst: true, init: true });
        return true;
    }
    async finishInitializing(lastPage: number) {
        const { count } = await this.requestPage(1);
        if (count === undefined) return;

        const additionalCount = count - lastPage * 50;
        if (additionalCount > 0) {
            this.addJobs(additionalCount, { startPage: lastPage + 1 });
        }
    }
    async check() {
        const { editsCount } = await this.settings.get(['editsCount']);
        const { count, dom } = await this.requestPage(1);
        log(`EditsFetcher checked, found ${count} edits`);
        if (count !== undefined && dom !== undefined) {
            this.settings.set([
                { name: 'editsCount', value: count },
                { name: 'lastEditsCheck', value: Date.now() },
            ]);
            this.addJobs(count - editsCount, { skipFirst: true });
            this.extractEdits(dom, count);
        }
    }
    async requestPage(page: number) {
        const url = this.pageUrl(page);
        const dom = await requestDocument(url);
        const count = dom ? this.extractCount(dom) : undefined;
        return { dom, count };
    }
    extractCount(dom: Document) {
        const node = dom.querySelector<HTMLElement>(
            'section#subscription-corrections h4',
        );
        return node
            ? parseInt(node.innerText.trim().split(' ')[0].replaceAll(/[,.]/g, ''))
            : undefined;
    }

    async fetch(job: FetchTrackeditsJob) {
        const { dom, count } = await this.requestPage(job.data.page);
        if (dom === undefined || count === undefined) {
            return { job, success: false };
        }
        const edits = await this.extractEdits(dom, count, job.data.page);
        const success = edits.length > 0;
        return { job, success };
    }
    addJobs(
        count: number,
        options: { skipFirst?: boolean; init?: boolean; startPage?: number },
    ) {
        if (count <= 0) return;
        const startPage = options.startPage || 1;
        const { skipFirst, init } = options;
        const pages = Math.ceil(count / 50);
        if (pages === 1 && skipFirst) return;

        const hashes: string[] = [];
        const jobs: FetchTrackeditsJob[] = [];
        const firstPage = skipFirst ? startPage + 1 : startPage;
        for (let page = firstPage; page < firstPage + pages; page++) {
            const data = { page };
            if (init) {
                Object.assign(data, { init: true });
            }
            const hash = md5(`getTrackedits-${JSON.stringify(data)}`);
            hashes.push(hash);
            jobs.push({
                job: 'getTrackedits',
                state: 'waiting',
                retries: 0,
                data,
                hash,
                modified: Date.now(),
            });
        }
        const db = this.db;
        db.transaction('rw', db.jobs, async () => {
            const existingJobs = await db.jobs
                .where('hash')
                .anyOf(hashes)
                .filter((job) => ['waiting', 'running'].includes(job.state))
                .toArray();
            const existingHashes: string[] = existingJobs.map((job) => job.hash);
            const newJobs = jobs.filter(
                (job) => existingHashes.includes(job.hash) === false,
            );
            await db.jobs.bulkAdd(newJobs);
            log(`EditsFetcher added ${newJobs.length} getTrackedits jobs`);
            reportJobsCount(db);
        }).catch((err) => {
            error(`EditsFetcher.addJobs failed: ${err}`);
        });
    }
    async extractEdits(dom: Document, count: number, page = 1): Promise<TrackEdit[]> {
        const forms = dom.querySelectorAll<HTMLFormElement>(
            'table.chart-table td > form[action$="/edit-track"]',
        );
        const edits: TrackEdit[] = [];
        forms.forEach((form) => {
            const edit: Partial<TrackEdit> = {};
            Array.from(form.children)
                .filter(
                    (field): field is HTMLInputElement =>
                        field instanceof HTMLInputElement,
                )
                .forEach((field) => {
                    if (
                        deleteTrackEditFormKeys.includes(
                            field.name as DeleteTrackEditFormKey,
                        )
                    ) {
                        edit[field.name as DeleteTrackEditFormKey] = field.value;
                    }
                });
            if (this.isTrackEdit(edit)) {
                edits.push(edit);
            }
        });

        let position = count - 50 * (page - 1);
        const editRows: (TrackEdit & { position: number })[] = [];
        for (const edit of edits) {
            const hash = EditsFetcher.hash(edit);
            position--;
            editRows.push(Object.assign(edit, { hash, position }));
        }
        await this.db.edits.bulkPut(edits, { allKeys: true });
        return edits;
    }
    isTrackEdit(edit: Partial<TrackEdit>): edit is TrackEdit {
        return (
            typeof edit.track_name === 'string' &&
            typeof edit.track_name_original === 'string' &&
            typeof edit.album_name === 'string' &&
            typeof edit.album_name_original === 'string' &&
            typeof edit.album_artist_name === 'string' &&
            typeof edit.album_artist_name_original === 'string'
        );
    }
    static hash(data: DeleteTrackEditFormValues): string {
        const ordered: string[] = [];
        for (const key of deleteTrackEditFormKeys) {
            ordered.push(data[key].toLowerCase());
        }
        return md5(ordered.join(''));
    }
}

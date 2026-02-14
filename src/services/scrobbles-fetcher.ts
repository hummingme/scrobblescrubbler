/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import md5 from 'blueimp-md5';

import { ScrobbleScrubblerDB } from './database.ts';
import { error, log } from './logger.ts';
import Settings from './settings.ts';
import { formatDate } from '../lib/format-date.ts';
import { reportJobsCount, waitingJobsCount } from '../lib/jobs-count.ts';
import {
    editScrobbleFormSelector,
    getScrobbleFromEditForm,
    getUserName,
} from '../lib/lastfm-page.ts';
import requestDocument from '../lib/request-document.ts';
import type { FetchScrobblesJob } from '../types/jobs.ts';
import { Loved, Scrobble } from '../types/lastfm.ts';

export default class ScrobblesFetcher {
    userName: string;
    db: ScrobbleScrubblerDB;
    settings;
    checkFrequency = 600033 as const; // 10 min
    checkInterval?: number;
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
        this.userName = getUserName();
        this.settings = new Settings(db);
    }
    async run() {
        if (this.checkInterval) return;
        this.checkInterval = window.setInterval(
            this.check.bind(this),
            this.checkFrequency,
        );
        const { lastScrobblesCheck } = await this.settings.get(['lastScrobblesCheck']);
        if (Date.now() - lastScrobblesCheck > this.checkFrequency) {
            // initial check, but not on every page reload
            await this.check();
        }
    }
    stop() {
        if (!this.checkInterval) return;
        window.clearInterval(this.checkInterval);
        this.checkInterval = undefined;
    }
    get libraryUrl() {
        return `https://www.last.fm/user/${this.userName}/library`;
    }
    scrobblesUrl(toTS: number, fromTS: number, page?: number) {
        const toDate = formatDate(new Date(toTS));
        const fromDate = formatDate(new Date(fromTS));
        return `${this.libraryUrl}?from=${fromDate}&to=${toDate}${page ? `&page=${page}` : ''}`;
    }
    oldestTS: number = new Date('2000-01-01').getTime();
    yesterdayTS() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        return yesterday.getTime();
    }
    firstOfDayTS(timestamp: number) {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }
    async initialize() {
        const initJobsCount = await waitingJobsCount(this.db, 'getScrobbles', true);
        if (initJobsCount > 0) {
            return true;
        }

        const { count, dom } = await this.requestCount(Date.now(), this.oldestTS);
        log(`initializing ScrobblesFetcher, found ${count} scrobbles`);
        if (count == undefined || dom === undefined) return;

        const todayTS = Date.now();
        this.settings.set([
            { name: 'scrobblesCount', value: count },
            { name: 'lastScrobblesCheck', value: todayTS },
        ]);
        const scrobbles = await this.processScrobbles(dom);

        // add jobs for the current day
        const firstOfDayTS = this.firstOfDayTS(todayTS);
        if (scrobbles.some((scrobble) => scrobble.timestamp < firstOfDayTS) === false) {
            // more scrobble pages for the current day
            const { count } = await this.requestCount(todayTS, todayTS);
            if (count === undefined) return;
            const url = this.scrobblesUrl(todayTS, todayTS);
            this.addJobs(count, url, { skipFirst: true, init: true });
        }

        // add jobs for the timespan from yesterday to the beginning of time
        const { count: count2, dom: dom2 } = await this.requestCount(
            this.yesterdayTS(),
            this.oldestTS,
        );
        if (count2 === undefined || dom2 === undefined) return;

        await this.processScrobbles(dom2);
        const url = this.scrobblesUrl(this.yesterdayTS(), this.oldestTS);
        this.addJobs(count2, url, { skipFirst: true, init: true });
        return true;
    }
    async reFetch(start: number, end: number) {
        const { count, dom } = await this.requestCount(start, end);
        if (count === undefined || dom === undefined) return;

        await this.processScrobbles(dom);
        const url = this.scrobblesUrl(start, end);
        return await this.addJobs(count, url, { skipFirst: true });
    }
    async check() {
        const { scrobblesCount } = await this.settings.get(['scrobblesCount']);
        const todayTS = Date.now();
        const { count, dom } = await this.requestCount(todayTS, this.oldestTS);
        log(`ScrobblesFetcher.check, found ${count} scrobbles`);
        if (count !== undefined && dom !== undefined) {
            const url = this.scrobblesUrl(todayTS, this.oldestTS);
            this.addJobs(count - scrobblesCount, url, { skipFirst: true });
            const scrobbles = await this.processScrobbles(dom);
            const latestTS = Number.isNaN(scrobbles[0].timestamp)
                ? todayTS
                : scrobbles[0].timestamp * 1000;
            this.settings.set([
                { name: 'scrobblesCount', value: count },
                { name: 'lastScrobblesCheck', value: latestTS },
            ]);
        }
    }
    async requestCount(startTS: number, endTS: number) {
        const url = this.scrobblesUrl(startTS, endTS, 1);
        const dom = await requestDocument(url);
        const node = dom?.querySelector<HTMLElement>('p.metadata-display');
        const count = node ? parseInt(node.innerText.replaceAll(/[,.]/g, '')) : undefined;
        return { count, dom };
    }
    async addJobs(
        count: number,
        url: string,
        options: { skipFirst?: boolean; init?: boolean },
    ) {
        if (count <= 0) return 0;

        const { skipFirst, init } = options;
        const pages = Math.ceil(count / 50);
        if (pages === 1 && skipFirst) return 0;

        const hashes: string[] = [];
        const jobs: Omit<FetchScrobblesJob, 'id'>[] = [];
        const firstPage = skipFirst ? 2 : 1;
        for (let page = firstPage; page <= pages; page++) {
            const data = { page, url: `${url}&page=${page}` };
            if (init) {
                Object.assign(data, { init: true });
            }
            const hash = md5(`getScrobbles-${JSON.stringify(data)}`);
            hashes.push(hash);
            jobs.push({
                job: 'getScrobbles',
                state: 'waiting',
                retries: 0,
                data,
                hash,
                modified: Date.now(),
            });
        }

        const db = this.db;
        return db
            .transaction('rw', db.jobs, async () => {
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
                log(`ScrobblesFetcher added ${newJobs.length} getScrobbles jobs`);
                reportJobsCount(db);
                return jobs.length;
            })
            .catch((err) => {
                error(`ScrobblesFetcher.addJobs failed: ${err}`);
                return undefined;
            });
    }
    async fetch(job: FetchScrobblesJob) {
        const dom = await requestDocument(job.data.url);
        if (!dom) {
            return { job, success: false };
        }
        const scrobbles = await this.processScrobbles(dom, job);
        const success = scrobbles.length > 0;
        if (success) {
            await this.extractLovedTracks(dom);
        }
        return { job, success };
    }
    async processScrobbles(dom: Document, job?: FetchScrobblesJob): Promise<Scrobble[]> {
        const scrobbles = this.extractScrobbles(dom, job);
        try {
            await this.db.scrobbles.bulkPut(scrobbles);
        } catch (err) {
            error(`ScrobbleFetcher.processScrobbles failed: ${err}`);
        }
        return scrobbles;
    }
    previousScrobble?: Scrobble;
    previousScrobbleInit?: Scrobble;
    extractScrobbles(dom: Document, job?: FetchScrobblesJob) {
        const forms = dom.querySelectorAll<HTMLFormElement>(
            `table.chartlist td.chartlist-more ${editScrobbleFormSelector}`,
        );
        const scrobbles: Scrobble[] = [];
        forms.forEach((form) => {
            const scrobbleData = getScrobbleFromEditForm(form);
            const previous = job?.data.init ? 'previousScrobbleInit' : 'previousScrobble';
            const previousSequence = this[previous]?.sequence || 0;
            const sequence =
                this[previous]?.timestamp === scrobbleData.timestamp
                    ? previousSequence + 1
                    : 1;
            const scrobble: Scrobble = Object.assign(scrobbleData, { sequence });
            this[previous] = structuredClone(scrobble);
            scrobbles.push(scrobble);
        });
        return scrobbles;
    }
    async extractLovedTracks(dom: Document) {
        const forms = dom.querySelectorAll<HTMLFormElement>(
            `table.chartlist td.chartlist-more ${editScrobbleFormSelector}`,
        );
        const loved: Loved[] = [];
        const unloved: [string, string][] = [];
        forms.forEach((form) => {
            const artist_name = (
                Array.from(form.children).find(
                    (child) =>
                        child instanceof HTMLInputElement && child.name === 'artist_name',
                ) as HTMLInputElement
            ).value;
            const track_name = (
                Array.from(form.children).find(
                    (child) =>
                        child instanceof HTMLInputElement && child.name === 'track_name',
                ) as HTMLInputElement
            ).value;
            if (!artist_name || !track_name) return;

            const tr = form.closest('tr');
            const isLoved = tr?.querySelector(
                'div[data-toggle-button-current-state="loved"]',
            );
            if (isLoved) {
                loved.push({ artist_name, track_name });
            } else {
                unloved.push([artist_name, track_name]);
            }
        });
        await this.db.loved.bulkPut(loved);
        await this.db.loved.bulkDelete(unloved);
    }
}

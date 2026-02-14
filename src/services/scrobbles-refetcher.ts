/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html } from 'lit-html';

import { ScrobbleScrubblerDB } from './database.ts';
import { warn } from './logger.ts';
import ScrobblesFetcher from './scrobbles-fetcher.ts';
import { formatDate } from '../lib/format-date.ts';
import ModalDialog from '../lib/modal-dialog.ts';

export default class ScrobblesRefetcher {
    db: ScrobbleScrubblerDB;
    dialog?: ModalDialog;
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
    }
    checkInvocation() {
        const refetch = new URLSearchParams(location.search).get('refetch');
        if (!refetch) return;

        const result = this.parseRefetchParam(refetch);
        if (!result) return;

        const [start, end] = result;
        this.showDialog(start, end);
    }
    parseRefetchParam(refetch: string) {
        function logInvalid(refetch: string) {
            warn(`"refetch=${refetch}" did not represent a valid refetch period!`);
        }
        const parts = refetch.split('-');
        if (parts.length < 1 || parts.length > 3) {
            logInvalid(refetch);
            return;
        }
        const nums = parts.map(Number);
        if (nums.some((n) => !Number.isInteger(n))) {
            logInvalid(refetch);
            return;
        }
        const [year, month, day] = nums;
        if (year < 2004 || year > new Date().getFullYear()) {
            logInvalid(refetch);
            return;
        }
        if (parts.length >= 2 && (month < 1 || month > 12)) {
            logInvalid(refetch);
            return;
        }
        if (parts.length === 3 && !this.representsDate(year, month, day)) {
            logInvalid(refetch);
            return;
        }
        let start: Date;
        let end: Date;
        if (parts.length === 3) {
            start = end = new Date(year, month - 1, day);
        } else if (parts.length === 2) {
            start = new Date(year, month - 1, 1);
            end = new Date(year, month, 0);
        } else {
            start = new Date(year, 0, 1);
            end = new Date(year, 11, 31);
        }
        return [formatDate(start), formatDate(end)];
    }
    representsDate(year: number, month: number, day: number): boolean {
        const d = new Date(year, month - 1, day);
        return (
            d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
        );
    }
    showDialog(start: string, end: string) {
        this.dialog = new ModalDialog();
        const timeframe = html`
            <b>${start}</b>
            ${end !== start
                ? html`
                      to
                      <b>${end}</b>
                  `
                : ''}
        `;
        const message = html`
            <h2>ScrobbleScrubbler got a refetch request</h2>
            <p>After confirmation, the scrobbles from ${timeframe} will get refetched.</p>
            <div class="scrobble-scrubbler-buttons">
                <button
                    class="btn-primary"
                    autofocus
                    @click=${this.initRefetch.bind(this, start, end)}
                >
                    refetch scrobbles
                </button>
                <button
                    class="btn-secondary"
                    @click=${this.dialog.close.bind(this.dialog)}
                >
                    cancel
                </button>
            </div>
        `;
        this.dialog.show(message);
    }
    async initRefetch(start: string, end: string) {
        const scrobblesFetcher = new ScrobblesFetcher(this.db);
        const jobCount: number | undefined = await scrobblesFetcher.reFetch(
            Date.parse(start),
            Date.parse(end),
        );
        this.showResult(jobCount);
    }
    showResult(result: number | undefined) {
        if (!this.dialog) return;
        const headline =
            typeof result === 'number'
                ? result === 0
                    ? 'The refetch has been completed.'
                    : 'The refetch has been started.'
                : 'The refetch request failed.';
        const message =
            typeof result === 'number'
                ? result === 0
                    ? ''
                    : result === 1
                      ? '1 background job was created and is waiting to be executed.'
                      : `${result} background jobs have been created and are awaiting execution.`
                : 'The refetch could not be initialized. Please try again in a minute and/or check the developer console for errors.';
        const content = html`
            <h2>${headline}</h2>
            <p>${message}</p>
            <div class="scrobble-scrubbler-buttons">
                <button
                    class="btn-primary"
                    autofocus
                    @click=${this.dialog.close.bind(this.dialog)}
                >
                    close
                </button>
            </div>
        `;
        this.dialog.render(content);
    }
}

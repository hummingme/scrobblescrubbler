/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html, type TemplateResult } from 'lit-html';

import { openDatabase, ScrubblerDB } from './database.ts';
import { error, log } from './logger.ts';
import ScrobblesFetcher from './scrobbles-fetcher.ts';
import {
    albumArtistScrobblesCount,
    albumScrobblesCount,
    artistScrobblesCount,
    trackScrobblesCount,
} from '../lib/data-queries.ts';
import { dateTimeString, formatDate } from '../lib/format-date.ts';
import { getUserName, getUserUrl } from '../lib/lastfm-page.ts';
import {
    libraryAlbumLink,
    libraryArtistLink,
    libraryTrackLink,
} from '../lib/library-links.ts';
import { reloadPage } from '../lib/load-url.ts';
import ModalDialog from '../lib/modal-dialog.ts';
import requestDocument from '../lib/request-document.ts';
import type { Scrobble } from '../types/lastfm.ts';

type ScrobbleMap = Map<string, Scrobble>;
type ScrobbleModifications = {
    [Property in keyof Scrobble]?: { stored: string; existing: string };
};
type ScrobbleCounts = { [Property in keyof Scrobble]?: number };

export default class ScrobbleChecker {
    db: ScrubblerDB;
    scrobblesFetcher: ScrobblesFetcher;
    dialog?: ModalDialog;
    constructor(db: ScrubblerDB, scrobblesFetcher: ScrobblesFetcher) {
        this.db = db;
        this.scrobblesFetcher = scrobblesFetcher;
    }
    async check(timestamp: number) {
        log(
            `ScrobbleChecker.check() invoked for timestamp ${timestamp}, ${dateTimeString(timestamp)}`,
        );
        try {
            const stored = await this.getStoredScrobbles(timestamp); // from database
            const storedMissing = stored.length === 0;

            const { existing, page } = await this.findScrobbles(timestamp, storedMissing); // on website
            const existingMissing = existing.length === 0;

            if (existingMissing) {
                await this.deleteStoredScrobbles(timestamp);
                reloadPage();
            } else if (!storedMissing) {
                const { storedScrobble, existingScrobble } = this.divergentScrobble(
                    stored,
                    existing,
                );
                log('found divergence', { storedScrobble, existingScrobble });
                if (storedScrobble && existingScrobble) {
                    this.showModificationsDialog(storedScrobble, existingScrobble, page);
                } else {
                    this.showRefetchDialog(timestamp, page);
                }
            } else {
                // storedMissing && !existingMissing
                this.showRefetchDialog(timestamp, page);
            }
            this.stopSpinning();
        } catch (err) {
            error('catched', err);
        }
    }
    async getStoredScrobbles(timestamp: number): Promise<Scrobble[]> {
        return await this.db.scrobbles.where('timestamp').equals(timestamp).toArray();
    }
    async deleteStoredScrobbles(timestamp: number) {
        return await this.db.scrobbles.where('timestamp').equals(timestamp).delete();
    }
    async findScrobbles(timestamp: number, storedMissing: boolean) {
        const ts = timestamp * 1000;
        const fetcher = this.scrobblesFetcher;
        const { count, dom } = await fetcher.requestCount(ts, ts);
        if (!count || !dom) {
            throw Error(
                `Error fetching url ${this.scrobblesFetcher.scrobblesUrl(ts, ts, 1)}`,
            );
        }
        const pages = Math.ceil(count / 50);
        const fetcherMethod = storedMissing ? 'processScrobbles' : 'extractScrobbles';
        const scrobbles = await fetcher[fetcherMethod](dom);
        let existing = scrobbles.filter((scrobble) => scrobble.timestamp === timestamp);
        if (existing.length > 0) {
            return { existing, page: 1 };
        } else {
            for (let page = 2; page <= pages; page++) {
                const url = fetcher.scrobblesUrl(ts, ts, page);
                const dom = await requestDocument(url);
                if (!dom) {
                    throw Error(`Error fetching url ${url}`);
                }
                const scrobbles = await fetcher[fetcherMethod](dom);
                existing = scrobbles.filter(
                    (scrobble) => scrobble.timestamp === timestamp,
                );
                if (existing.length > 0) {
                    return { existing, page };
                }
            }
        }
        return { existing: [], page: -1 };
    }
    divergentScrobble(stored: Scrobble[], existing: Scrobble[]) {
        const storedMap: ScrobbleMap = new Map(
            stored.map((s) => [`${s.timestamp}-${s.sequence}`, s]),
        );
        const existingMap: ScrobbleMap = new Map(
            existing.map((s) => [`${s.timestamp}-${s.sequence}`, s]),
        );
        for (const [key, storedScrobble] of storedMap) {
            const existingScrobble = existingMap.get(key);
            if (!existingScrobble) {
                return { storedScrobble, existingScrobble: null };
            } else if (
                JSON.stringify(storedScrobble) !== JSON.stringify(existingScrobble)
            ) {
                return { storedScrobble, existingScrobble };
            }
        }
        return {};
    }
    scrobbleModifications(storedScrobble: Scrobble, existingScrobble: Scrobble) {
        const properties: (keyof Scrobble)[] = [
            'artist_name',
            'track_name',
            'album_name',
            'album_artist_name',
        ];
        const modifications: ScrobbleModifications = {};
        for (const property of properties) {
            const stored =
                typeof storedScrobble[property] === 'string'
                    ? storedScrobble[property]
                    : '';
            const existing =
                typeof existingScrobble[property] === 'string'
                    ? existingScrobble[property]
                    : '';
            if (stored.toLowerCase() !== existing.toLowerCase()) {
                modifications[property] = { stored, existing };
            }
        }
        if (modifications.artist_name) {
            modifications.album_artist_name = modifications.artist_name;
        }
        return Object.keys(modifications).length > 0 ? modifications : null;
    }
    async affectedScrobbleCounts(
        modifications: ScrobbleModifications,
        oldScrobble: Scrobble,
    ) {
        const affectedCounts: ScrobbleCounts = {};
        if (modifications.artist_name) {
            affectedCounts.artist_name = await artistScrobblesCount(
                this.db,
                oldScrobble.artist_name,
            );
            affectedCounts.album_artist_name = await albumArtistScrobblesCount(
                this.db,
                oldScrobble.artist_name,
            );
        }
        if (modifications.track_name) {
            affectedCounts.track_name = await trackScrobblesCount(
                this.db,
                oldScrobble.artist_name,
                oldScrobble.track_name,
            );
        }
        if (
            modifications.album_name &&
            oldScrobble.album_name &&
            oldScrobble.album_artist_name
        ) {
            affectedCounts.album_name = await albumScrobblesCount(
                this.db,
                oldScrobble.album_artist_name,
                oldScrobble.album_name,
            );
        }
        if (
            !affectedCounts.artist_name &&
            modifications.album_artist_name &&
            oldScrobble.album_artist_name &&
            oldScrobble.album_name
        ) {
            affectedCounts.album_artist_name = await albumScrobblesCount(
                this.db,
                oldScrobble.album_artist_name,
                oldScrobble.album_name,
            );
        }
        return affectedCounts;
    }
    async showModificationsDialog(
        storedScrobble: Scrobble,
        existingScrobble: Scrobble,
        page: number,
    ) {
        const modifications = this.scrobbleModifications(
            storedScrobble,
            existingScrobble,
        );
        if (!modifications) {
            log('No modifications could be detected.');
            return;
        }
        this.dialog = new ModalDialog();
        const affectedCounts = await this.affectedScrobbleCounts(
            modifications,
            storedScrobble,
        );
        const message: TemplateResult = this.modificationsMessage(
            modifications,
            affectedCounts,
            storedScrobble,
            existingScrobble,
            page,
            this.dialog,
        );
        this.dialog.show(message);
    }
    modificationsMessage(
        modifications: ScrobbleModifications,
        affected: ScrobbleCounts,
        storedScrobble: Scrobble,
        existingScrobble: Scrobble,
        page: number,
        dialog: ModalDialog,
    ) {
        const modificationPoints: TemplateResult[] = [];
        Object.entries(modifications).forEach(([property, entry]) => {
            const count = affected[property as keyof Scrobble] || 0;
            if (count === 0) return;
            modificationPoints.push(html`
                <li>
                    ${property} from
                    <em title=${encodeURIComponent(entry.stored)}>
                        ${this.libraryLink(property, storedScrobble)}
                    </em>
                    to
                    <em title=${encodeURIComponent(entry.existing)}>
                        ${this.libraryLink(property, existingScrobble)}
                    </em>
                    for
                    <b>${count}</b>
                    scrobbles
                </li>
            `);
        });
        const scrobbleLink = this.scrobbleLink(
            existingScrobble.timestamp,
            page,
            dateTimeString(existingScrobble.timestamp),
        );
        const message = html`
            <h2>
                The examined scrobble from ${scrobbleLink} differs from the
                ScrobbleScrubbler database
            </h2>
            Confirm to modify
            <ol>
                ${modificationPoints}
            </ol>
            The update will change the data stored by the ScrobbleScrubbler extension and
            will not affect your last.fm data.
            <div class="scrobble-scrubbler-buttons">
                <button
                    class="btn-primary"
                    autofocus
                    @click=${this.applyChanges.bind(
                        this,
                        modifications,
                        existingScrobble,
                    )}
                >
                    apply changes
                </button>
                <button class="btn-secondary" @click=${dialog.close.bind(dialog)}>
                    cancel
                </button>
            </div>
        `;
        return message;
    }
    libraryLink(property: string, scrobble: Scrobble) {
        switch (property) {
            case 'track_name':
                return libraryTrackLink(scrobble.track_name, scrobble.artist_name);
            case 'album_name': {
                const artistName = scrobble.album_artist_name || scrobble.artist_name;
                return libraryAlbumLink(scrobble.album_name || '', artistName);
            }
            case 'artist_name':
                return libraryArtistLink(scrobble.artist_name);
            case 'album_artist_name': {
                const artistName = scrobble.album_artist_name || scrobble.artist_name;
                return libraryArtistLink(artistName);
            }
        }
    }
    showRefetchDialog(timestamp: number, page: number) {
        this.dialog = new ModalDialog();
        const message: TemplateResult = this.refetchMessage(timestamp, page, this.dialog);
        this.dialog.show(message);
    }
    refetchMessage(timestamp: number, page: number, dialog: ModalDialog) {
        const date = formatDate(new Date(timestamp * 1000));
        const scrobbleLink = this.scrobbleLink(timestamp, page, date);
        return html`
            <h2>Additional scrobbles were found for the date ${scrobbleLink}</h2>
            <p>Confirm to refetch the scrobbles for this day.</p>
            <div class="scrobble-scrubbler-buttons">
                <button
                    class="btn-primary"
                    autofocus
                    @click=${this.refetchDay.bind(this, timestamp)}
                >
                    refetch scrobbles
                </button>
                <button class="btn-secondary" @click=${dialog.close.bind(dialog)}>
                    cancel
                </button>
            </div>
        `;
    }
    scrobbleLink(timestamp: number, page: number, text: string) {
        const date = formatDate(new Date(timestamp * 1000));
        const scrobbleUrl = `${getUserUrl()}/library/?from=${date}&to=${date}&page=${page}`;
        return html`
            <a href="${scrobbleUrl}">${text}</a>
        `;
    }
    refetchDay(timestamp: number, event: Event) {
        window.postMessage({ type: 'REFETCH_DAY', timestamp });
        if (this.dialog) this.dialog.close(event);
    }
    async applyChanges(
        modifications: ScrobbleModifications,
        existingScrobble: Scrobble,
        event: Event,
    ) {
        const userName = getUserName();
        const db = await openDatabase(userName);
        Object.entries(modifications).forEach(async ([property, entry]) => {
            const { stored, existing } = entry;
            if (property === 'artist_name') {
                await db.scrobbles
                    .where('artist_name')
                    .equals(stored)
                    .modify({ artist_name: existing });
            } else if (property === 'album_artist_name' && existingScrobble.album_name) {
                await db.scrobbles
                    .where('album_name')
                    .equals(existingScrobble.album_name)
                    .and((scrobble: Scrobble) => scrobble.album_artist_name === stored)
                    .modify({ album_artist_name: existing });
            } else {
                const artistProperty =
                    property === 'album_name' ? 'album_artist_name' : 'artist_name';
                await db.scrobbles
                    .where(property)
                    .equals(stored)
                    .and(
                        (scrobble: Scrobble) =>
                            scrobble[artistProperty] === existingScrobble[artistProperty],
                    )
                    .modify({ [property]: existing });
            }
        });
        if (this.dialog) this.dialog.close(event);
        reloadPage();
    }
    stopSpinning() {
        // the timer started in MissingIcon.rotateIcon() will display an alert
        // if the icon is still rotating
        document
            .querySelectorAll<HTMLElement>('button.scrobble-scrubbler-missing-icon.spin')
            .forEach((icon) => icon.classList.remove('spin'));
    }
}

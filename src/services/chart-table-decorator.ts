/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from './database.ts';
import Settings from './settings.ts';
import AlbumIcon from '../icons/album-icon.ts';
import ArtistIcon from '../icons/artist-icon.ts';
import MissingIcon from '../icons/missing-icon.ts';
import TrackIcon from '../icons/track-icon.ts';
import { getTrackScrobbles } from '../lib/data-queries.ts';
import fixCapitalization from '../lib/fix-capitalization.ts';
import { isUserUrl } from '../lib/library-links.ts';
import { itemLinkSubject } from '../lib/item-links.ts';
import {
    editScrobbleFormSelector,
    getTimestampFromRow,
    getScrubblerItemFromEditForm,
    getScrubblerItemFromLovedForm,
    getUserUrl,
} from '../lib/lastfm-page.ts';
import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import type { LibrarySubject } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

/*
 * add icons to lists of individual scrobbles that are displayed with time information
 *
 * used on
 *
 *
 */
export default class ChartTablesDecorator {
    db: ScrobbleScrubblerDB;
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
    }
    // called by observer
    prepareTables(node: HTMLElement) {
        if (!isUserUrl(location.href)) return;
        const tables: HTMLElement[] = this.getChartTables(node);
        tables.forEach((table) => {
            const subject = this.determineSubject(table);
            const rows = table.querySelectorAll<HTMLTableRowElement>('tr.chartlist-row');
            this.addIcons([...rows], subject);
        });
    }
    getChartTables(node: HTMLElement) {
        let tables: HTMLElement[] = [];
        if (location.href === getUserUrl()) {
            if (node.tagName === 'DIV' || node.tagName === 'HTML') {
                // -> user profile overview
                tables = Array.from(
                    node.querySelectorAll<HTMLElement>('table.chartlist--with-bar'),
                );
            }
        } else if (node.tagName === 'SECTION') {
            // -> library list
            const page = window.location.pathname.split('/').pop() || '';
            if (page === '+tracks' && node.id === 'library-sort-section') {
                // artist tracks lists get this node twice on page reload,
                // once as 'top-tracks-section' and once as 'library-sort-section'
                return tables;
            }
            tables = Array.from(
                node.querySelectorAll<HTMLElement>(
                    'div[v-else] table.chartlist:not(table.chartlist__placeholder)',
                ),
            );
        } else if (node.tagName === 'TABLE') {
            if (node.classList.contains('chartlist__placeholder') === false) {
                // -> library list called by page navigation
                tables = [node];
            }
        }
        return tables;
    }
    determineSubject(table: HTMLElement): LibrarySubject {
        const url = table.querySelector<HTMLAnchorElement>('td.chartlist-name a')?.href;
        const linkSubject = itemLinkSubject(url || '');
        if (linkSubject) {
            return linkSubject;
        }
        throw Error('Cannot identify subject of charttable!');
    }
    async addIcons(rows: HTMLElement[], subject: LibrarySubject) {
        const { initState } = await new Settings(this.db).get(['initState']);
        rows.forEach(async (row) => {
            const item = this.getScrubblerItemFromRow(row, subject);
            if (item) {
                if (subject === 'track' && this.isTracklistRow(row)) {
                    this.addTracklistIcon(item, row);
                    return;
                }
                const icon = this.subjectIcon(subject);
                const iconNode = await icon.addIcon(row, item);
                if (!iconNode && initState === 'ready') {
                    let needsMissingIcon = true;
                    if (!this.capitalizationFixes.has(JSON.stringify(item))) {
                        this.capitalizationFixes.add(JSON.stringify(item));
                        const success = await fixCapitalization(item, this.db);
                        if (success) {
                            needsMissingIcon = false;
                            this.addIcons([row], subject);
                        }
                    }
                    if (needsMissingIcon) {
                        const missingIcon = new MissingIcon(this.db);
                        await missingIcon.addIcon(row, item, 'track');
                    }
                }
            }
        });
    }
    async addTracklistIcon(item: ScrubblerItem, row: HTMLElement) {
        const timestamp = getTimestampFromRow(row);
        const scrobbleExists =
            (await getTrackScrobbles(this.db, item, timestamp / 1000)).length > 0;
        if (scrobbleExists) {
            return; // only MissingIcons are added in tracklists
        }
        if (!this.capitalizationFixes.has(JSON.stringify(item))) {
            this.capitalizationFixes.add(JSON.stringify(item));
            const success = await fixCapitalization(item, this.db);
            if (success) return; // most likely not longer missing
        }
        const icon = new MissingIcon(this.db);
        await icon.addIcon(row, item, 'track');
    }
    capitalizationFixes: Set<string> = new Set();
    isTracklistRow(row: HTMLElement) {
        return row.dataset.editScrobbleId !== undefined;
    }
    getScrubblerItemFromRow(
        row: HTMLElement,
        subject: LibrarySubject,
    ): ScrubblerItem | null {
        switch (subject) {
            case 'track':
                return this.getTrackItemFromRow(row);
            case 'album':
                return this.getAlbumItemFromRow(row);
            case 'artist':
                return this.getArtistItemFromRow(row);
            default:
                return null;
        }
    }
    getTrackItemFromRow(row: HTMLElement) {
        if (this.isTracklistRow(row)) {
            const form = row.querySelector<HTMLFormElement>(editScrobbleFormSelector);
            return form ? getScrubblerItemFromEditForm(form) : emptyScrubblerItem();
        } else {
            const form = row.querySelector<HTMLFormElement>('td.chartlist-loved form');
            return form ? getScrubblerItemFromLovedForm(form) : emptyScrubblerItem();
        }
    }
    getAlbumItemFromRow(row: HTMLElement) {
        const form = row.querySelector<HTMLFormElement>('form[data-edit-album]');
        return form
            ? Object.assign(emptyScrubblerItem(), getScrubblerItemFromEditForm(form))
            : emptyScrubblerItem();
    }
    getArtistItemFromRow(row: HTMLElement) {
        const albumArtistName =
            row.querySelector<HTMLElement>('td.chartlist-name a')?.innerText || '';
        return Object.assign(emptyScrubblerItem(), { albumArtistName });
    }
    subjectIcon(subject: LibrarySubject) {
        switch (subject) {
            case 'artist':
                return new ArtistIcon(this.db);
            case 'album':
                return new AlbumIcon(this.db);
            case 'track':
                return new TrackIcon(this.db);
        }
    }
    hasIcon(node: HTMLElement) {
        const firstChild = node.firstElementChild;
        return (
            firstChild instanceof HTMLButtonElement &&
            firstChild.classList.contains('scrobble-scrubbler-info-icon')
        );
    }
}

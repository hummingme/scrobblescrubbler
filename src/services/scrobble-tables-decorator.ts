/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from './database.ts';
import Settings from './settings.ts';
import MissingIcon from '../icons/missing-icon.ts';
import TrackIcon from '../icons/track-icon.ts';
import { getTrackScrobbles } from '../lib/data-queries.ts';
import { fixCapitalization } from '../lib/fix-capitalization.ts';
import {
    editScrobbleFormSelector,
    getTimestampFromRow,
    getScrubblerItemFromEditForm,
} from '../lib/lastfm-page.ts';
import { isUserUrl } from '../lib/library-links.ts';
import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import { ScrubblerItem } from '../types/scrubbler.ts';

/*
 * add icons to lists of individual scrobbles that are displayed with time information
 *
 * used on
 *   - user profile page, https://www.last.fm/user/iriebob
 *   - library scrobble history, https://www.last.fm/user/iriebob/library?page=2
 */
export default class ScrobbleTablesDecorator {
    db: ScrobbleScrubblerDB;
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
    }
    // called by observer for div and section nodes
    prepareTables(node: HTMLElement) {
        if (!isUserUrl(location.href)) return;
        const tables = node.querySelectorAll<HTMLTableElement>('table.chartlist');
        Array.from(tables).forEach((table) => {
            if (!this.isScrobbleTable(table)) return;
            const rows = table.querySelectorAll<HTMLTableRowElement>('tr.chartlist-row');
            this.addIcons([...rows]);
        });
    }
    isScrobbleTable(table: HTMLTableElement) {
        return (
            table.classList.contains('chartlist--with-bar') === false &&
            table.classList.contains('chartlist--with-play') === true
        );
    }
    // called by observer for tr nodes
    prepareRow(node: HTMLTableRowElement) {
        // with 'auto update' enabled, the table rows are replaced
        if (
            node.classList.contains('chartlist-row') &&
            !node.classList.contains('chartlist-row--now-scrobbling')
        ) {
            this.addIcons([node]);
        }
    }
    // called by observer for td nodes
    prepareCell(node: HTMLTableCellElement) {
        // when 'auto update' is enabled, occasionally only the timestamp cells
        // into which the disc icons are inserted are replaced, instead of the whole table rows
        if (node.classList.contains('chartlist-timestamp')) {
            const row = node.closest('tr');
            if (row) {
                this.prepareRow(row);
            }
        }
    }
    getScrubblerItemFromRow(row: HTMLTableRowElement): ScrubblerItem {
        const form = row.querySelector<HTMLFormElement>(editScrobbleFormSelector);
        return form ? getScrubblerItemFromEditForm(form) : emptyScrubblerItem();
    }
    async addIcons(rows: HTMLTableRowElement[]) {
        const icons: (TrackIcon | MissingIcon)[] = [];
        const { lastScrobblesCheck, initState } = await new Settings(this.db).get([
            'lastScrobblesCheck',
            'initState',
        ]);
        rows.forEach(async (row) => {
            const item: ScrubblerItem = this.getScrubblerItemFromRow(row);
            const timestamp = getTimestampFromRow(row);
            const scrobbleExists = (await getTrackScrobbles(this.db, item)).length > 0;
            let icon: TrackIcon | MissingIcon = new TrackIcon(this.db);
            let iconNode: HTMLButtonElement | undefined;
            if (scrobbleExists) {
                iconNode = await icon.addIcon(row, item);
            }
            if (
                !iconNode &&
                initState === 'ready' &&
                this.receivesScrobbleRowIcon(timestamp, lastScrobblesCheck)
            ) {
                let needsMissingIcon = true;
                if (!this.capitalizationFixes.has(JSON.stringify(item))) {
                    this.capitalizationFixes.add(JSON.stringify(item));
                    const success = await fixCapitalization(item, this.db);
                    if (success) {
                        needsMissingIcon = false;
                        this.addIcons([row]);
                    }
                }
                if (needsMissingIcon) {
                    icon = new MissingIcon(this.db);
                    iconNode = await icon.addIcon(row, item, 'track');
                }
            }
            if (iconNode) {
                if (timestamp > lastScrobblesCheck) {
                    this.notFetchedMarker(iconNode);
                }
                icons.push(icon);
            }
        });
        // once again, so that the last.fm page is ready with updating
        window.setTimeout(() => {
            icons.forEach((icon) => icon.setScrobbleRowPosition());
        }, 241);
    }
    capitalizationFixes: Set<string> = new Set();
    receivesScrobbleRowIcon(timestamp: number, lastScrobblesCheck: number) {
        return Number.isNaN(timestamp) === false && lastScrobblesCheck > timestamp;
    }
    notFetchedMarker(node: HTMLElement) {
        const marker = document.createElement('div');
        marker.classList.add('not-fetched-marker');
        marker.setAttribute(
            'title',
            'this scrobble is still unfetched by ScrobbleScrubbler',
        );
        node.after(marker);
    }
}

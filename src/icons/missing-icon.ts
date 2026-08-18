/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import Icon from './icon.ts';
import { editScrobbleFormSelector } from '../lib/lastfm-page.ts';
import fixItem from '../lib/fix-item.ts';
import { ScrubblerDB } from '../services/database.ts';
import type { LibrarySubject } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

export default class MissingIcon extends Icon {
    subject?: LibrarySubject;
    constructor(db: ScrubblerDB) {
        super(db);
    }
    async addIcon(target: HTMLElement, item: ScrubblerItem, subject: LibrarySubject) {
        this.subject = subject;
        this.item = item;

        let added = false;
        this.setTitle();
        if (this.isTargetChartTable(target)) {
            this.setStyles('chart');
            added = this.addChartIcon(target);
        } else if (this.isTargetScrobbleTable(target)) {
            this.setStyles('row');
            added = this.addScrobbleRowIcon(target);
            this.setScrobbleRowPosition();
        } else if (this.isTargetHeader(target)) {
            this.setStyles('header');
            added = this.addHeaderIcon(target, subject);
        }
        if (added) {
            this.node.addEventListener('click', this.click.bind(this));
            return this.node;
        }
    }
    setTitle() {
        const detail =
            this.subject === 'artist'
                ? this.item.albumArtistName
                : this.subject === 'album'
                  ? this.item.albumName
                  : this.item.trackName;
        const points: string[] = [
            `No data were found for the ${this.subject} ${detail}. This may be due to a current scrobble that has not yet been processed or could be caused by faulty data in the ScrobbleScrubbler database.
`,
        ];
        points.push('Ctrl-Click to try a correction by rescanning.');
        this.addTitle(points);
    }
    setStyles(dest: 'row' | 'header' | 'chart') {
        this.addIconClass(dest);
        this.node.classList.add('missing-violet', 'scrobble-scrubbler-missing-icon');
    }
    async click(event: MouseEvent) {
        if (this.isMissingIcon(event.target)) {
            event.stopPropagation();
            if (event.ctrlKey) {
                const timestamp = this.itemTimestamp();
                fixItem(this.db, this.item, timestamp);
                this.rotateIcon(30000);
            }
        }
    }
    isMissingIcon(node: EventTarget | null): node is HTMLButtonElement {
        return (
            node instanceof HTMLButtonElement &&
            node.classList.contains('scrobble-scrubbler-missing-icon')
        );
    }
    itemTimestamp(): number | undefined {
        let row: HTMLTableRowElement | null = null;
        if (this.node.closest('td')?.classList.contains('chartlist-timestamp')) {
            row = this.node.closest('tr');
        } else if (this.subject === 'track') {
            row = document.querySelector(
                'table.chartlist tr.chartlist-row:not(tr.chartlist__placeholder-row)',
            );
        }
        if (row) {
            const timestamp = row?.querySelector<HTMLInputElement>(
                `${editScrobbleFormSelector} input[name=timestamp]`,
            )?.value;
            if (timestamp) {
                return parseInt(timestamp);
            }
        }
    }
    rotateIcon(timeout: number) {
        this.node.classList.add('spin');
        this.node.title =
            'Trying to correct the data, please be patient for a little minute.';
        const timer = setTimeout(() => {
            const selector = `button.scrobble-scrubbler-missing-icon.spin[data-timer="${String(timer)}"]`;
            const icon = document.querySelector<HTMLElement>(selector);
            if (
                icon &&
                icon.classList.contains('spin') &&
                icon.dataset.timer === String(timer)
            ) {
                icon.classList.remove('spin');
                this.setTitle();
                alert(
                    'This is taking too long; the last.fm website might not be responding. Or check the console for errors.',
                );
            }
        }, timeout);
        this.node.setAttribute('data-timer', String(timer));
    }
}

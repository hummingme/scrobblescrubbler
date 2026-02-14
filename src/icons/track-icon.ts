/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import InfoIcon from './info-icon.ts';
import { getTrackStats } from '../lib/data-queries.ts';
import {
    editScrobbleFormSelector,
    getScrubblerItemFromEditForm,
} from '../lib/lastfm-page.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';
import InfoPopup from '../services/info-popup.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

type TrackStats = Awaited<ReturnType<typeof getTrackStats>>;

export default class TrackIcon extends InfoIcon {
    constructor(db: ScrobbleScrubblerDB) {
        super(db);
    }
    async addIcon(target: HTMLElement, item: ScrubblerItem) {
        this.item = item;
        const stats: TrackStats = await getTrackStats(this.db, item);
        if (stats.scrobblesCount === 0) return;

        this.setTitle(stats);
        let added = false;
        if (this.isTargetChartTable(target)) {
            this.setStyles(stats, 'chart');
            added = this.addChartIcon(target);
        } else if (this.isTargetScrobbleTable(target)) {
            this.setStyles(stats, 'row');
            added = this.addScrobbleRowIcon(target);
            this.setScrobbleRowPosition();
        } else if (this.isTargetHeader(target)) {
            this.setStyles(stats, 'header');
            added = this.addHeaderIcon(target, 'track');
        }
        if (added) {
            this.node.addEventListener('click', this.boundClick);
            return this.node;
        }
    }
    setStyles(stats: TrackStats, dest: 'row' | 'header' | 'chart') {
        const { albumsCount, albumlessCount } = stats;
        let iconClass = 'disc-grey';
        if (albumlessCount > 0) {
            iconClass = 'disc-red';
        } else if (albumsCount > 1) {
            iconClass = 'disc-blue';
        }
        this.addIconClasses(iconClass, dest);
    }
    setTitle(stats: TrackStats) {
        const { albumsCount, scrobblesCount, albumlessCount } = stats;
        const points: string[] = [];
        const withalbum = scrobblesCount - albumlessCount;
        if (withalbum > 0) {
            const s1 = this.plural(withalbum);
            const s2 = this.plural(albumsCount);
            points.push(`${withalbum} scrobble${s1} from ${albumsCount} album${s2}`);
        }
        if (albumlessCount > 0) {
            const s3 = this.plural(albumlessCount);
            points.push(`${albumlessCount} scrobble${s3} with missing album`);
        }
        this.addTitle(points);
    }
    summonScrobbleInfoPopup(target: HTMLElement): void {
        const form = target
            .closest('tr')
            ?.querySelector<HTMLFormElement>(editScrobbleFormSelector);

        const item = form ? getScrubblerItemFromEditForm(form) : this.item;
        const popup = new InfoPopup(target, this.db, item, 'track');
        popup.show();
    }
}

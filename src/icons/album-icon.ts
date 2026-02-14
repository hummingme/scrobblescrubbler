/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import InfoIcon from './info-icon.ts';
import { getAlbumStats } from '../lib/data-queries.ts';
import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';
import InfoPopup from '../services/info-popup.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

type AlbumStats = Awaited<ReturnType<typeof getAlbumStats>>;

export default class AlbumIcon extends InfoIcon {
    constructor(db: ScrobbleScrubblerDB) {
        super(db);
    }
    async addIcon(target: HTMLElement, item: ScrubblerItem) {
        this.item = item;
        const stats: AlbumStats = await getAlbumStats(this.db, item);
        if (stats.scrobbelsCount === 0) return;

        this.setTitle(stats);
        let added = false;
        if (this.isTargetChartTable(target)) {
            this.setStyles(stats, 'chart');
            added = this.addChartIcon(target);
        } else if (this.isTargetHeader(target)) {
            this.setStyles(stats, 'header');
            added = this.addHeaderIcon(target, 'album');
        }
        if (added) {
            this.node.addEventListener('click', this.boundClick);
        }
        return this.node;
    }
    setStyles(stats: AlbumStats, dest: 'chart' | 'header') {
        const { albumlessCount, albumTitleAlbumsCount, otherAlbumsTracksCount } = stats;
        let iconClass = 'disc-grey';
        if (albumlessCount > 0) {
            iconClass = 'disc-red';
        } else if (albumTitleAlbumsCount > 1) {
            iconClass = 'disc-green';
        } else if (otherAlbumsTracksCount > 0) {
            iconClass = 'disc-blue';
        }
        this.addIconClasses(iconClass, dest);
    }
    /**
     * - 1 solitary album scrobble
     * - (all) AA scrobbles of the BB tracks from this album
     * - CC scrobbles of DD tracks on EE other albums
     * - FF scrobbles without album
     * - GG more albums exist with the same title
     */
    setTitle(stats: AlbumStats) {
        const {
            scrobbelsCount,
            tracksCount,
            tracksScrobblesCount,
            tracksAlbumsCount,
            albumlessCount,
            albumTitleAlbumsCount,
            otherAlbumsTracksCount,
        } = stats;

        const points: string[] = [];
        const s1 = this.plural(tracksCount);
        const s2 = this.plural(albumlessCount);
        const s3 = this.plural(otherAlbumsTracksCount);

        if (tracksScrobblesCount === 1) {
            points.push('1 solitary album scrobble');
        } else {
            const all = scrobbelsCount === tracksScrobblesCount ? 'all ' : '';
            points.push(
                `${all}${tracksScrobblesCount} scrobbles of the ${tracksCount} track${s1} from this album`,
            );
        }

        const otherCount = tracksScrobblesCount - scrobbelsCount - albumlessCount;
        if (otherCount > 0) {
            const otherAlbumsCount = tracksAlbumsCount - 1 - (albumlessCount > 0 ? 1 : 0);
            const s4 = this.plural(otherCount);
            const s5 = this.plural(otherAlbumsCount);
            points.push(
                `${otherCount} scrobble${s4} of ${otherAlbumsTracksCount} track${s3} on ${otherAlbumsCount} other album${s5}`,
            );
        }
        if (albumlessCount > 0) {
            points.push(`${albumlessCount} scrobble${s2} without album`);
        }
        if (albumTitleAlbumsCount > 1) {
            const s6 = this.plural(albumTitleAlbumsCount - 1);
            points.push(
                `${albumTitleAlbumsCount - 1} more album${s6} exist with the same title (try Ctrl-Click)`,
            );
        }
        this.addTitle(points);
    }
    summonScrobbleInfoPopup(target: HTMLElement): void {
        const popup = new InfoPopup(target, this.db, this.item, 'album');
        popup.show();
    }
    click(event: MouseEvent) {
        if (event.ctrlKey) {
            const target = event.target;
            if (this.isInfoIcon(target)) {
                event.stopPropagation();
                const item = Object.assign(emptyScrubblerItem(), {
                    albumName: this.item.albumName,
                });
                const popup = new InfoPopup(target, this.db, item, 'album-title');
                popup.show();
            }
        } else {
            super.click(event);
        }
    }
}

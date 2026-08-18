/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import InfoIcon from './info-icon.ts';
import { getArtistStats } from '../lib/data-queries.ts';
import { ScrubblerDB } from '../services/database.ts';
import InfoPopup from '../services/info-popup.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';
import { isLibraryArtistLink } from '../lib/library-links.ts';
import { hasDivergentAlbumArtistCapitalizations } from '../lib/fix-capitalization.ts';

type ArtistStats = Awaited<ReturnType<typeof getArtistStats>>;

export default class ArtistIcon extends InfoIcon {
    constructor(db: ScrubblerDB) {
        super(db);
    }
    async addIcon(target: HTMLElement, item: ScrubblerItem) {
        this.item = item;
        const stats: ArtistStats = await getArtistStats(this.db, item);
        if (
            stats.scrobblesCount === 0 ||
            (await this.hasDivergentCapitalizations(this.item.albumArtistName))
        )
            return;

        this.setTitle(stats);
        let added = false;
        if (this.isTargetChartTable(target)) {
            this.setStyles(stats, 'chart');
            added = this.addChartIcon(target);
        } else if (this.isTargetHeader(target)) {
            this.setStyles(stats, 'header');
            added = this.addHeaderIcon(target, 'artist');
        }
        if (added) {
            this.node.addEventListener('click', this.boundClick);
        }
        return this.node;
    }
    setStyles(stats: ArtistStats, dest: 'chart' | 'header') {
        const { otherAlbumsCount, albumlessCount } = stats;
        let iconClass = 'disc-grey';
        if (albumlessCount > 0) {
            iconClass = 'disc-red';
        } else if (otherAlbumsCount > 0) {
            iconClass = 'disc-blue';
        }
        this.addIconClasses(iconClass, dest);
    }
    /**
     * - 1 solitary artist scrobble
     * - (all) AA scrobbles from BB artist albums
     * - CC scrobbles from DD other artist's albums
     * - DD scrobbles without album
     */
    setTitle(stats: ArtistStats) {
        const {
            scrobblesCount,
            artistAlbumsCount,
            artistAlbumsScrobblesCount,
            otherAlbumsCount,
            otherAlbumsScrobblesCount,
            albumlessCount,
        } = stats;
        const points: string[] = [];
        if (artistAlbumsScrobblesCount > 0) {
            const all = scrobblesCount === artistAlbumsScrobblesCount ? 'all ' : '';
            const s1 = this.plural(artistAlbumsScrobblesCount);
            const s2 = this.plural(artistAlbumsCount);
            points.push(
                `${all}${artistAlbumsScrobblesCount} scrobble${s1} from ${artistAlbumsCount} artist album${s2}`,
            );
        }
        if (otherAlbumsScrobblesCount > 0) {
            const s1 = this.plural(otherAlbumsScrobblesCount);
            const s2 = this.plural(otherAlbumsCount);
            points.push(
                `${otherAlbumsScrobblesCount} scrobble${s1} from ${otherAlbumsCount} other artist's album${s2}`,
            );
        }
        if (albumlessCount > 0) {
            const s1 = this.plural(albumlessCount);
            points.push(`${albumlessCount} scrobble${s1} without album`);
        }
        this.addTitle(points);
    }
    summonScrobbleInfoPopup(target: HTMLElement): void {
        const popup = new InfoPopup(target, this.db, this.item, 'artist');
        popup.show();
    }
    async hasDivergentCapitalizations(albumArtistName: string) {
        return (
            isLibraryArtistLink(location.href) &&
            (await hasDivergentAlbumArtistCapitalizations(albumArtistName, this.db))
        );
    }
}

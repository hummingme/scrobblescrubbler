/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrubblerDB } from './database.ts';
import Settings from './settings.ts';
import AlbumIcon from '../icons/album-icon.ts';
import ArtistIcon from '../icons/artist-icon.ts';
import InfoIcon from '../icons/info-icon.ts';
import MissingIcon from '../icons/missing-icon.ts';
import TrackIcon from '../icons/track-icon.ts';
import { fixCapitalization } from '../lib/fix-capitalization.ts';
import { isLibraryUrl } from '../lib/library-links.ts';
import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import type { LibrarySubject } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

/*
 * add an icon to the header of library pages
 *
 * used on
 *   - artist library pages, https://www.last.fm/user/iriebob/library/music/Lambchop
 *   - artist album library pages, https://www.last.fm/user/iriebob/library/music/Lambchop/How+I+Quit+Smoking
 *   - artist track library pages, https://www.last.fm/user/iriebob/library/music/Lambchop/_/The+Saturday+Option
 */
export default class HeaderDecorator {
    db: ScrubblerDB;
    pageSubject?: LibrarySubject = 'artist';
    albumArtistName: string = '';
    albumName: string = '';
    item: ScrubblerItem = emptyScrubblerItem();
    stats: any;
    icon: AlbumIcon | null = null;
    constructor(db: ScrubblerDB) {
        this.db = db;
    }
    // called by observer for div nodes
    async prepareHeader(node: HTMLElement) {
        if (!isLibraryUrl(location.href)) return;
        const { initState } = await new Settings(this.db).get(['initState']);
        const isXS = window.matchMedia('(max-width: 767px)').matches;
        const target = node.querySelector<HTMLDivElement>(
            `.library-header-ctas__wrapper.${isXS ? 'visible-xs' : 'hidden-xs'}`,
        );
        const header = document.querySelector<HTMLElement>('header.library-header');
        if (!target || !header) return;

        this.pageSubject = this.determinePageSubject();
        if (!this.pageSubject) return;

        let icon: InfoIcon;
        if (this.pageSubject === 'album') {
            icon = new AlbumIcon(this.db);
        } else if (this.pageSubject === 'artist') {
            icon = new ArtistIcon(this.db);
        } else {
            icon = new TrackIcon(this.db);
        }
        if (icon) {
            const item = (this.item = this.determineScrubblerItem(
                this.pageSubject,
                header,
            ));
            const iconNode = await icon.addIcon(target, item);
            if (!iconNode && initState === 'ready') {
                let needsMissingIcon = true;
                if (!this.capitalizationFixes.has(JSON.stringify(item))) {
                    this.capitalizationFixes.add(JSON.stringify(item));
                    const success = await fixCapitalization(item, this.db);
                    if (success) {
                        needsMissingIcon = false;
                        this.prepareHeader(node);
                    }
                }
                if (needsMissingIcon) {
                    this.missingIcon(target);
                }
            }
        }
    }
    capitalizationFixes: Set<string> = new Set();

    missingIcon(node: HTMLElement) {
        if (!this.pageSubject) return;
        const icon = new MissingIcon(this.db);
        icon.addIcon(node, this.item, this.pageSubject);
    }
    determinePageSubject() {
        const activeNav = document.querySelector<HTMLElement>(
            'div.library-controls a.secondary-nav-item-link--active',
        );
        const classes = activeNav?.parentElement?.classList;
        if (classes?.contains('secondary-nav-item--artists')) {
            // no icon on artist albums- and tracks-lists
            if (location.pathname.search(/\/\+tracks|\/\+albums/) === -1) {
                return 'artist';
            }
        } else if (classes?.contains('secondary-nav-item--albums')) {
            return 'album';
        } else {
            return 'track';
        }
    }
    determineScrubblerItem(subject: LibrarySubject, header: HTMLElement) {
        const item = emptyScrubblerItem();
        if (subject === 'track') {
            item.trackName = (
                header.querySelector<HTMLElement>('h2')?.firstChild?.textContent || ''
            ).trim();
            item.artistName =
                header.querySelector<HTMLElement>('a.text-colour-link')?.innerText || '';
        }
        if (subject === 'album') {
            item.albumName = header.querySelector<HTMLElement>('h2')?.innerText || '';
        }
        if (subject === 'artist' || subject === 'album') {
            item.albumArtistName =
                subject === 'artist'
                    ? header.querySelector<HTMLElement>('h2')?.innerText || ''
                    : header.querySelector<HTMLElement>('a.text-colour-link')
                          ?.innerText || '';
        }
        return item;
    }
}

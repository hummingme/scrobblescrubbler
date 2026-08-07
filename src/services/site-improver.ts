/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from './database.ts';
import { isLibraryArtistLink } from '../lib/library-links.ts';

export default class SiteImprover {
    db: ScrobbleScrubblerDB;
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
    }
    process(node: HTMLElement) {
        this.improveLibraryArtistPage(node);
    }
    improveLibraryArtistPage(node: HTMLElement) {
        if (!isLibraryArtistLink(location.href)) return;

        const metadataLists = node.querySelectorAll('ul.metadata-list');
        if (metadataLists.length !== 1) return;

        const metadataDisplays =
            metadataLists[0].querySelectorAll<HTMLElement>('p.metadata-display');
        if (metadataDisplays.length !== 3) return;

        this.linkifyItemCount(metadataDisplays[1], '+albums');
        this.linkifyItemCount(metadataDisplays[2], '+tracks');
    }
    private linkifyItemCount(p: HTMLElement, urlSuffix: string) {
        if (!p.firstChild) return;

        const link = document.createElement('a');
        link.style.color = 'inherit';
        link.href = `${location.href}/${urlSuffix}`;
        link.textContent = p.textContent;
        p.replaceChildren(link);
    }
}

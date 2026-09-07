/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html } from 'lit-html';

import { getUserUrl } from './lastfm-page.ts';
import { loadUrl } from './load-url.ts';

export function libraryTrackLink(trackname: string, artistname: string) {
    const track = encode(trackname);
    const artist = encode(artistname);
    const url = `${getUserUrl()}/library/music/+noredirect/${artist}/_/${track}`;
    return html`
        <a @click="${libraryLinkClicked}" href="${url}">${trackname}</a>
    `;
}

export function libraryAlbumLink(albumname: string, artistname: string) {
    const album = encode(albumname);
    const artist = encode(artistname);
    const url = `${getUserUrl()}/library/music/+noredirect/${artist}/${album}`;
    return html`
        <a @click="${libraryLinkClicked}" href="${url}">${albumname}</a>
    `;
}

export function libraryArtistLink(artistname: string, linkText?: string) {
    const artist = encode(artistname);
    const url = `${getUserUrl()}/library/music/+noredirect/${artist}`;
    return html`
        <a @click="${libraryLinkClicked}" href="${url}">
            ${linkText ? linkText : artistname}
        </a>
    `;
}

function encode(value: string) {
    // '+' in last-fm-URLs is double encoded to '%2B' to '%252b'.
    return encodeURIComponent(value).replaceAll('%20', '+').replace('%2B', '%252B');
}

export function isUserUrl(url: string) {
    return url.startsWith(`${getUserUrl()}`);
}

export function isUserOverviewUrl(url: string) {
    if (!isUserUrl(url)) {
        return false;
    }
    return !url.slice(getUserUrl().length).includes('/');
}

export function isLibraryUrl(url: string) {
    return url.startsWith(`${getUserUrl()}/library/music/`);
}

export function isLibraryTrackLink(url: string) {
    return isLibraryUrl(url) && url.includes('/_/');
}

export function isLibraryArtistLink(url: string) {
    if (!isLibraryUrl(url)) return false;
    const path = url.slice(`${getUserUrl()}/library/music/`.length);
    return !path.includes('/+albums') && !path.includes('/+tracks');
}

// click            -> opens the library link in the same tab
// ctrl-click       -> opens the item link in the same tab
function libraryLinkClicked(this: HTMLAnchorElement, event: MouseEvent) {
    const isCtrl = event.ctrlKey;
    if (!isCtrl) {
        return;
    }
    event.preventDefault();
    const targetUrl = isCtrl
        ? this.href.replace(`${getUserUrl()}/library`, '')
        : this.href;
    loadUrl(targetUrl);
}

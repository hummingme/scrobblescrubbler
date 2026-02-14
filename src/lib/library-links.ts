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
    const noRedirect = noredirect(artistname);
    const url = `${getUserUrl()}/library/music/${noRedirect}${artist}/_/${track}`;
    return html`
        <a @click="${libraryLinkClicked}" href="${url}">${trackname}</a>
    `;
}

export function libraryAlbumLink(albumname: string, artistname: string) {
    const album = encode(albumname);
    const artist = encode(artistname);
    const noRedirect = noredirect(artistname);
    const url = `${getUserUrl()}/library/music/${noRedirect}${artist}/${album}`;
    return html`
        <a @click="${libraryLinkClicked}" href="${url}">${albumname}</a>
    `;
}

export function libraryArtistLink(artistname: string, linkText?: string) {
    const artist = encode(artistname);
    const noRedirect = noredirect(artistname);
    const url = `${getUserUrl()}/library/music/${noRedirect}${artist}`;
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

export function isLibraryUrl(url: string) {
    return url.startsWith(`${getUserUrl()}/library/music/`);
}

export function isLibraryTrackLink(url: string) {
    return isLibraryUrl(url) && url.includes('/_/');
}

function noredirect(artistname: string) {
    return '+noredirect/';
    return document.location.pathname.includes(`/+noredirect/${artistname}`)
        ? '+noredirect/'
        : '';
}

function libraryLinkClicked(event: MouseEvent) {
    const target = event.target;
    if (target instanceof HTMLAnchorElement && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const url = event.ctrlKey
            ? target.href.replace(`${getUserUrl()}/library`, '')
            : target.href;
        loadUrl(url, event.metaKey);
    }
}

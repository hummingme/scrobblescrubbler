/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { dateTimeString } from './format-date.ts';
import { itemLinkSubject } from './item-links.ts';
import { editScrobbleFormSelector, getUserUrl } from './lastfm-page.ts';
import requestDocument from './request-document.ts';
import { ScrubblerDB } from '../services/database.ts';
import { error, log } from '../services/logger.ts';
import Settings from '../services/settings.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

/**
 * called by MissingItem.click()
 */
export default async function fixItem(
    db: ScrubblerDB,
    item: ScrubblerItem,
    timestamp?: number,
) {
    const { lastScrobblesCheck } = await new Settings(db).get(['lastScrobblesCheck']);
    const scrobbleTimestamp = timestamp || (await findScrobbleTimestamp(item));
    if (!scrobbleTimestamp) {
        error('fixItem failed to identify scrobbleTimestamp');
        return;
    }
    if (scrobbleTimestamp > lastScrobblesCheck / 1000) {
        window.postMessage({ type: 'CHECK_NOW', subject: 'scrobbles' });
    } else {
        window.postMessage({ type: 'CHECK_SCROBBLE', timestamp: scrobbleTimestamp });
    }
}

/**
 * if fixItem() was not called from a scrobbles list, the last scrobble timestamp
 * is determined for the examined ScrubblerItem
 */
async function findScrobbleTimestamp(item: ScrubblerItem): Promise<number | undefined> {
    const { albumName, artistName } = item;
    let { trackName, albumArtistName } = item;
    if (albumArtistName === '') {
        albumArtistName = artistName;
    }
    if (trackName === '') {
        trackName = (await findTrackName(albumArtistName, albumName)) || '';
        log(`findScrobbleTimestamp called findTrackName and got "${trackName}"`);
    }
    if (trackName === '') return;

    // get timestamp from the first scrobble on the library track list
    const url = libraryTrackUrl(albumArtistName, trackName, true);
    const dom = await requestDocument(url);
    if (dom === undefined) return;
    const value = dom.querySelector<HTMLInputElement>(
        `${editScrobbleFormSelector} input[name="timestamp"]`,
    )?.value;
    if (value) {
        log(`findScrobbleTimeStamp found ${value}, ${dateTimeString(+value)}`);
        return parseInt(value);
    }
}

async function findTrackName(
    artistName: string,
    albumName: string,
): Promise<string | undefined> {
    if (albumName && itemLinkSubject(location.href) === 'album') {
        const trackName = document.querySelector<HTMLAnchorElement>(
            'table.chartlist td.chartlist-name a',
        )?.innerText;
        return trackName;
    }

    const url = albumName
        ? libraryAlbumUrl(artistName, albumName, true)
        : libraryArtistUrl(artistName, true);
    const dom = await requestDocument(url);
    if (dom === undefined) return;
    const trackName = dom.querySelector<HTMLInputElement>(
        'form[action$="/loved"] input[name="track"]',
    )?.value;
    return trackName;
}

function libraryArtistUrl(artistName: string, noredirect?: boolean) {
    return `${getUserUrl()}/library/music/${noredirect ? '+noredirect/' : ''}${encode(artistName)}`;
}

function libraryAlbumUrl(artistName: string, albumName: string, noredirect: boolean) {
    return `${libraryArtistUrl(artistName, noredirect)}/${encode(albumName)}`;
}

function libraryTrackUrl(artistName: string, trackName: string, noredirect?: boolean) {
    return `${libraryArtistUrl(artistName, noredirect)}/_/${encode(trackName)}`;
}

function encode(value: string) {
    // '+' in last-fm-URLs is double encoded to '%2B' to '%252b'.
    return encodeURIComponent(value).replaceAll('%20', '+').replace('%2B', '%252B');
}

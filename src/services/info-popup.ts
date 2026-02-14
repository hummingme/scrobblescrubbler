/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit/directives/ref.js';

import { ScrobbleScrubblerDB } from './database.ts';
import EditPopup from './edit-popup.ts';
import { error } from './logger.ts';
import checkbox from '../lib/checkbox.ts';
import { type CheckedAlbums, checkedCount } from '../lib/checked-albums.ts';
import {
    albumArtistScrobblesCount,
    albumScrobblesCount,
    artistScrobblesCount,
    getAlbumStats,
    getAlbumTitleStats,
    getArtistStats,
    getTrackStats,
    type ArtistAlbumCountMap,
} from '../lib/data-queries.ts';
import {
    libraryAlbumLink,
    libraryArtistLink,
    libraryTrackLink,
} from '../lib/library-links.ts';
import ModalDialog from '../lib/modal-dialog.ts';
import { mapScrobbleCounts, tracksCountsTitle } from '../lib/scrobble-maps.ts';
import type { Scrobble } from '../types/lastfm.ts';
import type { ScrubblerItem, ScrubblerSubject } from '../types/scrubbler.ts';

type InfoPopupStats = Awaited<ReturnType<typeof InfoPopup.prototype.getStatistics>>;

export default class InfoPopup {
    db: ScrobbleScrubblerDB;
    item: ScrubblerItem;
    subject: ScrubblerSubject;
    anchor: HTMLElement;
    dialog: ModalDialog;
    buttonNode?: HTMLButtonElement;
    stats?: InfoPopupStats;
    artistScrobblesCount?: number;
    albumScrobblesCount?: number;
    checkedAlbums: CheckedAlbums = new Map();
    constructor(
        anchor: HTMLElement,
        db: ScrobbleScrubblerDB,
        item: ScrubblerItem,
        subject: ScrubblerSubject,
    ) {
        this.db = db;
        this.item = item;
        this.subject = subject;
        this.anchor = anchor;
        this.dialog = new ModalDialog(anchor, this.close.bind(this));
    }
    async show() {
        try {
            this.stats = await this.getStatistics();
            this.artistScrobblesCount = await this.queryArtistScrobblesCount();
            this.albumScrobblesCount = await this.queryAlbumScrobblesCount();
            this.checkedAlbums = this.initCheckedAlbums();
        } catch (err) {
            error('Failed to initialize InfoPopup', err);
        }
        if (this.anchor instanceof HTMLButtonElement) {
            this.anchor.blur(); // avoid :focus-visible when dialog is closed
        }
        this.dialog.show(this.view());
        this.dialog.setPosition(this.layerXOffset());
        this.simulateHover();
    }
    layerXOffset() {
        // to correct the shift of the icons by ::before styles in chartTables
        let x = 0;
        if (this.anchor) {
            const styles = window.getComputedStyle(this.anchor, '::before');
            x =
                (parseInt(styles.getPropertyValue('margin-right')) * -1 +
                    parseInt(styles.getPropertyValue('margin-left'))) /
                2;
        }
        return x;
    }
    initCheckedAlbums() {
        switch (this.subject) {
            case 'track':
                return this.allAlbumsChecked();
            case 'album':
                return new Map([
                    [this.item.albumArtistName, new Set([this.item.albumName])],
                ]);
            case 'artist':
            case 'album-title':
                return new Map();
        }
    }
    close() {
        if (this.anchor) {
            if (this.anchor.classList.contains('transient')) {
                this.anchor.style.visibility = 'hidden';
            }
            this.anchor.classList.remove(
                'disc-grey-hover',
                'disc-red-hover',
                'disc-blue-hover',
            );
        }
    }
    simulateHover() {
        if (this.anchor) {
            this.anchor.style.visibility = 'visible';
            for (const kind of ['grey', 'red', 'blue']) {
                if (this.anchor.classList.contains(`disc-${kind}`)) {
                    this.anchor.classList.add(`disc-${kind}-hover`);
                }
            }
        }
    }
    view() {
        if (!this.stats) return html``;
        return html`
            <div class="scrobble-scrubbler-info">
                ${this.overviewLine()} ${this.scrobbleSumsLine()}
                ${this.albumsList(this.stats)}
                <div class="scrobble-scrubbler-buttons">
                    ${this.editButton()}${this.closeButton()}
                    <div class="scrobble-scrubbler-buttons"></div>
                </div>
            </div>
        `;
    }
    overviewLine() {
        if (!this.stats) return '';
        return html`
            <div class="checkbox">
                ${checkbox({
                    '@change': this.checkAllChanged.bind(this),
                    name: 'scrobble-scrubbler-check-all',
                    checked: this.checkCheckAll(),
                })}
            </div>
            ${this.overviewMessage()}
        `;
    }
    /*
     * 505 scrobbles of Don Carlos tracks from 68 albums
     * 83 scrobbles of 10 tracks from Pure Gold
     * 10 scrobbles of Better Must Come by Don Carlos
     * 57 scrobbles of 18 tracks from 3 albums Studio Kinda Cloudy
     */
    overviewMessage() {
        if (!this.stats) return '';
        const countTitle = this.tracksCountsTitle({
            compose: this.composeCountTitleEntry(this.item.albumArtistName),
        });
        const count = html`
            <div class="count" title="${countTitle}">
                <b>${this.stats.scrobblesCount}</b>
            </div>
        `;
        const { trackName, artistName, albumName, albumArtistName } = this.item;
        let details: TemplateResult;
        switch (this.subject) {
            case 'artist':
                details = html`
                    <b>${libraryArtistLink(albumArtistName)}</b>
                    tracks from
                    <b>${this.stats.albumsCount}</b>
                    albums
                `;
                break;
            case 'album':
                details = html`
                    <b>${this.stats.tracksCount}</b>
                    tracks from
                    <b>${libraryAlbumLink(albumName, albumArtistName)}</b>
                `;
                break;
            case 'track':
                details = html`
                    <b>${libraryTrackLink(trackName, artistName)}</b>
                    by
                    <b>${libraryArtistLink(artistName)}</b>
                `;
                break;
            case 'album-title':
                details = html`
                    <b>${this.stats.tracksCount}</b>
                    tracks from
                    <b>${this.stats.albumsCount}</b>
                    albums
                    <b>${albumName}</b>
                `;
        }
        const subject = this.subject !== 'album-title' ? `${this.subject} ` : '';
        return html`
            ${count}
            <div>${subject}scrobbles of ${details}</div>
        `;
    }
    scrobbleSumsLine() {
        const { artistName, albumName, albumArtistName } = this.item;
        let artistSum: TemplateResult | undefined;
        let albumSum: TemplateResult | undefined;
        if (this.artistScrobblesCount) {
            const artist = this.subject === 'album' ? albumArtistName : artistName;
            artistSum = html`
                <div class="sum">
                    <b>${this.artistScrobblesCount}</b>
                    total
                    <b>${libraryArtistLink(artist)}</b>
                    artist scrobbles
                </div>
            `;
        }
        if (this.albumScrobblesCount && this.subject === 'track') {
            albumSum = html`
                <div class="sum">
                    <b>${this.albumScrobblesCount}</b>
                    total
                    <b>${libraryAlbumLink(albumName, albumArtistName)}</b>
                    album scrobbles
                </div>
            `;
        }
        return html`
            ${artistSum} ${albumSum}
        `;
    }
    albumsList(stats: InfoPopupStats) {
        const artistName =
            this.subject === 'track' ? this.item.artistName : this.item.albumArtistName;
        return html`
            ${this.albumlessList(stats.albumlessCount)}
            ${this.artistAlbumsList(stats.albumsScrobbleCounts, artistName)}
            ${this.otherAlbumsList(stats.albumsScrobbleCounts, artistName)}
        `;
    }
    albumlessList(albumlessCount: number) {
        const listItems: TemplateResult[] = [];
        if (albumlessCount > 0) {
            const checked = this.checkCheckbox('', '');
            const countTitle = this.tracksCountsTitle({
                filter: (s: Scrobble) => typeof s.album_name === 'undefined',
                compose: this.composeCountTitleEntry(this.item.albumArtistName),
            });
            listItems.push(html`
                <div class="head">
                    without album data
                    <div></div>
                </div>
            `);
            listItems.push(html`
                <div class="checkbox">${this.checkbox('', '', checked)}</div>
                <div class="count" title="${countTitle}">${albumlessCount}</div>
                <div>scrobbles</div>
            `);
        }
        return html`
            ${listItems}
        `;
    }
    artistAlbumsList(albumsScrobbleCounts: ArtistAlbumCountMap, artistName: string) {
        const listItems: TemplateResult[] = [];
        if (albumsScrobbleCounts.has(artistName)) {
            listItems.push(html`
                <div class="head">
                    ${libraryArtistLink(artistName, 'artist albums')}
                    <div></div>
                </div>
            `);
            const artistAlbums = albumsScrobbleCounts.get(artistName)!;
            artistAlbums.forEach((count: number, album: string) => {
                const checked = this.checkCheckbox(artistName, album);
                const countTitle = this.tracksCountsTitle({
                    filter: (s: Scrobble) =>
                        s.album_name === album && s.album_artist_name === artistName,
                    compose: this.composeCountTitleEntry(this.item.albumArtistName),
                });
                listItems.push(html`
                    <div class="checkbox">
                        ${this.checkbox(album, artistName, checked)}
                    </div>
                    <div class="count" title="${countTitle}">${count}</div>
                    <div>${libraryAlbumLink(album, artistName)}</div>
                `);
            });
        }
        return html`
            ${listItems}
        `;
    }
    otherAlbumsList(albumsScrobbleCounts: ArtistAlbumCountMap, artistName: string) {
        const listItems: TemplateResult[] = [];
        albumsScrobbleCounts.forEach(
            (artistsAlbums: Map<string, number>, artist: string) => {
                if (artist === artistName) return;
                listItems.push(html`
                    <div class="head">
                        ${libraryArtistLink(artist)}
                        <div></div>
                    </div>
                `);
                artistsAlbums.forEach((count: number, album: string) => {
                    const checked = this.checkCheckbox(artist, album);
                    const countTitle = this.tracksCountsTitle({
                        filter: (s: Scrobble) =>
                            s.album_name === album && s.album_artist_name === artist,
                        compose: this.composeCountTitleEntry(artist),
                    });
                    listItems.push(html`
                        <div class="checkbox">
                            ${this.checkbox(album, artist, checked)}
                        </div>
                        <div class="count" title="${countTitle}">${count}</div>
                        <div>${libraryAlbumLink(album, artist)}</div>
                    `);
                });
            },
        );
        return html`
            ${listItems}
        `;
    }
    /*
     * change handler of the checkbox in the total scrobbles line
     * this checkbox acts like a 'select all / deselect all' checkbox
     */
    checkAllChanged(event: InputEvent) {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            this.checkedAlbums = new Map();
            if (target.checked === true) {
                this.checkedAlbums = this.allAlbumsChecked();
            }
            this.dialog.dialogNode
                .querySelectorAll<HTMLInputElement>('input[type=checkbox]')
                .forEach((cb) => (cb.checked = target.checked));
            this.updateButton();
        }
    }
    allAlbumsChecked() {
        const checked = new Map();
        if (this.stats) {
            for (const [albumArtist, albumMap] of this.stats.albumsScrobbleCounts) {
                checked.set(albumArtist, new Set(albumMap.keys()));
            }
            if (this.stats.albumlessCount > 0) {
                checked.set('', new Set(['']));
            }
        }
        return checked;
    }
    updateCheckAll() {
        const checked = this.checkCheckAll();
        const checkAll = this.dialog.dialogNode.querySelector<HTMLInputElement>(
            'input[name=scrobble-scrubbler-check-all]',
        );
        if (checkAll) checkAll.checked = checked;
    }
    checkbox(album: string, artist: string, checked?: boolean) {
        return checkbox({
            'data-album': album,
            'data-artist': artist,
            '@change': this.checkboxChanged.bind(this),
            checked,
        });
    }
    checkboxChanged(event: InputEvent) {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            const album = target.dataset['album'] || '';
            const artist = target.dataset['artist'] || '';
            if (!this.checkedAlbums.has(artist)) {
                this.checkedAlbums.set(artist, new Set());
            }
            const checkedArtistAlbums = this.checkedAlbums.get(artist)!;
            if (target.checked) {
                checkedArtistAlbums.add(album);
            } else {
                checkedArtistAlbums.delete(album);
            }
            this.updateButton();
            this.updateCheckAll();
        }
    }
    editButton() {
        const { disabled } = this.buttonProps();
        return html`
            <button
                class="btn-primary"
                @click=${this.buttonClicked.bind(this)}
                ?disabled=${disabled}
                ${ref(this.buttonReady.bind(this))}
            >
                edit scrobbles
            </button>
        `;
    }
    closeButton() {
        return html`
            <button class="btn-secondary" @click=${this.dialog.close.bind(this.dialog)}>
                Close
            </button>
        `;
    }
    buttonReady(node?: Element) {
        if (node instanceof HTMLButtonElement) {
            this.buttonNode = node;
        }
    }
    updateButton() {
        const button = this.buttonNode;
        if (button) {
            const { disabled } = this.buttonProps();
            button.disabled = disabled;
        }
    }
    buttonProps() {
        const count = checkedCount(this.checkedAlbums);
        const disabled = count === 0;
        return { disabled };
    }
    buttonClicked(event: Event) {
        if (checkedCount(this.checkedAlbums) > 0) {
            this.dialog.close(event);
            new EditPopup(this.db, this.item, this.subject, this.checkedAlbums).show();
        }
    }
    checkCheckbox(artist: string, album: string) {
        return this.checkedAlbums.get(artist)?.has(album);
    }
    checkCheckAll() {
        const stats = this.stats;
        if (!stats) return false;
        const checkboxCount = stats.albumsCount + (stats.albumlessCount > 0 ? 1 : 0);
        return checkboxCount === checkedCount(this.checkedAlbums);
    }
    composeCountTitleEntry(artist: string) {
        return (s: Scrobble) => {
            return s.artist_name !== artist && s.artist_name !== this.item.albumArtistName
                ? `${s.track_name} - ${s.artist_name}`
                : s.track_name;
        };
    }
    tracksCountsTitle({
        filter,
        compose,
    }: {
        filter?: (s: Scrobble) => boolean;
        compose?: (s: Scrobble) => string;
    }): string | undefined {
        if (!this.stats) return;
        if (this.subject === 'track') return;
        const scrobbles = filter
            ? this.stats.trackScrobbles.filter(filter)
            : this.stats.trackScrobbles;
        const tracksCountsMap = mapScrobbleCounts(scrobbles, 'track_name', compose);
        return tracksCountsTitle(tracksCountsMap);
    }
    async getStatistics() {
        if (this.subject === 'track') {
            return Object.assign(await getTrackStats(this.db, this.item), {
                tracksCount: null,
            });
        } else if (this.subject === 'album') {
            const albumStats = await getAlbumStats(this.db, this.item);
            return {
                scrobblesCount: albumStats.tracksScrobblesCount,
                albumsCount: albumStats.albumsCount,
                albumsScrobbleCounts: albumStats.albumsScrobbleCounts,
                albumlessCount: albumStats.albumlessCount,
                tracksCount: albumStats.tracksCount,
                trackScrobbles: albumStats.trackScrobbles,
            };
        } else if (this.subject === 'artist') {
            const artistStats = await getArtistStats(this.db, this.item);
            return {
                scrobblesCount: artistStats.scrobblesCount,
                albumsCount: artistStats.artistAlbumsCount + artistStats.otherAlbumsCount,
                albumsScrobbleCounts: artistStats.albumsScrobbleCounts,
                albumlessCount: artistStats.albumlessCount,
                tracksCount: null,
                trackScrobbles: artistStats.trackScrobbles,
            };
        } else {
            // this.subject === 'album-title'
            return await getAlbumTitleStats(this.db, this.item);
        }
    }
    async queryArtistScrobblesCount() {
        if (this.subject === 'track' || this.subject === 'album') {
            return this.subject === 'track'
                ? await artistScrobblesCount(this.db, this.item.artistName)
                : await albumArtistScrobblesCount(this.db, this.item.albumArtistName);
        }
    }
    async queryAlbumScrobblesCount() {
        if (this.subject === 'track' || this.subject === 'album') {
            return await albumScrobblesCount(
                this.db,
                this.item.albumArtistName,
                this.item.albumName,
            );
        }
    }
}

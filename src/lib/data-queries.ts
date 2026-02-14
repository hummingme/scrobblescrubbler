/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import type { ArtistAlbums } from './checked-albums.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';
import type { Scrobble } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

export async function getTrackScrobbles(
    db: ScrobbleScrubblerDB,
    item: ScrubblerItem,
    timestamp?: number,
): Promise<Scrobble[]> {
    return await db.scrobbles
        .where('track_name')
        .equals(item.trackName)
        .and((scrobble: Scrobble) => {
            if (timestamp && timestamp !== scrobble.timestamp) {
                return false;
            }
            return scrobble.artist_name === item.artistName;
        })
        .toArray();
}

async function getAlbumScrobbles(
    db: ScrobbleScrubblerDB,
    item: ScrubblerItem,
): Promise<Scrobble[]> {
    return await db.scrobbles
        .where('album_name')
        .equals(item.albumName)
        .and((scrobble: Scrobble) => scrobble.album_artist_name === item.albumArtistName)
        .toArray();
}

export async function getCheckedTrackScrobbles(
    db: ScrobbleScrubblerDB,
    item: Pick<ScrubblerItem, 'artistName' | 'trackName'>,
    albums: ArtistAlbums,
) {
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('track_name')
        .equals(item.trackName)
        .and((scrobble: Scrobble) => scrobble.artist_name === item.artistName)
        .and(checkedAlbumsFilter(albums))
        .toArray();
    return scrobbles;
}

export async function getCheckedAlbumScrobbles(
    db: ScrobbleScrubblerDB,
    item: ScrubblerItem,
    albums: ArtistAlbums,
) {
    const albumScrobbles = await getAlbumScrobbles(db, item);
    const tracks = scrobbleTracks(albumScrobbles);
    const trackNames = tracks.map((track) => track.track);
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('track_name')
        .anyOf(trackNames)
        .and((scrobble: Scrobble) => {
            return tracks.some((track) => {
                return (
                    scrobble.track_name === track.track &&
                    scrobble.artist_name === track.artist
                );
            });
        })
        .and(checkedAlbumsFilter(albums))
        .toArray();
    return scrobbles;
}

export async function getCheckedArtistScrobbles(
    db: ScrobbleScrubblerDB,
    item: ScrubblerItem,
    albums: ArtistAlbums,
) {
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('artist_name')
        .equals(item.albumArtistName)
        .and(checkedAlbumsFilter(albums))
        .toArray();
    return scrobbles;
}

export async function getCheckedAlbumTitleScrobbles(
    db: ScrobbleScrubblerDB,
    item: ScrubblerItem,
    albums: ArtistAlbums,
) {
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('album_name')
        .equalsIgnoreCase(item.albumName)
        .and(checkedAlbumsFilter(albums))
        .toArray();
    return scrobbles;
}

function checkedAlbumsFilter(albums: ArtistAlbums) {
    return (scrobble: Scrobble) => {
        const albumArtist = scrobble.album_artist_name || '';
        const albumName = scrobble.album_name || '';
        return albums.some((entry) => {
            return entry.artist === albumArtist && entry.album === albumName;
        });
    };
}

export async function getTrackStats(db: ScrobbleScrubblerDB, item: ScrubblerItem) {
    const scrobbles = await getTrackScrobbles(db, item);
    const artistsAlbums = new Set(
        scrobbles.map(
            (scrobble) => `${scrobble.album_artist_name}${scrobble.album_name}`,
        ),
    );
    const albumlessCount = scrobbles.reduce(
        (sum, scrobble) => (scrobble.album_name === undefined ? sum + 1 : sum),
        0,
    );
    const albumsScrobbleCounts = sortedAlbumsScrobbleCounts(scrobbles);
    return {
        scrobblesCount: scrobbles.length,
        albumsCount: albumlessCount > 0 ? artistsAlbums.size - 1 : artistsAlbums.size,
        albumsScrobbleCounts,
        albumlessCount,
        trackScrobbles: scrobbles,
    };
}

export async function getAlbumStats(db: ScrobbleScrubblerDB, item: ScrubblerItem) {
    const { albumName, albumArtistName } = item;
    const scrobbles = await getAlbumScrobbles(db, item);
    const artistsTracks = scrobbleTracks(scrobbles);
    const artistsTracksTracks = new Set(scrobbles.map((scrobble) => scrobble.track_name));

    const tracksScrobbles: Scrobble[] = await db.scrobbles
        .where('track_name')
        .anyOf(...artistsTracksTracks)
        .and((scrobble: Scrobble) => {
            return artistsTracks.some((entry) => {
                return (
                    entry.track === scrobble.track_name &&
                    entry.artist === scrobble.artist_name
                );
            });
        })
        .toArray();
    const tracksAlbums = new Set(
        tracksScrobbles.map(
            (scrobble) => `${scrobble.album_artist_name}${scrobble.album_name}`,
        ),
    );
    const albumlessCount = tracksScrobbles.reduce((sum, scrobble) => {
        return scrobble.album_name === undefined ? sum + 1 : sum;
    }, 0);
    const otherAlbumsTracks = new Set(
        tracksScrobbles
            .filter(
                (scrobble) =>
                    scrobble.album_artist_name !== albumArtistName ||
                    scrobble.album_name !== albumName,
            )
            .map((scrobble) => `${scrobble.artist_name}${scrobble.track_name}`),
    );
    const albumTitleScrobbles: Scrobble[] = await db.scrobbles
        .where('album_name')
        .equalsIgnoreCase(albumName)
        .toArray();
    const albumsScrobbleCounts = sortedAlbumsScrobbleCounts(tracksScrobbles);
    const albumsCount = Array.from(albumsScrobbleCounts.values()).reduce(
        (acc, albumMap) => acc + albumMap.size,
        0,
    );
    return {
        scrobbelsCount: scrobbles.length,
        tracksCount: countTracks(scrobbles),
        tracksScrobblesCount: tracksScrobbles.length,
        tracksAlbumsCount: tracksAlbums.size,
        albumlessCount,
        albumTitleAlbumsCount: countAlbums(albumTitleScrobbles),
        otherAlbumsTracksCount: otherAlbumsTracks.size,
        albumsScrobbleCounts,
        albumsCount,
        trackScrobbles: await getScrobblesTracksScrobbles(db, scrobbles),
    };
}

export async function getAlbumTitleStats(db: ScrobbleScrubblerDB, item: ScrubblerItem) {
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('album_name')
        .equalsIgnoreCase(item.albumName)
        .toArray();
    return {
        scrobblesCount: scrobbles.length,
        albumsCount: countAlbums(scrobbles),
        albumsScrobbleCounts: sortedAlbumsScrobbleCounts(scrobbles),
        tracksCount: countTracks(scrobbles),
        albumlessCount: 0,
        trackScrobbles: await getScrobblesTracksScrobbles(db, scrobbles),
    };
}

export async function getArtistStats(db: ScrobbleScrubblerDB, item: ScrubblerItem) {
    const albumArtistName = item.albumArtistName;
    const scrobbles: Scrobble[] = await db.scrobbles
        .where('artist_name')
        .equals(albumArtistName)
        .toArray();
    const artistAlbums: Set<string> = new Set();
    const otherAlbums: Set<string> = new Set();
    let artistAlbumsScrobblesCount = 0,
        otherAlbumsScrobblesCount = 0,
        albumlessCount = 0;

    for (const scrobble of scrobbles) {
        const albumKey = `${scrobble.album_artist_name}${scrobble.album_name}`;
        if (scrobble.album_artist_name === albumArtistName) {
            artistAlbumsScrobblesCount++;
            artistAlbums.add(albumKey);
        } else if (typeof scrobble.album_artist_name === 'string') {
            otherAlbumsScrobblesCount++;
            otherAlbums.add(albumKey);
        } else {
            albumlessCount++;
        }
    }

    const albumsScrobbleCounts = sortedAlbumsScrobbleCounts(scrobbles);

    return {
        scrobblesCount: scrobbles.length,
        artistAlbumsCount: artistAlbums.size,
        artistAlbumsScrobblesCount,
        otherAlbumsCount: otherAlbums.size,
        otherAlbumsScrobblesCount,
        albumlessCount,
        albumsScrobbleCounts,
        trackScrobbles: await getScrobblesTracksScrobbles(db, scrobbles),
    };
}

async function getScrobblesTracksScrobbles(
    db: ScrobbleScrubblerDB,
    scrobbles: Scrobble[],
) {
    const tracks = scrobbleTracks(scrobbles);
    const trackNames = tracks.map((track) => track.track);
    return await db.scrobbles
        .where('track_name')
        .anyOf(trackNames)
        .and((scrobble: Scrobble) => {
            return tracks.some((track) => {
                return (
                    scrobble.track_name === track.track &&
                    scrobble.artist_name === track.artist
                );
            });
        })
        .toArray();
}

function countAlbums(scrobbles: Scrobble[]) {
    const albums: Set<string> = new Set();
    for (const scrobble of scrobbles) {
        albums.add(`${scrobble.album_artist_name}${scrobble.album_name}`);
    }
    return albums.size;
}

function countTracks(scrobbles: Scrobble[]) {
    const tracks: Set<string> = new Set();
    for (const scrobble of scrobbles) {
        tracks.add(`${scrobble.artist_name}${scrobble.track_name}`);
    }
    return tracks.size;
}

export type ArtistAlbumCountMap = Map<string, Map<string, number>>;

function sortedAlbumsScrobbleCounts(scrobbles: Scrobble[]): ArtistAlbumCountMap {
    const albumsScrobbles: ArtistAlbumCountMap = new Map();
    scrobbles.forEach((scrobble: Scrobble) => {
        if (!scrobble.album_artist_name) return;
        const artist = scrobble.album_artist_name;
        if (!albumsScrobbles.has(artist)) {
            albumsScrobbles.set(artist, new Map());
        }
        const artistAlbumScrobbles = albumsScrobbles.get(artist)!;
        const album = scrobble.album_name!;
        if (!artistAlbumScrobbles.has(album)) {
            artistAlbumScrobbles.set(album, 0);
        }
        artistAlbumScrobbles.set(album, artistAlbumScrobbles.get(album)! + 1);
    });

    // sort artists by scrobbles count (first) and artist name (second)
    const albumsScrobblesSorted = new Map(
        Array.from(albumsScrobbles).sort((a, b) => {
            const bCount = [...b[1].values()].reduce(
                (acc: number, cur: number) => acc + cur,
                0,
            );
            const aCount = [...a[1].values()].reduce(
                (acc: number, cur: number) => acc + cur,
                0,
            );
            return bCount !== aCount ? bCount - aCount : a[0] < b[0] ? -1 : 0;
        }),
    );
    // sort albums by scrobble count (first) and album title (second)
    albumsScrobblesSorted.forEach((albums: Map<string, number>, artist: string) => {
        const albumsSorted = new Map(
            Array.from(albums).sort((a, b) => {
                return a[1] !== b[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1;
            }),
        );
        albumsScrobblesSorted.set(artist, albumsSorted);
    });

    return new Map(albumsScrobblesSorted);
}

function scrobbleTracks(scrobbles: Scrobble[]): { artist: string; track: string }[] {
    const tracksMap = new Map(
        scrobbles.map((scrobble) => [
            `${scrobble.artist_name}${scrobble.track_name}`,
            { artist: scrobble.artist_name, track: scrobble.track_name },
        ]),
    );
    return [...tracksMap.values()];
}

export async function artistScrobblesCount(
    db: ScrobbleScrubblerDB,
    artistName: string,
): Promise<number> {
    return (await db.scrobbles.where('artist_name').equals(artistName).primaryKeys())
        .length;
}

export async function trackScrobblesCount(
    db: ScrobbleScrubblerDB,
    artistName: string,
    trackName: string,
): Promise<number> {
    return (
        await db.scrobbles
            .where('track_name')
            .equals(trackName)
            .and((scrobble: Scrobble) => scrobble.artist_name === artistName)
            .primaryKeys()
    ).length;
}

export async function albumScrobblesCount(
    db: ScrobbleScrubblerDB,
    albumArtistName: string,
    albumName: string,
): Promise<number> {
    return (
        await db.scrobbles
            .where('album_name')
            .equals(albumName)
            .and((scrobble: Scrobble) => scrobble.album_artist_name === albumArtistName)
            .primaryKeys()
    ).length;
}

export async function albumArtistScrobblesCount(
    db: ScrobbleScrubblerDB,
    albumArtistName: string,
): Promise<number> {
    return (
        await db.scrobbles
            .where('album_artist_name')
            .equals(albumArtistName)
            .primaryKeys()
    ).length;
}

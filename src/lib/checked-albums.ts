/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export type CheckedAlbums = Map<string, Set<string>>; // Map<artist_name, Set<album_name>>

export function checkedCount(checkedAlbums: CheckedAlbums) {
    return [...checkedAlbums.entries()].reduce(
        (acc: number, entry: [string, Set<string>]) => acc + entry[1].size,
        0,
    );
}

export type ArtistAlbums = { artist: string; album: string }[];

export function checkedArtistAlbums(checkedAlbums: CheckedAlbums): ArtistAlbums {
    const artistAlbums: ArtistAlbums = [];
    checkedAlbums.forEach((albums: Set<string>, artist: string) => {
        albums.forEach((album: string) => {
            artistAlbums.push({ artist, album });
        });
    });
    return artistAlbums;
}

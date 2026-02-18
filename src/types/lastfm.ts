/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export type LibrarySubject = 'track' | 'album' | 'artist';

export type Scrobble = {
    timestamp: number;
    sequence: number;
    artist_name: string;
    track_name: string;
    album_artist_name?: string;
    album_name?: string;
};
export const scrobbleFields = [
    'artist_name',
    'track_name',
    'album_name',
    'album_artist_name',
    'timestamp',
] as const;

export type ScrobbleFieldKey = (typeof scrobbleFields)[number];

export type ScrobbleBase = Omit<Scrobble, 'sequence'>;

export type ScrobbleField = keyof Omit<ScrobbleBase, 'timestamp'>;

export interface TrackEdit {
    hash: string;
    position: number;
    track_name: string;
    track_name_original: string;
    artist_name: string;
    artist_name_original: string;
    album_name: string;
    album_name_original: string;
    album_artist_name: string;
    album_artist_name_original: string;
}

export const editFormKeys = [
    'artist_name',
    'artist_name_original',
    'track_name',
    'track_name_original',
    'album_name',
    'album_name_original',
    'album_artist_name',
    'album_artist_name_original',
    'timestamp',
] as const;
export type EditFormKey = (typeof editFormKeys)[number];
export type EditFormValues = Record<EditFormKey, string>;

export type ExtendedEditFormValues = EditFormValues & {
    create_automatic_edit_rule?: string;
    edit_all?: 'on';
};

export const editAlbumFormKeys = [
    'album_name',
    'album_name_original',
    'album_artist_name',
    'album_artist_name_original',
] as const;
export type EditAlbumFormKey = (typeof editAlbumFormKeys)[number];
export type EditAlbumFormValues = Record<EditAlbumFormKey, string>;

export const deleteFormKeys = ['artist_name', 'track_name', 'timestamp'] as const;
export type DeleteFormKey = (typeof deleteFormKeys)[number];
export type DeleteFormValues = Record<DeleteFormKey, string>;

export const deleteTrackEditFormKeys = editFormKeys.filter((key) => key !== 'timestamp');
export type DeleteTrackEditFormKey = (typeof deleteTrackEditFormKeys)[number];
export type DeleteTrackEditFormValues = Record<DeleteTrackEditFormKey, string>;

export interface Loved {
    track_name: string;
    artist_name: string;
}

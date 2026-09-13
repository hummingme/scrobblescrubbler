/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import type { InitState, SettingTypes } from './settings.ts';
import type {
    DeleteTrackEditFormValues,
    DeleteFormValues,
    EditAlbumFormValues,
    EditFormValues,
    LibrarySubject,
} from '../types/lastfm.ts';
import type { ScrubblerItem } from './scrubbler.ts';

export const isMessage = (message: any): message is Message => {
    return (
        typeof message === 'object' &&
        message !== null &&
        typeof message.type === 'string'
    );
};

export type Message =
    | ActiveTabMessage
    | CheckNowMessage
    | CheckScrobbleMessage
    | ContentReadyMessage
    | ExternalDeleteItemMessage
    | ExternalDeleteScrobbleMessage
    | ExternalDeleteTrackeditMessage
    | ExternalEditAlbumMessage
    | ExternalEditScrobbleMessage
    | GetStateMesssage
    | InitializeInitMessage
    | JobsChangedMessage
    | ReloadTabMessage
    | RefetchDayMessage
    | RunningMandateMessage
    | SendStateMesssage
    | SetStateMessage
    | BackgroundSettingsMessage;

export type ActiveTabMessage = {
    type: 'ACTIVE_TAB';
    tabId?: number;
    options: { loggingEnabled: boolean };
};
export type CheckNowMessage = {
    type: 'CHECK_NOW';
    subject: 'scrobbles' | 'edits';
};
export type CheckScrobbleMessage = {
    type: 'CHECK_SCROBBLE';
    timestamp: number;
};
export type ContentReadyMessage = {
    type: 'CONTENT_READY';
};
export type ExternalDeleteItemMessage = {
    type: 'EXTERNAL_DELETE_ITEM';
    subject: LibrarySubject;
    item: ScrubblerItem;
};
export type ExternalDeleteScrobbleMessage = {
    type: 'EXTERNAL_DELETE_SCROBBLE';
    data: DeleteFormValues;
};
export type ExternalDeleteTrackeditMessage = {
    type: 'EXTERNAL_DELETE_TRACKEDIT';
    data: DeleteTrackEditFormValues;
};
export type ExternalEditAlbumMessage = {
    type: 'EXTERNAL_EDIT_ALBUM';
    data: EditAlbumFormValues;
};
export type ExternalEditScrobbleMessage = {
    type: 'EXTERNAL_EDIT_SCROBBLE';
    data: EditFormValues;
};
export type GetStateMesssage = {
    type: 'GET_STATE';
};
export type InitializeInitMessage = {
    type: 'INITIALIZE_INIT';
};
export type JobsChangedMessage = {
    type: 'JOBS_CHANGED';
    jobsCount: number;
};
export type RefetchDayMessage = {
    type: 'REFETCH_DAY';
    timestamp: number;
};
export type ReloadTabMessage = {
    type: 'RELOAD_TAB';
    url: string;
};
export type RunningMandateMessage = {
    type: 'RUNNING_MANDATE';
};
export type SendStateMesssage = {
    type: 'SEND_STATE';
    payload: StatePayload;
};
export type SetStateMessage = {
    type: 'SET_STATE';
    payload: SetStatePayLoad;
};
export type BackgroundSettingsMessage = {
    type: 'BACKGROUND_SETTINGS';
    settings: { loggingEnabled: boolean };
};

type SetStateKeys = 'processJobs' | 'observeScrobbles' | 'observeEdits';

export type SetStatePayLoad = Partial<Pick<SettingTypes, SetStateKeys>>;

export type StatePayload = {
    initState: InitState;
    processJobs: boolean;
    observeScrobbles: boolean;
    observeEdits: boolean;
    scrobblesCount: number;
    scrobblesFetched: number;
    scrobblesJobs: number;
    editsCount: number;
    editsFetched: number;
    editsJobs: number;
    editScrobbleJobs: number;
    deleteEditJobs: number;
    deleteScrobbleJobs: number;
    secondsRemaining: number;
};

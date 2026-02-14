/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { EditFormData } from '../services/edit-popup.ts';
import { DeleteFormValues } from '../types/lastfm.ts';

export type JobType =
    | 'getScrobbles'
    | 'getTrackedits'
    | 'editScrobble'
    | 'deleteEdit'
    | 'deleteScrobble';

export type JobState = 'waiting' | 'running' | 'done' | 'failed';

type Timestamp = number;

type JobBase = {
    id?: number;
    job: JobType;
    state: JobState;
    retries: number;
    hash: string;
    modified: Timestamp;
};

export type FetchScrobblesJob = JobBase & {
    job: 'getScrobbles';
    data: { page: number; url: string; init?: boolean; retry?: boolean };
};

export type FetchTrackeditsJob = JobBase & {
    job: 'getTrackedits';
    data: { page: number; init?: boolean; retry?: boolean };
};

export type DeleteEditJob = JobBase & {
    job: 'deleteEdit';
    data: { hash: string };
};

export type EditScrobbleJob = JobBase & {
    job: 'editScrobble';
    data: EditFormData;
};

export type DeleteScrobbleJob = JobBase & {
    job: 'deleteScrobble';
    data: DeleteFormValues;
};

export type Job =
    | FetchScrobblesJob
    | FetchTrackeditsJob
    | EditScrobbleJob
    | DeleteEditJob
    | DeleteScrobbleJob;

export type FetchJob = FetchScrobblesJob | FetchTrackeditsJob;

export type JobResponse = {
    job: Job;
    success: boolean;
};

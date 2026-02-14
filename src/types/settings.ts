/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export interface SettingTypes {
    initState: InitState;
    processJobs: boolean;
    observeScrobbles: boolean;
    observeEdits: boolean;
    scrobblesCount: number;
    lastScrobblesCheck: number;
    editsCount: number;
    lastEditsCheck: number;
    csrfmiddlewaretoken: string;
    automaticEditChecked: boolean;
    pageReloadChecked: boolean;
    pageReloadUrl: string;
    loggingEnabled: boolean;
}

export type SettingKey = keyof SettingTypes;

export type Setting<K extends SettingKey = SettingKey> = {
    name: K;
    value: SettingTypes[K];
};

export type InitState = 'waiting' | 'pending' | 'running' | 'ready';

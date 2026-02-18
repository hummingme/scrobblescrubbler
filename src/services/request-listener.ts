/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getActiveTabId } from '../lib/background.ts';
import { namespace } from '../lib/runtime.ts';
import {
    type EditAlbumFormKey,
    editAlbumFormKeys,
    type EditFormKey,
    editFormKeys,
    type DeleteTrackEditFormKey,
    deleteTrackEditFormKeys,
    type DeleteFormKey,
    deleteFormKeys,
} from '../types/lastfm.ts';

type FormDataEntry = Record<string, chrome.webRequest.FormDataItem[]>;

export default class RequestListener {
    urls = [
        'https://www.last.fm/user/*/library/*',
        'https://www.last.fm/settings/subscription/automatic-edits/*',
    ];
    pendingRequests: Map<string, FormDataEntry> = new Map();
    loggingEnabled?: boolean;
    constructor() {}
    listen() {
        chrome.webRequest.onBeforeRequest.addListener(
            this.onBeforeRequestListener.bind(this),
            {
                urls: this.urls,
            },
            ['requestBody'],
        );
        chrome.webRequest.onBeforeSendHeaders.addListener(
            this.onBeforeSendHeadersListener.bind(this),
            { urls: this.urls },
            ['requestHeaders'],
        );
    }
    onBeforeRequestListener(
        details: chrome.webRequest.OnBeforeRequestDetails,
    ): chrome.webRequest.BlockingResponse | undefined {
        if (details.method !== 'POST') return;
        const { requestBody } = details;
        if (requestBody && requestBody.formData) {
            this.pendingRequests.set(details.requestId, requestBody.formData);
        }
    }

    onBeforeSendHeadersListener(details: chrome.webRequest.OnBeforeSendHeadersDetails) {
        if (details.method !== 'POST') return undefined;
        const { requestId, url } = details;
        const path = new URL(url).pathname;
        const formData = this.pendingRequests.get(requestId);
        if (
            formData &&
            details.requestHeaders?.some(
                (header) => header.name === 'X-Scrubbler' && header.value === '1',
            ) === false
        ) {
            this.log(`Captured POST request, path: ${path}
    data: ${JSON.stringify(formData)}`);
            this.processRequest(path, formData);
            this.pendingRequests.delete(requestId);
        }
    }
    async processRequest(path: string, formData: FormDataEntry) {
        const tabId = await getActiveTabId();
        if (!tabId) return;
        if (path.endsWith('/library/edit-track') || path.endsWith('/library/edit')) {
            this.editScrobble(formData, tabId);
        } else if (path.endsWith('/library/edit-album')) {
            this.editAlbum(formData, tabId);
        } else if (path.endsWith('/library/delete')) {
            this.deleteScrobble(formData, tabId);
        } else if (path.endsWith('automatic-edits/tracks')) {
            this.deleteTrackEdit(formData, tabId);
        }
    }
    async editScrobble(formData: FormDataEntry, tabId: number) {
        if (formData['submit']?.[0] !== 'edit-scrobble') return;
        const data = {} as Record<EditFormKey | 'edit_all', string>;
        for (const key of editFormKeys) {
            const value = formData[key]?.[0];
            if (typeof value === 'string') {
                data[key] = value.trim();
            }
        }
        const editAll = formData['edit_all']?.[0];
        if (editAll === 'on') {
            data['edit_all'] = 'on';
        }
        if (editFormKeys.every((key) => !!data[key])) {
            try {
                this.log(`Send edit scrobble message, data: ${JSON.stringify(data)}`);
                await namespace.tabs.sendMessage(tabId, {
                    type: 'EXTERNAL_EDIT_SCROBBLE',
                    data,
                });
            } catch (error) {
                throw Error(`Sending EXTERNAL_EDIT_SCROBBLE message failed, ${error}`);
            }
        }
    }
    async editAlbum(formData: FormDataEntry, tabId: number) {
        if (formData['submit']?.[0] !== 'edit-album') return;
        const data = {} as Record<EditAlbumFormKey, string>;
        for (const key of editAlbumFormKeys) {
            const value = formData[key]?.[0];
            if (typeof value === 'string') {
                data[key] = value.trim();
            }
        }
        if (editAlbumFormKeys.every((key) => !!data[key])) {
            try {
                this.log(`Send album edit message, data: ${JSON.stringify(data)}`);
                await namespace.tabs.sendMessage(tabId, {
                    type: 'EXTERNAL_EDIT_ALBUM',
                    data,
                });
            } catch (error) {
                throw Error(`Sending EXTERNAL_EDIT_ALBUM message failed, ${error}`);
            }
        }
    }
    async deleteScrobble(formData: FormDataEntry, tabId: number) {
        const data = {} as Record<DeleteFormKey, string>;
        for (const key of deleteFormKeys) {
            const value = formData[key]?.[0];
            if (typeof value === 'string') {
                data[key] = value.trim();
            }
        }
        if (deleteFormKeys.every((key) => !!data[key])) {
            try {
                this.log(`Send delete scrobbble, data: ${JSON.stringify(data)}`);
                await namespace.tabs.sendMessage(tabId, {
                    type: 'EXTERNAL_DELETE_SCROBBLE',
                    data,
                });
            } catch (error) {
                throw Error(`Sending message failed, ${error}`);
            }
        }
    }
    async deleteTrackEdit(formData: FormDataEntry, tabId: number) {
        if (formData['action']?.[0] !== 'delete') return;
        const data = {} as Record<DeleteTrackEditFormKey, string>;
        for (const key of deleteTrackEditFormKeys) {
            const value = formData[key]?.[0];
            if (typeof value === 'string') {
                data[key as DeleteTrackEditFormKey] = value.trim();
            }
        }
        if (deleteTrackEditFormKeys.every((key) => !!data[key])) {
            try {
                this.log(`Send delete track edit message, data: ${JSON.stringify(data)}`);
                await namespace.tabs.sendMessage(tabId, {
                    type: 'EXTERNAL_DELETE_TRACKEDIT',
                    data,
                });
            } catch (error) {
                throw Error(`Sending EXTERNAL_DELETE_TRACKEDIT message failed, ${error}`);
            }
        }
    }
    setLogging(loggingEnabled: boolean) {
        this.loggingEnabled = loggingEnabled;
    }
    async log(message: string) {
        const prefix = '[ScrobbleScrubbler:RequestListener]';
        if (typeof this.loggingEnabled !== 'boolean') {
            this.loggingEnabled = (
                await namespace.storage.session.get('loggingEnabled')
            ).loggingEnabled;
        }
        if (this.loggingEnabled) {
            // eslint-disable-next-line no-console
            console.log(`${prefix} ${message}`);
        }
    }
}

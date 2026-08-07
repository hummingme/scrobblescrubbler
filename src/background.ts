/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { getActiveTabId } from './lib/background.ts';
import { action, namespace, type NSPort } from './lib/runtime.ts';
import RequestListener from './services/request-listener.ts';
import type { Message } from './types/messages.ts';

const tabIds: Set<number> = new Set();
let loggingEnabled: boolean = true;

const requestListener: RequestListener = new RequestListener();
requestListener.listen();

initMessageListener(requestListener);
run();

async function run() {
    const ids = await queryLastfmTabIds();
    for (const id of ids) {
        addTabId(id);
    }
    log(`started, found ${tabIds.size} last.fm tabs`);
    if (!(await getActiveTabId())) {
        notifyNextContentscript(tabIds);
    }
    loggingEnabled = (await namespace.storage.session.get('loggingEnabled'))
        .loggingEnabled;
    requestListener.setLogging(loggingEnabled);
}

function initMessageListener(requestListener: RequestListener) {
    namespace.runtime.onMessage.addListener(async (message: Message, sender) => {
        const tabId = sender.tab?.id;
        if (!tabId) return;
        if (message.type === 'CONTENT_READY') {
            addTabId(tabId);
            await namespace.scripting.insertCSS({
                target: { tabId },
                files: ['static/scrobble-scrubbler.css'],
            });
            const activeTabId = await getActiveTabId();
            if (!activeTabId || activeTabId == tabId) {
                notifyNextContentscript(tabIds);
            }
        } else if (message.type === 'BACKGROUND_SETTINGS') {
            const loggingEnabled = message.settings.loggingEnabled;
            namespace.storage.session.set({ loggingEnabled });
            requestListener.setLogging(message.settings.loggingEnabled);
        } else if (message.type === 'JOBS_CHANGED') {
            adjustBrowserAction(tabId, message.jobsCount);
        } else if (message.type === 'RELOAD_TAB') {
            requestTabReload(message.url);
        }
    });
}

namespace.tabs.onRemoved.addListener(async (tabId) => {
    removeTabId(tabId);
});

namespace.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const isLastfmUrl = tab.url?.startsWith('https://www.last.fm');
    if (changeInfo.status === 'complete') {
        if (tabIds.has(tabId) && !isLastfmUrl) {
            removeTabId(tabId);
        }
    }
    if (isLastfmUrl && 'discarded' in changeInfo) {
        if (changeInfo.discarded === true) {
            removeTabId(tabId);
        } else {
            addTabId(tabId);
            if (!(await getActiveTabId())) {
                notifyNextContentscript(tabIds);
            }
        }
    }
});

chrome.runtime.onInstalled.addListener(async () => {
    const ids = await queryLastfmTabIds();
    for (const tabId of ids) {
        // injecting into tabs that are already open during installation
        chrome.scripting
            .executeScript({
                target: { tabId },
                files: ['scrobble-scrubbler.js'],
            })
            .catch((error) => {
                err(`Failed to inject scrobble-scrubbler.js into ${tabId}:, ${error}`);
            });
    }
});

async function queryLastfmTabIds() {
    const ids = (await namespace.tabs.query({ url: 'https://www.last.fm/*' }))
        .filter(
            (tab) =>
                tab.status === 'complete' &&
                tab.discarded === false &&
                tab.id !== undefined,
        )
        .map((tab) => tab.id!);
    return ids;
}

function addTabId(tabId: number) {
    tabIds.add(tabId);
    namespace.tabs.get(tabId, (tab) => {
        log(`added tabId ${tabId}, url ${tab.url}`);
    });
}

async function removeTabId(tabId: number) {
    tabIds.delete(tabId);
    log(`removed tabId ${tabId}`);
    if (tabId === (await getActiveTabId())) {
        notifyNextContentscript(tabIds);
    }
}

let popupPort: NSPort | null = null;
namespace.runtime.onConnect.addListener(async (port) => {
    if (port.name === 'popup') {
        popupPort = port;
        notifyPopup(popupPort, await getActiveTabId());
        popupPort.onDisconnect.addListener(() => {
            popupPort = null;
        });
    }
});

async function notifyNextContentscript(tabIds: Set<number>) {
    const tabId = tabIds.values().next().value;
    if (tabId) {
        namespace.storage.session.set({ activeTabId: tabId.toString() });
        try {
            await namespace.tabs.sendMessage(tabId, { type: 'RUNNING_MANDATE', tabId });
            log(`sent running mandate to tabId ${tabId}`);
        } catch {
            removeTabId(tabId);
            return;
        }
    } else {
        namespace.storage.session.remove('activeTabId');
    }
    notifyPopup(popupPort, tabId);

    return tabId;
}

const notifyPopup = (popupPort: NSPort | null, tabId?: number) => {
    if (popupPort) {
        popupPort.postMessage({
            type: 'ACTIVE_TAB',
            tabId: tabId,
            options: { loggingEnabled },
        });
        log(`informed popup about active tabId ${tabId}`);
    }
};

const adjustBrowserAction = (tabId: number, jobsCount: number) => {
    if (jobsCount === 0) {
        action.setTitle({
            tabId,
            title: 'ScrobbleScrubbler: idle',
        });
        action.setBadgeText({ tabId, text: '' });
    } else {
        action.setTitle({
            tabId,
            title: `Kahuna: ${jobsCount} jobs to do`,
        });
        if (action.setBadgeBackgroundColor) {
            action.setBadgeBackgroundColor({ tabId, color: '#afff00' });
            action.setBadgeTextColor({ tabId, color: '#5000ff' });
        }
        const jobsText =
            jobsCount < 1000 ? String(jobsCount) : `\u2026${String(jobsCount).slice(-2)}`;
        action.setBadgeText({ tabId, text: jobsText });
    }
};

async function requestTabReload(url: string) {
    tabIds.forEach(async (tabId) => {
        const tab = await namespace.tabs.get(tabId);
        if (tab.url === url) {
            await namespace.tabs.sendMessage(tabId, { type: 'RELOAD_TAB', url });
        }
    });
}

function log(message: string) {
    const prefix = '[ScrobbleScrubbler:Background]';
    if (loggingEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${prefix} ${message}`);
    }
}
function err(message: string) {
    const prefix = '[ScrobbleScrubbler:Background]';
    if (loggingEnabled) {
        // eslint-disable-next-line no-console
        console.error(`${prefix} ${message}`);
    }
}

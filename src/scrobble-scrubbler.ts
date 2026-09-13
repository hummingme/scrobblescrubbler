/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { externalEditAlbum } from './lib/edit-album.ts';
import { externalDeleteItem } from './lib/delete-item.ts';
import { externalDeleteScrobble } from './lib/delete-scrobble.ts';
import { externalDeleteTrackedit } from './lib/delete-trackedit.ts';
import { externalEditScrobble } from './lib/edit-scrobble.ts';
import { formatDate } from './lib/format-date.ts';
import { loadUrl, reloadPage } from './lib/load-url.ts';
import { reportJobsCount } from './lib/jobs-count.ts';
import { getUserName, isLastfmPro } from './lib/lastfm-page.ts';
import { isUserUrl } from './lib/library-links.ts';
import { messageBackground } from './lib/message-background.ts';
import popupState from './lib/popup-state.ts';
import { namespace } from './lib/runtime.ts';
import { openDatabase, ScrubblerDB } from './services/database.ts';
import EditsFetcher from './services/edits-fetcher.ts';
import ChartTablesDecorator from './services/chart-table-decorator.ts';
import HeaderDecorator from './services/header-decorator.ts';
import JobRunner from './services/job-runner.ts';
import ScrobblesFetcher from './services/scrobbles-fetcher.ts';
import ScrobbleTablesDecorator from './services/scrobble-tables-decorator.ts';
import ScrobbleChecker from './services/scrobble-checker.ts';
import { log } from './services/logger.ts';
import ScrobblesRefetcher from './services/scrobbles-refetcher.ts';
import Settings from './services/settings.ts';
import SiteImprover from './services/site-improver.ts';
import type { Message } from './types/messages.ts';

const userName = getUserName();

if (userName !== '' && isLastfmPro()) {
    // listen for messages from background
    namespace.runtime.onMessage.addListener((message: Message) => {
        const { type } = message;
        if (type === 'RUNNING_MANDATE') {
            startBackgroundOperations(userName);
        } else if (type === 'EXTERNAL_EDIT_SCROBBLE') {
            externalEditScrobble(message.data);
        } else if (type === 'EXTERNAL_EDIT_ALBUM') {
            externalEditAlbum(message.data);
        } else if (type === 'EXTERNAL_DELETE_ITEM') {
            externalDeleteItem(message.subject, message.item);
        } else if (type === 'EXTERNAL_DELETE_SCROBBLE') {
            externalDeleteScrobble(message.data);
        } else if (type === 'EXTERNAL_DELETE_TRACKEDIT') {
            externalDeleteTrackedit(message.data);
        } else if (type === 'RELOAD_TAB') {
            loadUrl(message.url, true);
        }
    });
    messageBackground({ type: 'CONTENT_READY' });
    startPlugins(userName);
} else {
    log('not logged in or not a last.fm pro account!');
}

// executed in every last.fm tab
async function startPlugins(userName: string) {
    const db = await openDatabase(userName);
    await startObserver(db);
    setInterval(async () => {
        reportJobsCount(db);
    }, 2707);
    const { initState } = await new Settings(db).get(['initState']);
    if (initState === 'ready') {
        new ScrobblesRefetcher(db).checkInvocation();
    }
}

// executed only in the last.fm tab that got the running mandate
async function startBackgroundOperations(userName: string) {
    const db = await openDatabase(userName);
    const settings = new Settings(db);

    sendBackgroundSettings(settings);
    determineCsrfMiddlewareToken(settings);
    reportJobsCount(db);
    const scrobblesFetcher = new ScrobblesFetcher(db);
    const editsFetcher = new EditsFetcher(db);
    const jobRunner = new JobRunner(scrobblesFetcher, editsFetcher, db);

    window.setInterval(async () => {
        const { initState, processJobs, observeScrobbles, observeEdits } =
            await settings.get([
                'initState',
                'processJobs',
                'observeScrobbles',
                'observeEdits',
            ]);
        if (initState === 'waiting') {
            waitingActivities(db, scrobblesFetcher, editsFetcher);
        } else if (initState === 'pending') {
            const scrobblesSuccess = await scrobblesFetcher.initialize();
            const editsSuccess = await editsFetcher.intialize();
            if (scrobblesSuccess && editsSuccess) {
                settings.set([{ name: 'initState', value: 'running' }]);
            }
        } else {
            if (processJobs === true) {
                jobRunner.run(initState === 'running');
            } else {
                jobRunner.stop();
            }
            if (observeScrobbles === true) {
                await scrobblesFetcher.run();
            } else {
                scrobblesFetcher.stop();
            }
            if (observeEdits === true) {
                await editsFetcher.run();
            } else {
                editsFetcher.stop();
            }
        }
    }, 2551);

    // refresh the token hourly, even though I never observed one expiring
    window.setInterval(() => determineCsrfMiddlewareToken(settings), 60 * 60 * 1000);

    // listen for messages from popup
    namespace.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
        if (message.type === 'GET_STATE') {
            popupState(db, jobRunner)
                .then(sendResponse)
                .catch(() => {
                    sendResponse(undefined);
                });
            return true;
        }
        if (message.type === 'SET_STATE') {
            const payload = message.payload;
            settings.set(
                (Object.keys(payload) as (keyof typeof payload)[]).map((name) => ({
                    name,
                    value: payload[name]!,
                })),
            );
        }
        if (message.type === 'CHECK_NOW') {
            if (message.subject === 'scrobbles') scrobblesFetcher.check();
            if (message.subject === 'edits') editsFetcher.check();
        }
        if (message.type === 'INITIALIZE_INIT') {
            settings.set([{ name: 'initState', value: 'pending' }]);
        }
    });
}

// listen for messages from content
window.addEventListener('message', async (message: MessageEvent) => {
    const { type, subject, timestamp } = message.data;
    const userName = getUserName();
    if (!userName) return;
    const db = await openDatabase(userName);
    const scrobblesFetcher = new ScrobblesFetcher(db);
    if (type === 'CHECK_NOW' && subject === 'scrobbles') {
        await scrobblesFetcher.check();
        reloadPage();
    } else if (type == 'CHECK_SCROBBLE' && typeof timestamp === 'number') {
        new ScrobbleChecker(db, scrobblesFetcher).check(timestamp);
    }
    if (type === 'REFETCH_DAY' && typeof timestamp === 'number') {
        const day = formatDate(new Date(timestamp * 1000));
        new ScrobblesRefetcher(db).initRefetch(day, day);
    }
});

async function sendBackgroundSettings(settings: Settings) {
    messageBackground({
        type: 'BACKGROUND_SETTINGS',
        settings: {
            loggingEnabled: (await settings.get(['loggingEnabled'])).loggingEnabled,
        },
    });
}

async function determineCsrfMiddlewareToken(settings: Settings) {
    const token = document.querySelector<HTMLInputElement>(
        'input[name=csrfmiddlewaretoken]',
    )?.value;
    if (!token) {
        throw 'Failed to detect csrfmiddlewaretoken!';
    }
    settings.set([{ name: 'csrfmiddlewaretoken', value: token }]);
}

async function startObserver(db: ScrubblerDB) {
    const chartTablesDecorator = new ChartTablesDecorator(db);
    const scrobbleTablesDecorator = new ScrobbleTablesDecorator(db);
    const headerDecorator = new HeaderDecorator(db);
    const siteImprover = new SiteImprover(db);
    const body = document.body;
    if (body) {
        const observer = createObserver(
            chartTablesDecorator,
            scrobbleTablesDecorator,
            headerDecorator,
            siteImprover,
        );
        observer.observe(body, {
            childList: true,
            subtree: true,
        });
        chartTablesDecorator.prepareTables(document.documentElement);
        scrobbleTablesDecorator.prepareTables(document.documentElement);
        headerDecorator.prepareHeader(document.documentElement);
        siteImprover.process(document.documentElement);
    }
    return scrobbleTablesDecorator;
}

function createObserver(
    chartTablesDecorator: ChartTablesDecorator,
    scrobbleTablesPlugin: ScrobbleTablesDecorator,
    headlineDecorator: HeaderDecorator,
    siteImprover: SiteImprover,
) {
    return new MutationObserver((mutations: MutationRecord[]) => {
        if (!isUserUrl(location.href)) {
            return;
        }
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLTableRowElement) {
                    scrobbleTablesPlugin.prepareRow(node);
                } else if (node instanceof HTMLTableCellElement) {
                    scrobbleTablesPlugin.prepareCell(node);
                } else if (
                    node instanceof HTMLElement &&
                    ['DIV', 'SECTION', 'TABLE'].includes(node.tagName)
                ) {
                    scrobbleTablesPlugin.prepareTables(node);
                    chartTablesDecorator.prepareTables(node);
                    headlineDecorator.prepareHeader(node);
                }
                if (
                    node instanceof HTMLDivElement &&
                    node.id.length === 0 &&
                    node.className.length === 0
                ) {
                    siteImprover.process(node);
                }
            }
        }
    });
}

// determine the scrobbles and edits counts while waiting for the initialization to start
async function waitingActivities(
    db: ScrubblerDB,
    scrobblesFetcher: ScrobblesFetcher,
    editsFetcher: EditsFetcher,
) {
    const settings = new Settings(db);
    const { scrobblesCount, editsCount, lastScrobblesCheck, lastEditsCheck } =
        await settings.get([
            'scrobblesCount',
            'editsCount',
            'lastScrobblesCheck',
            'lastEditsCheck',
        ]);
    if (
        scrobblesCount === 0 ||
        lastScrobblesCheck === null ||
        Date.now() - lastScrobblesCheck > 601010
    ) {
        const count = (
            await scrobblesFetcher.requestCount(Date.now(), Date.parse('2000-01-01'))
        ).count;
        log(`got ${count} scrobbles while initState is "waiting"`);
        if (count) {
            settings.set([
                { name: 'scrobblesCount', value: count },
                { name: 'lastScrobblesCheck', value: Date.now() },
            ]);
        }
    }
    if (
        editsCount === 0 ||
        lastEditsCheck === null ||
        Date.now() - lastEditsCheck > 1209220
    ) {
        const count = (await editsFetcher.requestPage(1)).count;
        log(`got ${count} edits while initState is "waiting"`);
        if (count) {
            settings.set([
                { name: 'editsCount', value: count },
                { name: 'lastEditsCheck', value: Date.now() },
            ]);
        }
    }
}

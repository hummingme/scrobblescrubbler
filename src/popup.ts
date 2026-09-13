/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html, render, TemplateResult } from 'lit-html';

import checkbox from './lib/checkbox.ts';
import { namespace, type NSPort } from './lib/runtime.ts';
import type { ErrorLevel } from './services/logger.ts';
import { type StatePayload, isMessage } from './types/messages.ts';

let activeTabId: number | undefined;
let loggingEnabled: boolean = true;

const backgroundPort: NSPort = namespace.runtime.connect({ name: 'popup' });
backgroundPort.onMessage.addListener((msg: unknown) => {
    if (
        isMessage(msg) &&
        msg.type === 'ACTIVE_TAB' &&
        (activeTabId !== msg.tabId || msg.tabId === undefined)
    ) {
        activeTabId = msg.tabId;
        loggingEnabled = msg.options.loggingEnabled;
        initPopup(activeTabId);
    }
});

let updateInterval = window.setInterval(() => notRunningView(), 1000);
function initPopup(tabId?: number) {
    if (updateInterval) {
        window.clearInterval(updateInterval);
    }
    log(`initializing with tabId ${tabId}`);
    if (tabId) {
        update(tabId);
        updateInterval = window.setInterval(async () => update(tabId), 3017);
    } else {
        notRunningView();
    }
}

function update(tabId: number) {
    if (tabId) {
        namespace.tabs
            .sendMessage(tabId, { type: 'GET_STATE' })
            .then((response) => {
                if (response && response.type === 'SEND_STATE') {
                    updateView(response.payload);
                }
            })
            .catch((error) => {
                log('failed to get state from contentscript', error);
            });
    }
}
function updateView(state: StatePayload) {
    const loadingDiv = getLoadingDiv();
    if (loadingDiv) {
        loadingDiv.remove();
    }
    const contentDiv = getContentDiv();
    if (contentDiv) {
        render(
            state.initState === 'waiting' ? waitingView(state) : view(state),
            contentDiv,
        );
    }
}

function waitingView(state: StatePayload) {
    return html`
        ${headline()} ${waitingAdvice(state)}
        <div class="start-button">
            <button class="pulse-red" @click=${startClicked}>start downloading</button>
        </div>
    `;
}

function view(state: StatePayload) {
    const stopped = html`
        <span class="red">stopped</span>
    `;
    const running = html`
        <span class="green">running</span>
    `;
    let remaining: TemplateResult | string = '';
    if (state.secondsRemaining > 0) {
        const fullTime = remainingTimeString(state.secondsRemaining, 'full');
        const shortTime = remainingTimeString(state.secondsRemaining, 'short');
        remaining = html`
            ,
            <span title="${fullTime}">ca. ${shortTime} remaining</span>
        `;
    }
    const scrobblesToGo = state.scrobblesCount - state.scrobblesFetched;
    const editsToGo = state.editsCount - state.editsFetched;
    const jobsLabel = html`
        process jobs -
        ${
            state.processJobs
                ? html`
                      ${running}${remaining}
                  `
                : stopped
        }
    `;
    return html`
        ${headline()}
        <form id="switches">
            <div>
                <p>
                    ${checkbox({
                        id: 'jobs-switch',
                        name: 'processJobs',
                        label: jobsLabel,
                        '.checked': state.processJobs,
                        '@change': checkboxChanged,
                    })}
                </p>
                <p class="indent">${pendingInfo(state)}</p>
                <p class="indent" title="${deltaText(scrobblesToGo)}">
                    ${state.scrobblesFetched} scrobbles fetched
                    ${
                        state.initState === 'running'
                            ? `(${deltaText(scrobblesToGo)})`
                            : ''
                    }
                </p>
                <p class="indent" title="${deltaText(editsToGo)}">
                    ${state.editsFetched} edits fetched
                    ${state.initState === 'running' ? `(${deltaText(editsToGo)})` : ''}
                </p>
                <p class="gap">
                    ${checkbox({
                        id: 'scrobbles-switch',
                        name: 'observeScrobbles',
                        label: html`
                            observe scrobbles -
                            ${state.observeScrobbles ? running : stopped}
                        `,
                        '.checked': state.observeScrobbles,
                        '@change': checkboxChanged,
                    })}
                    <button @click="${sendCheckNow.bind(null, 'scrobbles')}">
                        check now
                    </button>
                </p>
                <p>
                    ${checkbox({
                        id: 'edits-switch',
                        name: 'observeEdits',
                        label: html`
                            observe edits - ${state.observeEdits ? running : stopped}
                        `,
                        '.checked': state.observeEdits,
                        '@change': checkboxChanged,
                    })}
                    <button @click="${sendCheckNow.bind(null, 'edits')}">
                        check now
                    </button>
                </p>
            </div>
        </form>
    `;
}

function headline() {
    return html`
        <h1>
            ScrobbleScrubbler Control Center
            <div class="headline-links">
                <div class="headline-bar"></div>
                <a
                    class="github-readme"
                    href="https://github.com/hummingme/scrobblescrubbler#%EF%B8%8F-usage"
                    title="read the documentation on github"
                    target="_blank"
                ></a>
            </div>
        </h1>
    `;
}

function waitingAdvice(state: StatePayload) {
    const { scrobblesCount, editsCount } = state;
    const seconds = ((scrobblesCount + editsCount) / 50) * 5.555;
    return html`
        <div class="advice">
            <p>
                To do it's jobs, the ScrobbleScrubbler extension needs to download your
                scrobble data and automatic edits data from the last.fm website.
            </p>
            <p>
                For your
                <em>${scrobblesCount} scrobbles</em>
                and
                <em>${editsCount} edits</em>
                , this process will take about
                <em class="center">${remainingTimeString(seconds, 'full')}</em>
                in total.
            </p>
            <p>
                You can continue using the site as usual and keep scrobbling while this
                happens, everything will work just as before. If you close your browser
                during the process, it will pick up where it left off when you reopen
                last.fm in this browser again.
            </p>
            <p>
                So, everything as usual. Just to keep the data stored in the extension as
                reliable as possible, you should only edit or delete your scrobbles and
                edits in this browser from now on.
            </p>
        </div>
    `;
}

function pendingInfo(state: StatePayload) {
    const jobNames = {
        scrobblesJobs: 'fetch scrobbles',
        editsJobs: 'fetch edits',
        editScrobbleJobs: 'edit scrobble',
        deleteEditJobs: 'delete edit',
        deleteScrobbleJobs: 'delete scrobble',
    };
    let maxLength = 0;
    for (const name of Object.keys(jobNames)) {
        const count = state[name as keyof StatePayload];
        if (typeof count === 'number' && String(count).length > maxLength) {
            maxLength = String(count).length;
        }
    }
    let pendingCount = 0;
    const jobDetails: TemplateResult[] = [];
    for (const [name, title] of Object.entries(jobNames)) {
        const count = state[name as keyof StatePayload];
        if (typeof count === 'number' && count > 0) {
            pendingCount += count;
            jobDetails.push(html`
                <li>${String(count).padStart(maxLength, '\u2007')} ${title} jobs</li>
            `);
        }
    }
    const pendingDetails =
        pendingCount > 0
            ? html`
                  <ul>
                      ${jobDetails}
                  </ul>
              `
            : '';
    return html`
        ${pendingCount} jobs pending ${pendingDetails}
    `;
}

function remainingTimeString(seconds: number, format: 'full' | 'short') {
    seconds = Math.ceil(seconds);
    const days = Math.floor(seconds / 86400);
    let secondsLeft = seconds - days * 86400;

    const hours = Math.floor(secondsLeft / 3600);
    secondsLeft -= hours * 3600;

    const minutes = Math.floor(secondsLeft / 60);
    secondsLeft -= minutes * 60;

    const parts = [
        { value: days, name: 'days' },
        { value: hours, name: 'hours' },
        { value: minutes, name: 'minutes' },
        { value: secondsLeft, name: 'seconds' },
    ];
    const first = parts.findIndex((p) => p.value > 0);
    if (first === -1) return '';

    const sliced = parts.slice(first);
    if (format === 'short') {
        return sliced
            .slice(0, 2)
            .map((p) => `${p.value} ${p.name}`)
            .join(', ');
    } else {
        return sliced.map((p) => `${p.value} ${p.name}`).join(', ');
    }
}

function deltaText(count: number) {
    if (count === 0) {
        return 'complete';
    } else if (count > 0) {
        return `-${count}`;
    } else {
        return `+${count * -1}`;
    }
}

function startClicked() {
    if (activeTabId) {
        namespace.tabs.sendMessage(activeTabId, {
            type: 'INITIALIZE_INIT',
        });
    }
}

async function checkboxChanged(this: HTMLInputElement) {
    if (activeTabId) {
        namespace.tabs.sendMessage(activeTabId, {
            type: 'SET_STATE',
            payload: Object.fromEntries([[this.name, this.checked]]),
        });
    }
}
async function sendCheckNow(subject: 'scrobbles' | 'edits', event: Event) {
    const button = event.target;
    if (button instanceof HTMLButtonElement === false) return;
    event.preventDefault();
    if (activeTabId) {
        namespace.tabs.sendMessage(activeTabId, {
            type: 'CHECK_NOW',
            subject,
        });
        buttonBusy(button);
    }
}

function buttonBusy(button: HTMLButtonElement) {
    const buttonWidth = button.offsetWidth;
    button.disabled = true;
    button.innerText = 'running';
    button.style.backgroundColor = '#606c5c';
    button.style.width = `${buttonWidth}px`;
    setTimeout(() => {
        button.disabled = false;
        button.innerText = 'check now';
        button.style.backgroundColor = '';
        button.style.width = '';
    }, 3000);
}

function notRunningView() {
    const loadingDiv = getLoadingDiv();
    if (loadingDiv) {
        loadingDiv.remove();
    }
    const contentDiv = getContentDiv();
    if (contentDiv) {
        render(
            html`
                ${headline()}
                <div style="max-width: 330px">
                    <p>
                        It seems
                        <a target="_blank" href="https://www.last.fm">last.fm</a>
                        is not open or you are not logged in.
                    </p>
                    <p>
                        You have to log in with your last.fm Pro account for
                        ScrobbleScrubbler to work.
                    </p>
                </div>
            `,
            contentDiv,
        );
    }
}

function getLoadingDiv() {
    return document.querySelector<HTMLDivElement>('#loading-message');
}
function getContentDiv() {
    return document.querySelector<HTMLDivElement>('#popup-content');
}

function log(message: string, level: ErrorLevel = 'log') {
    const prefix = '[ScrobbleScrubbler:Popup]';
    if (loggingEnabled) {
        // eslint-disable-next-line no-console
        console[level](`${prefix} ${message}`);
    }
}

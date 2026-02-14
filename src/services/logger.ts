/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { openDatabase } from './database.ts';
import Settings from './settings.ts';
import { getUserName } from '../lib/lastfm-page.ts';

export type ErrorLevel = 'log' | 'warn' | 'error';

class Logger {
    enabled: boolean = true;
    prefix = '[ScrobbleScrubbler]';
    async init() {
        const userName = getUserName();
        if (userName) {
            const db = await openDatabase(userName);
            this.enabled = (
                await new Settings(db).get(['loggingEnabled'])
            ).loggingEnabled;
        }
    }
    log(message: string, context: unknown = 'NOCONTEXT', level: ErrorLevel = 'log') {
        if (this.enabled) {
            if (context === 'NOCONTEXT') {
                // eslint-disable-next-line no-console
                console[level](`${this.prefix} ${message}`);
            } else {
                // eslint-disable-next-line no-console
                console[level](`${this.prefix} ${message}`, context);
            }
        }
    }
    warn(message: string, context?: unknown) {
        this.log(message, context, 'warn');
    }
    error(message: string, context?: unknown) {
        this.log(message, context, 'error');
    }
}

let logger: Logger | null = null;

export async function log(message: string, context?: unknown, level: ErrorLevel = 'log') {
    if (!logger) {
        logger = new Logger();
        await logger.init();
    }
    logger[level](message, context, level);
}

export function warn(message: string, context?: unknown) {
    log(message, context, 'warn');
}

export function error(message: string, context?: unknown) {
    log(message, context, 'error');
}

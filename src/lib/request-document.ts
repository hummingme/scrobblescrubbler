/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { log, error } from '../services/logger.ts';

export default async function requestDocument(url: string) {
    log(`requestDocument`, url);
    try {
        const resp = await fetch(url);
        const html = await resp.text();
        const parser = new DOMParser();
        return parser.parseFromString(html, 'text/html');
    } catch {
        error(`requestDocument failed for url: ${url}`);
    }
}

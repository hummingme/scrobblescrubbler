/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { namespace } from './runtime.ts';

export async function getActiveTabId() {
    const id = Number((await namespace.storage.session.get('activeTabId')).activeTabId);
    return Number.isNaN(id) ? undefined : id;
}

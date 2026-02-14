/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export const namespace = typeof browser === 'object' ? browser : chrome;

export const action = namespace.action;

export type NSPort = browser.runtime.Port | chrome.runtime.Port;

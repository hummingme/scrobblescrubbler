/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { error } from '../services/logger.ts';
import { Message } from '../types/messages.ts';

export async function messageBackground(message: Message) {
    try {
        sendMessage(message);
    } catch {
        // sending the first message to a sleeping background script will fail,
        // but after that the background is awake and ready to receive messages
        setTimeout(async () => {
            try {
                sendMessage(message);
            } catch (err) {
                error(
                    `failed to send  ${message.type} messsage to background: ${String(err)}`,
                );
            }
        }, 177);
    }
}

function sendMessage(message: unknown): void {
    if (typeof browser === 'object') {
        browser.runtime.sendMessage(message);
    } else {
        chrome.runtime.sendMessage(message);
    }
}

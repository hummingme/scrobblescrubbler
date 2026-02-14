/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

export default async function postRequest(url: string, formData: FormData) {
    const options: RequestInit = {
        method: 'POST',
        body: formData,
        redirect: 'follow',
        referrer: url,
        headers: {
            'X-Scrubbler': '1',
        },
    };
    return await window.fetch(url, options);
}

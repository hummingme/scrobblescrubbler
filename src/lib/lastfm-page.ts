/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { emptyScrubblerItem } from './scrubbler.ts';
import { scrobbleFields, ScrobbleFieldKey, ScrobbleBase } from '../types/lastfm.ts';
import { ScrubblerItem } from '../types/scrubbler.ts';

export const getUserUrl = (() => {
    let userUrl: string | null = null;
    return () => {
        if (!userUrl) {
            userUrl =
                document.querySelector<HTMLAnchorElement>('a.auth-link')?.href || '';
        }
        return userUrl;
    };
})();

export function getUserName() {
    const userName = getUserUrl().split('/').pop() || '';
    return userName;
}

export function isLastfmPro() {
    return !!document.querySelector<HTMLElement>('div.masthead-pro-wrap');
}

// forms added by Bulk Edit userscript have additional data-bulk-edit-scrobbles attribute
export const editScrobbleFormSelector =
    'form[data-edit-scrobble]:not([data-bulk-edit-scrobbles])' as const;

export function getScrobbleFromEditForm(form: HTMLFormElement) {
    const scrobble = Object.fromEntries(
        Array.from(form.children)
            .filter((field) => field instanceof HTMLInputElement)
            .filter((field) => scrobbleFields.includes(field.name as ScrobbleFieldKey))
            .map((field) => {
                const value =
                    field.name === 'timestamp' ? parseInt(field.value) : field.value;
                return [field.name, value];
            }),
    ) as ScrobbleBase;
    return scrobble;
}

export function getScrubblerItemFromEditForm(form: HTMLFormElement): ScrubblerItem {
    const item = Object.fromEntries(
        Array.from(form.children)
            .filter((field) => field instanceof HTMLInputElement)
            .filter(
                (field) =>
                    scrobbleFields.includes(field.name as ScrobbleFieldKey) &&
                    field.name !== 'timestamp',
            )
            .map((field) => [camelize(field.name), field.value]),
    );
    return Object.assign(emptyScrubblerItem(), item);
}

export function getScrubblerItemFromLovedForm(form: HTMLFormElement): ScrubblerItem {
    const item = Object.fromEntries(
        Array.from(form.children)
            .filter((field) => field instanceof HTMLInputElement)
            .filter((field) => ['artist', 'track'].includes(field.name))
            .map((field) => {
                const name = field.name === 'artist' ? 'artistName' : 'trackName';
                return [name, field.value];
            }),
    );
    return Object.assign(emptyScrubblerItem(), item);
}

export function getTimestampFromRow(row: HTMLElement): number {
    return (
        Number(
            row.querySelector<HTMLInputElement>(
                `${editScrobbleFormSelector} input[name=timestamp]`,
            )?.value,
        ) * 1000
    );
}

export function camelize(value: string, separator = '_'): string {
    return value
        .split(separator)
        .map((word, index) =>
            index === 0 ? word : word[0].toUpperCase() + word.slice(1),
        )
        .join('');
}

/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { ScrobbleScrubblerDB } from './database.ts';
import { Setting, SettingKey, SettingTypes } from '../types/settings.ts';

type SettingsResult<K extends readonly SettingKey[]> = {
    [P in K[number]]: SettingTypes[P];
};

export default class Settings {
    #db: ScrobbleScrubblerDB;
    constructor(db: ScrobbleScrubblerDB) {
        this.#db = db;
    }
    set(settings: Setting[]) {
        return this.#db.settings.bulkPut(settings);
    }
    async get<const K extends readonly SettingKey[]>(
        names: K,
    ): Promise<SettingsResult<K>> {
        const vals = await this.#db.settings
            .where('name')
            .anyOf([...names])
            .toArray();

        return vals.reduce((acc, v) => {
            acc[v.name as K[number]] = v.value as any;
            return acc;
        }, {} as SettingsResult<K>);
    }
}

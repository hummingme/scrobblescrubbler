/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import type { LibrarySubject } from './lastfm.ts';

export type ScrubblerItem = ReturnType<typeof emptyScrubblerItem>;

export type ScrubblerSubject = LibrarySubject | 'album-title';

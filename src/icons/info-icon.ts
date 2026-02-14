/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import Icon from './icon.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';

export default abstract class InfoIcon extends Icon {
    boundClick;
    constructor(db: ScrobbleScrubblerDB) {
        super(db);
        this.boundClick = this.click.bind(this);
    }
    addIconClasses(colorClass: string, dest: 'row' | 'header' | 'chart') {
        super.addIconClass(dest);
        this.node.classList.add(colorClass, 'scrobble-scrubbler-info-icon');
    }
    click(event: MouseEvent) {
        const target = event.target;
        if (this.isInfoIcon(target)) {
            event.stopPropagation();
            this.summonScrobbleInfoPopup(target);
        }
    }
    isInfoIcon(node: EventTarget | null): node is HTMLButtonElement {
        return (
            node instanceof HTMLButtonElement &&
            node.classList.contains('scrobble-scrubbler-info-icon')
        );
    }
    abstract summonScrobbleInfoPopup(target: HTMLElement): void;
}

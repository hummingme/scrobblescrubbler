/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { emptyScrubblerItem } from '../lib/scrubbler.ts';
import { ScrobbleScrubblerDB } from '../services/database.ts';
import type { LibrarySubject } from '../types/lastfm.ts';
import type { ScrubblerItem } from '../types/scrubbler.ts';

export default abstract class Icon {
    db: ScrobbleScrubblerDB;
    node: HTMLButtonElement;
    item: ScrubblerItem = emptyScrubblerItem();
    constructor(db: ScrobbleScrubblerDB) {
        this.db = db;
        this.node = document.createElement('button');
    }
    abstract addIcon(
        target: HTMLElement,
        item: ScrubblerItem,
        subject: LibrarySubject,
    ): Promise<HTMLElement | undefined>;
    abstract click(event: MouseEvent): void;
    isTargetChartTable(node: HTMLElement) {
        return (
            node instanceof HTMLTableRowElement &&
            node.closest('table')?.classList.contains('chartlist--with-bar')
        );
    }
    isTargetScrobbleTable(node: HTMLElement) {
        return node instanceof HTMLTableRowElement && !this.isTargetChartTable(node);
    }
    isTargetHeader(node: HTMLElement) {
        return node.classList.contains('library-header-ctas__wrapper');
    }
    addChartIcon(tr: HTMLElement) {
        const td = tr.querySelector<HTMLElement>('span.chartlist-count-bar');
        if (!td) return false;

        td.prepend(this.node);
        return true;
    }
    addHeaderIcon(target: HTMLElement, subject: LibrarySubject) {
        const div = target.querySelector<HTMLDivElement>('div.library-header-ctas');
        if (!div || !div.parentElement || !this.hasChartOrScrobbleTable()) return false;

        this.removeHeaderIcon(div); // a possible relict after extension reload

        // remove the width restriction and make space for the additional icon
        div.parentElement.classList.remove(
            'library-header-ctas__wrapper--1',
            'library-header-ctas__wrapper--2',
        );
        div.parentElement.style.width = subject === 'artist' ? '60px' : '80px';
        div.prepend(this.node);
        return true;
    }
    hasChartOrScrobbleTable() {
        return document.querySelectorAll('table.chartlist').length > 0;
    }
    addScrobbleRowIcon(targetNode: HTMLElement) {
        // the second selector is needed for scrobbles with "Unknown Date" in ancient accounts
        const targetTd =
            targetNode.querySelector<HTMLTableCellElement>('td.chartlist-timestamp') ||
            targetNode.querySelector<HTMLTableCellElement>('td.chartlist-artist');
        if (!targetTd) return false;

        targetTd.insertBefore(this.node, targetTd.firstElementChild);
        return true;
    }
    setScrobbleRowPosition() {
        if (this.node.parentElement?.classList.contains('chartlist-timestamp')) {
            const timeSpanWidth =
                this.node.parentElement?.lastElementChild?.getBoundingClientRect()
                    .width || 0;
            this.node.style.marginLeft = `-${132 - timeSpanWidth}px`;
        } else {
            this.node.style.marginLeft = `${157}px`;
        }
    }
    removeHeaderIcon(targetNode: HTMLElement) {
        targetNode
            .querySelector<HTMLElement>('button.scrobble-scrubbler-header-icon')
            ?.remove();
    }
    addIconClass(dest: 'row' | 'header' | 'chart') {
        const destClass =
            dest === 'row'
                ? 'scrobble-scrubbler-row-icon'
                : dest === 'header'
                  ? 'scrobble-scrubbler-header-icon'
                  : 'scrobble-scrubbler-chart-icon';
        this.node.classList.remove(...this.node.classList);
        this.node.classList.add(destClass);
    }
    addTitle(points: string[]) {
        this.node.setAttribute('title', points.join('\n'));
    }
    plural(count: number) {
        return count > 1 ? 's' : '';
    }
}

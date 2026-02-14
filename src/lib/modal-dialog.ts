/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { render } from 'lit-html';
import { TemplateResult } from 'lit-html';

type Pos = { x: number; y: number };

export default class ModalDialog {
    dialogNode: HTMLDialogElement;
    handleNode?: HTMLElement;
    anchor?: HTMLElement;
    closeHandler?: () => void;
    constructor(anchor?: HTMLElement, closeHandler?: () => void) {
        this.anchor = anchor;
        this.closeHandler = closeHandler;
        this.dialogNode = document.createElement('dialog');
    }
    show(content: TemplateResult) {
        const dialog = this.dialogNode;
        dialog.classList.add('scrobble-scrubbler-dialog');
        dialog.setAttribute('closedby', 'any');
        document.body.appendChild(dialog);
        this.render(content);
        this.addCloseHandler(dialog);
        this.addBackdropClickHandler(dialog);
        dialog.addEventListener('close', this.close.bind(this));
        dialog.showModal();
        this.startUrlWatcher();
        return dialog;
    }
    render(content: TemplateResult) {
        render(content, this.dialogNode);
        this.addDragHandle();
    }
    close(event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        this.dialogNode.close();
        if (this.closeHandler) this.closeHandler();
    }
    addDragHandle() {
        const handle = (this.handleNode = document.createElement('div'));
        handle.classList.add('drag-handle');
        this.dialogNode.append(handle);
        handle.addEventListener('pointerdown', this.dragStart.bind(this));
        handle.addEventListener('pointermove', this.dragMove.bind(this));
        handle.addEventListener('pointerup', this.dragStop.bind(this));
    }
    addCloseHandler(dialog: HTMLDialogElement) {
        dialog.addEventListener('close', () => dialog.remove());
    }
    addBackdropClickHandler(dialog: HTMLDialogElement) {
        let downOutside = false;
        dialog.addEventListener('pointerdown', (event) => {
            if (this.isDragging) return;
            downOutside = outside(event.clientX, event.clientY);
        });
        dialog.addEventListener('pointerup', (event) => {
            if (!downOutside) return;
            if (this.isDragging) return;
            if (downOutside) {
                dialog.close();
                this.passDownClick(event.clientX, event.clientY);
            }
        });
        function outside(x: number, y: number) {
            const box = dialog.getBoundingClientRect();
            return x < box.left || x > box.right || y < box.top || y > box.bottom;
        }
    }
    passDownClick(xPos: number, yPos: number) {
        const nodeBelow = document.elementFromPoint(xPos, yPos);
        if (nodeBelow) {
            nodeBelow.dispatchEvent(
                new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: xPos,
                    clientY: yPos,
                }),
            );
        }
    }
    isDragging = false;
    offsetX = 0;
    offsetY = 0;
    dragStart(event: PointerEvent) {
        if (!this.handleNode) return;
        event.stopPropagation();
        this.isDragging = true;
        const rect = this.dialogNode.getBoundingClientRect();
        this.offsetX = event.clientX - rect.left;
        this.offsetY = event.clientY - rect.top;
        this.handleNode.style.cursor = 'move';
        this.handleNode.setPointerCapture(event.pointerId);
    }
    dragMove(event: PointerEvent) {
        if (!this.isDragging) return;
        const dialog = this.dialogNode;
        const x = event.clientX + window.scrollX - this.offsetX;
        const y = event.clientY + window.scrollY - this.offsetY;
        dialog.style.position = 'absolute';
        dialog.style.margin = '0';
        dialog.style.left = `${x}px`;
        dialog.style.top = `${y}px`;
    }
    dragStop(event: PointerEvent) {
        if (!this.handleNode) return;
        this.isDragging = false;
        this.handleNode.style.cursor = 'grab';
        this.handleNode?.releasePointerCapture(event.pointerId);
    }
    setPosition(xOffset: number) {
        const position = this.calculatePosition(xOffset);
        if (position) {
            Object.assign(this.dialogNode.style, {
                left: `${position.x}px`,
                top: `${position.y}px`,
                position: 'absolute',
                margin: '0',
            });
        }
    }
    calculatePosition(xOffset: number = 0): Pos | undefined {
        if (!this.anchor) return;
        let { x, y }: Pos = this.anchorPosition();
        const nodeDims = this.dialogNode.getBoundingClientRect() || {
            height: 0,
            width: 0,
        };
        if (y > window.innerHeight - nodeDims.height) {
            y = window.innerHeight - nodeDims.height - 3;
            if (y < 3) y = 3;
        }
        if (x > window.innerWidth - nodeDims.width) {
            x = window.innerWidth - nodeDims.width - 3;
            if (x < 3) x = 3;
        }
        y += window.scrollY;
        x = x + window.scrollX + xOffset;
        return { y, x };
    }
    anchorPosition(): Pos {
        if (!this.anchor) {
            throw Error('anchorPosition() called while anchor is undefind');
        }
        const dims = this.anchor.getBoundingClientRect();
        return {
            x: dims.left + dims.width / 2,
            y: dims.y + dims.height / 2,
        };
    }
    startUrlWatcher = (() => {
        const url = location.href;
        return () => {
            const id = setInterval(() => {
                if (url !== location.href) {
                    clearInterval(id);
                    this.close();
                }
            }, 907);
        };
    })();
}

/**
 * SPDX-FileCopyrightText: 2026 <Lutz Brückner> <dev@kahuna.rocks>
 * SPDX-License-Identifier: GPL-3-0-or-later
 */

import { html } from 'lit-html';
import { createRef, ref, type Ref } from 'lit/directives/ref.js';
import md5 from 'blueimp-md5';

import { ScrubblerDB } from './database.ts';
import { error, log } from './logger.ts';
import Settings from './settings.ts';
import {
    type CheckedAlbums,
    type ArtistAlbums,
    checkedArtistAlbums,
} from '../lib/checked-albums.ts';
import ModalDialog from '../lib/modal-dialog.ts';
import checkbox from '../lib/checkbox.ts';
import { reportJobsCount } from '../lib/jobs-count.ts';
import { camelize } from '../lib/lastfm-page.ts';
import {
    mapScrobbleCounts,
    tracksCountsTitle,
    UNNAMED_ENTRY,
    type CountMap,
} from '../lib/scrobble-maps.ts';
import textinput from '../lib/textinput.ts';
import {
    getCheckedAlbumScrobbles,
    getCheckedAlbumTitleScrobbles,
    getCheckedArtistScrobbles,
    getCheckedTrackScrobbles,
} from '../lib/data-queries.ts';
import type { Job } from '../types/jobs.ts';
import {
    EditFormValues,
    ExtendedEditFormValues,
    Scrobble,
    ScrobbleField,
    scrobbleFields,
} from '../types/lastfm.ts';
import type { ScrubblerItem, ScrubblerSubject } from '../types/scrubbler.ts';

export type EditFormData = EditFormValues & {
    edit_all: 'on';
    create_automatic_edit_rule?: 'on';
    submit: 'edit-scrobble';
    ajax: '1';
};

type BaseKey = 'artist_name' | 'track_name' | 'album_artist_name' | 'album_name';
type OriginalKey<F extends BaseKey> = `${F}_original`;

export default class EditPopup {
    db: ScrubblerDB;
    dialog: ModalDialog;
    albumArtistNameInputRef: Ref<HTMLElement> = createRef();
    saveButtonRef: Ref<HTMLElement> = createRef();
    affectedMessageRef: Ref<HTMLElement> = createRef();
    item: ScrubblerItem;
    subject: ScrubblerSubject;
    scrobbles: Scrobble[] = [];
    scrobbleTracks: CountMap = new Map();
    scrobbleArtists: CountMap = new Map();
    scrobbleAlbums: CountMap = new Map();
    scrobbleAlbumArtists: CountMap = new Map();
    checkedArtistAlbums: ArtistAlbums;
    automaticEditChecked: boolean = false;
    pageReloadChecked: boolean = false;
    constructor(
        db: ScrubblerDB,
        item: ScrubblerItem,
        subject: ScrubblerSubject,
        checkedAlbums: CheckedAlbums,
    ) {
        this.db = db;
        this.item = item;
        this.subject = subject;
        this.checkedArtistAlbums = checkedArtistAlbums(checkedAlbums);
        const count = this.checkedArtistAlbums.length;
        if (count === 0) {
            throw Error('EditPopup invoked with no albums checked');
        }
        this.dialog = new ModalDialog();
    }
    async show() {
        this.scrobbles = await this.itemScrobbles();
        this.scrobbleTracks = mapScrobbleCounts(this.scrobbles, 'track_name');
        this.scrobbleArtists = mapScrobbleCounts(this.scrobbles, 'artist_name');
        this.scrobbleAlbums = mapScrobbleCounts(this.scrobbles, 'album_name');
        this.scrobbleAlbumArtists = mapScrobbleCounts(
            this.scrobbles,
            'album_artist_name',
        );
        const { automaticEditChecked, pageReloadChecked } = await new Settings(
            this.db,
        ).get(['automaticEditChecked', 'pageReloadChecked']);
        this.automaticEditChecked = automaticEditChecked;
        this.pageReloadChecked = pageReloadChecked;

        this.dialog.show(this.view());
        this.validateForm();
    }
    async itemScrobbles() {
        switch (this.subject) {
            case 'track':
                return await getCheckedTrackScrobbles(
                    this.db,
                    this.item,
                    this.checkedArtistAlbums,
                );
            case 'album':
                return await getCheckedAlbumScrobbles(
                    this.db,
                    this.item,
                    this.checkedArtistAlbums,
                );
            case 'artist':
                return await getCheckedArtistScrobbles(
                    this.db,
                    this.item,
                    this.checkedArtistAlbums,
                );
            case 'album-title':
                return await getCheckedAlbumTitleScrobbles(
                    this.db,
                    this.item,
                    this.checkedArtistAlbums,
                );
        }
    }
    view() {
        if (this.scrobbles.length === 0) {
            throw Error('EditPopup failed to get scrobbles');
        }
        const previousArtist =
            this.scrobbleArtists.size === 1
                ? this.scrobbleArtists.keys().next().value
                : undefined;
        return html`
            <div class="scrobble-scrubbler-scrobble-edit">
                ${this.headline()}
                <form class="edit-form">
                    ${this.inputRow('Track', 'track_name', this.scrobbleTracks)}
                    ${this.inputRow('Artist', 'artist_name', this.scrobbleArtists, {
                        'data-previous-value': previousArtist,
                    })}
                    ${this.inputRow('Album', 'album_name', this.scrobbleAlbums)}
                    ${this.inputRow(
                        'Album Artist',
                        'album_artist_name',
                        this.scrobbleAlbumArtists,
                        {
                            refVar: this.albumArtistNameInputRef,
                        },
                    )}
                    <hr />
                    <div class="options">
                        ${this.automaticEditCheckbox()} ${this.reloadPageCheckbox()}
                    </div>
                    <div class="scrobble-scrubbler-buttons">
                        ${this.saveButton()}${this.cancelButton()}
                        ${this.affectedMessage()}
                    </div>
                </form>
            </div>
        `;
    }
    headline() {
        const count = this.scrobbles.length;
        const soloCount = count && count > 1 ? count : '';
        const text = this.isBulkEdit()
            ? `Bulk Edit ${count} Scrobbles`
            : `Edit ${soloCount} Scrobble${this.pluralScrobbles()}`;
        return html`
            <h1>${text}</h1>
        `;
    }
    isBulkEdit() {
        return (
            this.scrobbleTracks.size > 1 ||
            this.scrobbleArtists.size > 1 ||
            this.scrobbleAlbums.size > 1 ||
            this.scrobbleAlbumArtists.size > 1
        );
    }
    inputRow(
        title: string,
        fieldName: ScrobbleField,
        listMap: CountMap,
        inputOptions: Record<string, unknown> = {},
    ) {
        return html`
            <div class="inactive">
                <p class="input-label">${title}</p>
                ${this.disabledInput(fieldName, listMap)}
            </div>
            <div class="form-arrow"></div>
            <div class="active">${this.input(fieldName, listMap, inputOptions)}</div>
            ${this.mixedDatalist(listMap, this.listId(fieldName, listMap.size > 1))}
            ${this.mixedInputHints(listMap, `${title.toLowerCase()}s`)}
        `;
    }
    pluralScrobbles() {
        const count = this.scrobbles.length;
        return count > 1 ? 's' : '';
    }
    disabledInput(field: ScrobbleField, listEntries: CountMap) {
        let value = listEntries.keys().next().value;
        let placeholder = null;
        if (listEntries.size > 1) {
            value = undefined;
            placeholder = 'Mixed';
        }
        return textinput({
            id: `${field}_original`,
            name: `${field}_original`,
            value,
            disabled: true,
            placeholder,
            spellcheck: false,
        });
    }
    input(
        field: ScrobbleField,
        listEntries: CountMap,
        attribs?: Record<string, unknown>,
    ) {
        const isBulk = listEntries.size > 1;
        let value = listEntries.keys().next().value;
        let placeholder = null,
            list = null,
            autocomplete = null;

        if (isBulk) {
            value = undefined;
            placeholder = 'Mixed';
            list = this.listId(field, isBulk);
            autocomplete = 'off';
        } else if (value === UNNAMED_ENTRY) {
            value = '';
        }
        if (typeof attribs === 'undefined') {
            attribs = {};
        }
        return textinput({
            id: field,
            name: field,
            value,
            placeholder,
            autocomplete,
            spellcheck: false,
            '@input': this.onInput.bind(this),
            '@change': this.onChange,
            list,
            ...attribs,
        });
    }
    itemValue(field: ScrobbleField) {
        if (scrobbleFields.includes(field) === false) {
            throw Error(`${field} is not a valid ScrobbleField name!`);
        }
        return this.item[camelize(field) as keyof ScrubblerItem] || null;
    }
    decamelize(value: string) {
        return value.replace(/([A-Z])/g, `${'_'}$1`).toLowerCase();
    }
    listId(field: ScrobbleField, isBulk: boolean) {
        return isBulk ? `scrobble-scrubbler-${field}-list` : null;
    }
    mixedDatalist(countMap: CountMap, listId: string | null) {
        if (countMap.size <= 1) return '';
        const listOptions = [...countMap.entries()]
            .filter((entry) => entry[0] !== UNNAMED_ENTRY)
            .sort((a, b) => {
                return a < b ? -1 : 1;
            })
            .map(
                (entry) => html`
                    <option>${entry[0]}</option>
                `,
            );
        return html`
            <datalist id=${listId}>${listOptions}</datalist>
        `;
    }
    mixedInputHints(countMap: CountMap, caption: string) {
        if (countMap.size < 2) return '';
        const title = tracksCountsTitle(countMap);
        return html`
            <div class="hint" title=${title}>${countMap.size} ${caption}</div>
        `;
    }
    automaticEditCheckbox() {
        const content = this.isUnnamedOnlyEdit()
            ? `when editing scrobbles without an album, automatic edits cannot be saved.`
            : html`
                  ${checkbox({
                      id: 'automatic-edit-checkbox',
                      name: 'create_automatic_edit_rule',
                      label: `Apply to all future scrobbles of this track${this.pluralScrobbles()}`,
                      checked: this.automaticEditChecked,
                      '@change': this.optionCheckboxChanged.bind(
                          this,
                          'automaticEditChecked',
                      ),
                  })}
              `;

        return html`
            <div class="automatic-edit">
                <p class="input-label">Automatic edit</p>
                ${content}
            </div>
        `;
    }
    isUnnamedOnlyEdit() {
        return (
            this.checkedArtistAlbums.length === 1 &&
            this.checkedArtistAlbums[0].artist === ''
        );
    }
    reloadPageCheckbox() {
        return html`
            <div class="reload-page">
                <p class="input-label">Page reload</p>
                ${checkbox({
                    id: 'reload-page-checkbox',
                    name: 'reload_page',
                    label: 'Reload page after all jobs are completed',
                    checked: this.pageReloadChecked,
                    '@change': this.optionCheckboxChanged.bind(this, 'pageReloadChecked'),
                })}
            </div>
        `;
    }
    saveButton() {
        return html`
            <button
                class="btn-primary"
                @click=${this.saveEditJobs.bind(this)}
                ${ref(this.saveButtonRef)}
            >
                Save edit${this.pluralScrobbles()}
                <span class="star">&starf;</span>
            </button>
        `;
    }
    cancelButton() {
        return html`
            <button class="btn-secondary" @click=${this.dialog.close.bind(this.dialog)}>
                Cancel
            </button>
        `;
    }
    affectedMessage() {
        return html`
            <p class="affected-message" ${ref(this.affectedMessageRef)}>
                x scrobbles will be affected by y edits
            </p>
        `;
    }
    optionCheckboxChanged(
        option: 'automaticEditChecked' | 'pageReloadChecked',
        event: Event,
    ) {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            new Settings(this.db).set([{ name: option, value: target.checked }]);
            this[option] = target.checked;
        }
    }
    onInput(event: Event) {
        const target = event.target;
        if (
            target instanceof HTMLInputElement === false ||
            this.albumArtistNameInputRef.value instanceof HTMLInputElement === false
        ) {
            return;
        }
        if (target.name === 'artist_name') {
            this.syncAlbumArtist(target, this.albumArtistNameInputRef.value);
        }
        if (target.name === 'album_name') {
            this.setAlbumArtist(target, this.albumArtistNameInputRef.value);
        }
        this.validate(target);
    }
    validateForm() {
        const fields =
            this.dialog.dialogNode.querySelectorAll<HTMLInputElement>('div.active input');
        if (fields) {
            Array.from(fields).forEach((field) => this.validate(field));
        }
    }
    validate(target: HTMLInputElement) {
        if (!this.saveButtonRef.value) return;
        if (target.value.trim() === '' && target.placeholder === '') {
            target.classList.add('invalid');
            target.setAttribute('title', 'please enter a value');
        } else {
            target.classList.remove('invalid');
            target.removeAttribute('title');
        }

        let modifications: EditFormValues[] | undefined = [];
        const invalid = !!this.dialog.dialogNode.querySelector('input.invalid');
        if (!invalid) {
            modifications = this.getModifications();
        }
        const saveButton = this.saveButtonRef.value as HTMLButtonElement;
        saveButton.disabled = invalid || !modifications;

        this.handleAffectedMessage(modifications);
    }
    handleAffectedMessage(modifications: EditFormValues[] | undefined) {
        const nodeMessage = this.affectedMessageRef.value;
        if (!nodeMessage) return;
        if (modifications && this.scrobbles.length > 1) {
            const affected = this.getAffectedScrobblesCount(
                modifications,
                this.scrobbles,
            );
            const editsCount = this.getAffectedScrobblesCount(
                modifications,
                this.getDistinctScrobbles(),
            );
            const s1 = affected > 1 ? 's' : '';
            const s2 = editsCount > 1 ? 's' : '';
            const message = `<span class="star">&starf;</span>${affected} scrobble${s1} will be affected by ${editsCount} edit${s2}`;
            nodeMessage.innerHTML = message;
            nodeMessage.style.visibility = 'visible';
            this.saveButtonStarVisible(true);
        } else {
            nodeMessage.style.visibility = 'hidden';
            this.saveButtonStarVisible(false);
        }
    }
    saveButtonStarVisible(visible: boolean) {
        const nodeStar =
            this.saveButtonRef.value?.querySelector<HTMLElement>('span.star');
        if (nodeStar) {
            nodeStar.style.visibility = visible ? 'visible' : 'hidden';
        }
    }
    /* if the artist_name field and the album:_artist_name field contain the same value
     * and artist_name is edited, synchronize the two fields */
    syncAlbumArtist(source: HTMLInputElement, target: HTMLInputElement) {
        const previousValue = source.dataset.previousValue;
        if (previousValue === target.value) {
            target.value = source.value;
            source.dataset.previousValue = source.value;
        }
    }
    /* if the album_artist_name field is empty and an album_name is selected from
     * the datalist, set the album_artist_name field to the AlbumArtist belonging
     * to the selected entry */
    setAlbumArtist(source: HTMLInputElement, target: HTMLInputElement) {
        if (source.list === null || target.value !== '') {
            return;
        }
        const listEntries = Array.from(source.list.options).map((entry) => entry.value);
        if (listEntries.includes(source.value) === false) {
            return;
        }
        target.value = this.checkedArtistAlbums.filter(
            (item) => item.album === source.value,
        )[0].artist;
    }
    onChange(this: HTMLInputElement) {
        this.value = this.value.trim();
    }
    saveEditJobs(event: Event) {
        event.preventDefault();
        const jobs: Job[] = [];
        const modifications: EditFormValues[] | undefined = this.getModifications();
        if (modifications) {
            for (const modification of modifications) {
                jobs.push(this.scrobbleJob(modification));
            }
            this.addJobs(jobs);
            this.managePageReload();
            this.dialog.close(event);
        } else {
            this.noChangesWarning();
        }
    }
    getModifications(): EditFormValues[] | undefined {
        const form = this.dialog.dialogNode.querySelector<HTMLFormElement>('.edit-form');
        if (form instanceof HTMLFormElement === false) {
            throw Error('Failed to find edit form!?!');
        }
        const elements = Array.from(form.elements).filter(
            (element) => element instanceof HTMLInputElement,
        );
        const values = this.formValues(elements);
        if (this.formChanged(values)) {
            const modifications = this.modifiedFormValues(
                this.getDistinctScrobbles(),
                values,
            );
            return modifications;
        }
    }
    scrobbleJob(values: EditFormValues) {
        const data = Object.assign(values, {
            edit_all: 'on',
            submit: 'edit-scrobble',
            ajax: '1',
        });
        return {
            job: 'editScrobble',
            state: 'waiting',
            retries: 0,
            modified: Date.now(),
            data,
            hash: md5(`editScrobbles-${JSON.stringify(data)}`),
        } as Job;
    }
    formValues(elements: HTMLInputElement[]) {
        const values: [string, string][] = [];
        elements.forEach((element) => {
            if (element.type === 'checkbox' && element.checked === false) {
                return;
            }
            values.push([element.name, element.value.trim()]);
        });
        return Object.fromEntries(values) as EditFormData;
    }
    formChanged(values: EditFormValues) {
        const scrobbleFields: BaseKey[] = [
            'artist_name',
            'track_name',
            'album_artist_name',
            'album_name',
        ];
        return scrobbleFields.some((key) => {
            const originalKey: OriginalKey<typeof key> = `${key}_original`;
            return values[originalKey].toLowerCase() !== values[key].toLowerCase();
        });
    }
    noChangesWarning() {
        const headline = this.dialog.dialogNode.querySelector<HTMLElement>('h1');
        let alert = this.dialog.dialogNode.querySelector<HTMLElement>('div.alert');
        if (headline && !alert) {
            alert = document.createElement('div');
            alert.classList.add('alert', 'alert-danger');
            alert.innerText =
                "Your edit doesn't contain any real changes. Changes in capitalization are not taken into account";
            headline.after(alert);
        }
    }
    modifiedFormValues(scrobbles: Scrobble[], values: EditFormData) {
        const modified: ExtendedEditFormValues[] = [];
        scrobbles.forEach((scrobble) => {
            if (this.isModified(scrobble, values)) {
                const formValues: ExtendedEditFormValues = {
                    artist_name:
                        values.artist_name !== ''
                            ? values.artist_name
                            : scrobble.artist_name,
                    track_name:
                        values.track_name !== ''
                            ? values.track_name
                            : scrobble.track_name,
                    album_name:
                        values.album_name !== ''
                            ? values.album_name
                            : scrobble.album_name || '',
                    album_artist_name:
                        values.album_artist_name !== ''
                            ? values.album_artist_name
                            : scrobble.album_artist_name || '',
                    artist_name_original: scrobble.artist_name,
                    track_name_original: scrobble.track_name,
                    album_artist_name_original: scrobble.album_artist_name || '',
                    album_name_original: scrobble.album_name || '',
                    timestamp: String(scrobble.timestamp),
                    create_automatic_edit_rule: values.create_automatic_edit_rule,
                };
                if (scrobble.album_name === undefined) {
                    // no automatic edits for unamed albums
                    delete formValues.create_automatic_edit_rule;
                }
                modified.push(formValues);
            }
        });
        return modified;
    }
    isModified(scrobble: Scrobble, values: EditFormValues) {
        return (
            (values.track_name !== '' &&
                values.track_name.toLowerCase() !== scrobble.track_name.toLowerCase()) ||
            (values.artist_name !== '' &&
                values.artist_name.toLowerCase() !==
                    scrobble.artist_name.toLowerCase()) ||
            (values.album_name !== '' &&
                values.album_name.toLowerCase() !== scrobble.album_name?.toLowerCase()) ||
            (values.album_artist_name !== '' &&
                values.album_artist_name.toLowerCase() !==
                    scrobble.album_artist_name?.toLowerCase())
        );
    }
    distinctScrobbles: Scrobble[] = [];
    getDistinctScrobbles(): Scrobble[] {
        if (this.distinctScrobbles.length === 0) {
            const distinct: Map<string, Scrobble> = new Map();
            for (const scrobble of this.scrobbles) {
                const { track_name, artist_name, album_name, album_artist_name } =
                    scrobble;
                const key = `${track_name.toLowerCase()}${artist_name.toLowerCase()}${album_name?.toLowerCase()}${album_artist_name?.toLowerCase()}`;
                distinct.set(key, scrobble);
            }
            this.distinctScrobbles = [...distinct.values()];
        }
        return this.distinctScrobbles;
    }
    getAffectedScrobblesCount(modifications: EditFormValues[], scrobbles: Scrobble[]) {
        let count = 0;
        scrobbles.forEach((s: Scrobble) => {
            const foundIndex = modifications.findIndex((m) => {
                return (
                    // previously albumless scrobble -> count++
                    (s.album_name === undefined && m.album_name !== '') ||
                    // previously albumless scrobble -> count++
                    (s.album_artist_name === undefined && m.album_artist_name !== '') ||
                    // if all these properties match, then there must be a difference
                    // with the present modification properties -> count++
                    (s.track_name.toLowerCase() === m.track_name_original.toLowerCase() &&
                        s.artist_name.toLowerCase() ===
                            m.artist_name_original.toLowerCase() &&
                        s.album_name?.toLowerCase() ===
                            m.album_name_original.toLowerCase() &&
                        s.album_artist_name?.toLowerCase() ===
                            m.album_artist_name_original.toLowerCase())
                );
            });
            if (foundIndex !== -1) {
                count++;
            }
        });
        return count;
    }
    managePageReload() {
        const value = this.pageReloadChecked ? location.href : '';
        new Settings(this.db).set([{ name: 'pageReloadUrl', value }]);
    }
    addJobs(jobs: Job[]) {
        if (jobs.length === 0) return;
        const hashes: string[] = jobs.map((job) => job.hash);
        const db = this.db;
        db.transaction('rw', db.jobs, async () => {
            const existingJobs = await db.jobs
                .where('hash')
                .anyOf(hashes)
                .filter((job) => ['waiting', 'running'].includes(job.state))
                .toArray();
            const existingHashes: string[] = existingJobs.map((job) => job.hash);
            const newJobs = jobs.filter(
                (job) => existingHashes.includes(job.hash) === false,
            );
            await db.jobs.bulkAdd(newJobs);
            log(`added ${newJobs.length} EditScrobble jobs`);
            reportJobsCount(db);
        }).catch((err) => {
            error(`failed to add EditScrobble jobs: ${String(err)}`);
        });
    }
}

# v1.1.3
- Released on 2026/09/13
- Bugfix: Update the ScrobbleScrulbber database when Last.fm's trash can icon is used on a library page to delete a track, album, or artist.

# v1.1.2
- Released on 2026/09/07
- Bugfix: Always display the pink question mark icon in library scrobble lists when a scrobble is missing, instead of a disc icon if there are remaining track scrobbles.
- If an additional scrobble is found during the inspection of the relevant timestamp after ctrl-click on a pink question mark icon, reload the displayed page and do not show a dialog.

# v1.1.1
- Released on 2026/08/30
- Bugfix: If Last.fm's native "Edit scrobble" is used without the "Bulk edit" checkbox being enabled, update only the data of the one edited scrobble in the ScrobbleScrubbler database.
- The text in the InfoPopup for albums has been adjusted to clarify that the number of total scrobbles refers there to the album artist.

# v1.1.0
- Released on 2026/08/18
- Added an 'ignore' button to the Info Popup to not display a green disc icon for albums if there are other albums with the same title.
- Additional capitalization check and, if necessary, correction when the InfoPopup is called.

# v1.0.2
- Released on 2026/08/07
- Improved reliability of Pro detection on Chromium-based browsers.
- The scroll position gets restored after page reloads.
- Removed the Windows key modifier for opening links in a new tab due to limited support.
- Linked the album and track totals on artist library pages to their respective album and track pages.
- Added a fix for inconsistent album title capitalization caused by Last.fm updates, which resulted in incorrect green disk icon status.
- Restricted scrobble correction records by album title when resolving database discrepancies after Ctrl-clicking a ?-icon for conflicting album artist names.
- Added a documentation link to the extension popup.

# v1.0.1
- Released on 2026/02/20
- Intercept album-edit requests and update the affected scrobble data in the database.

# v1.0.0.
- Released on 2026/02/14

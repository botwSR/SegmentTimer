# Segment Timer

Measure sections of a video, add their durations, and compare the total marked time across two clips—all in your browser.

Segment Timer is useful for comparing loading times, timing repeated events, or measuring selected portions of a recording. Open a local video, mark the sections you care about, and export the results as a spreadsheet or a reusable project.

## Features

- **Frame-based marking:** Set precise in and out points using playback controls, keyboard shortcuts, timecodes, or frame numbers.
- **One or two clips:** Work with a single video or open two independent workspaces side by side.
- **Automatic totals:** See the duration of each segment and the combined marked time.
- **Total-time comparison:** Compare both clips' totals in minutes, seconds, and frames.
- **Editable timeline:** Adjust segment boundaries, zoom in, and step through frames with the scroll wheel.
- **CSV and JSON exports:** Export measurements for analysis or save a project to resume later.
- **Local video playback:** Your selected video files stay on your device.

> [!IMPORTANT]
> Sessions are held in memory. Export a **JSON project** before refreshing the page or closing the tab. In Two Clip Mode, export each clip separately.

## Getting started

### Run locally

You need Node.js installed. The project has no third-party runtime dependencies and requires no installation or build step.

From the project folder, run:

```sh
npm start
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173) in your browser. Keep the terminal running while using the site; press `Ctrl+C` in the terminal to stop the server.

You can also start it directly:

```sh
node server.mjs
```

### Mark your first segment

1. Select **Open video**, or drag a video onto the source monitor.
2. Set **Source FPS** to match the recording's frame rate.
3. Play or scrub to the start of the section you want to measure.
4. Press **I**, or select **Set at playhead** beside **IN**.
5. Move to the end of the section.
6. Press **O**, or select **Set at playhead** beside **OUT**.
7. Enter an optional segment name, then select **Add segment**.

Repeat these steps for additional sections. Each saved segment appears in the segment list and timeline, and contributes to **Total marked time**.

> [!NOTE]
> Source FPS is set manually. The browser does not reliably report a video's original frame rate, so confirm this setting before marking segments.

## Working with segments

### Navigate the video

Use the playback buttons or keyboard shortcuts to move through the recording. Click or drag on the timeline to scrub, use **Zoom** for a closer view, and select **Fit** to show the entire source again.

Scrolling vertically over the timeline steps one frame at a time. Hold **Shift** while scrolling to pan the timeline.

### Edit or remove a segment

Select a segment in the timeline or segment summary, or select **Edit** in the marked-segments table. Adjust its in and out points using the fields or timeline handles, then select **Save changes**.

You can also edit names and timecodes directly in the table. Changes apply when the field loses focus. Select **×** on a row to delete that segment.

### Choose the duration display

The **Duration display** setting changes how selection, segment, and total durations appear:

| Format | Example | Meaning |
| --- | --- | --- |
| Milliseconds | `00:01:02.500` | Hours, minutes, seconds, and milliseconds |
| Frames | `00:01:02:15` | Hours, minutes, seconds, and frames |

The frame example represents 62.5 seconds at 30 FPS. Changing the display format does not change the marked boundaries or underlying measurements.

## Comparing two clips

1. Select **Two Clip Mode** in the header.
2. Use **Open video · Clip 1** and **Open video · Clip 2** to load your recordings.
3. Set the correct **Source FPS** for each clip.
4. Mark the sections you want to measure in each workspace.
5. Scroll below both workspaces to **Total time comparison**.

The comparison automatically shows:

- Clip 1's total marked time.
- Clip 2's total marked time.
- Which total is longer and the difference in minutes, seconds, and frames.

All marked segments contribute to the comparison; there are no segment selectors. The result updates when you add, edit, or delete segments, or change a clip's FPS. A clip with no marked segments counts as zero.

**The comparison uses elapsed time**, so clips with different frame rates can be compared. Remaining frames in the difference are expressed at **Clip 1's FPS**. Different frame rates can produce fractional frames.

Each workspace has independent playback, volume, FPS, marks, and exports. Click inside a workspace or select its clip heading to direct keyboard shortcuts to it. The active heading displays **Keyboard shortcuts active**.

Select **Single Clip Mode** to return to one workspace. Clip 2 pauses and is hidden, but its video and marks remain available when you switch back. On narrower screens, the two workspaces stack vertically.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| **Space** | Play or pause |
| **← / →** | Step backward or forward one frame |
| **Shift + ← / →** | Step backward or forward ten frames |
| **I** | Set the in point at the playhead |
| **O** | Set the out point at the playhead |
| **Enter** | Add a segment or save the segment being edited |
| **Home** | Move to the start of the video |
| **End** | Move to the end boundary of the video |
| **Esc** | Clear the draft or cancel the current edit |
| **Scroll wheel over timeline** | Step one frame per wheel event |
| **Shift + scroll wheel** | Pan the timeline |

When an in/out handle has keyboard focus, the arrow keys adjust that boundary instead of the playhead. Hold **Shift** to adjust it by ten frames.

Shortcuts are inactive while typing in a field or using a select control. When a button has focus, **Space** and **Enter** activate that button.

A shortcut reference appears to the left of the source monitor in Single Clip Mode at window widths of 1400 pixels or more. It hides in narrower layouts and in Two Clip Mode.

## Saving and exporting

Choose a format beside **Export data** in the marked-segments panel. Export is available after you have added at least one segment.

| Format | Best for | Includes |
| --- | --- | --- |
| **CSV spreadsheet** | Reviewing or analyzing results in spreadsheet software | Segment names, in/out timecodes and frame numbers, durations, source information, FPS, and a total row |
| **JSON project** | Saving a session and reopening it later | Source metadata, FPS, display preference, segment names and boundaries, and totals |

CSV follows the selected duration display format and also includes duration frames and seconds. Seconds are exported to six decimal places.

Exports contain timing data, **not the original video or edited video clips**. In Two Clip Mode, each workspace exports its own data; the comparison is not a combined project or export.

### Resume a saved project

1. Select **Import JSON** in the workspace you want to restore.
2. Choose a previously exported JSON project.
3. Use **Open video** to reconnect the original recording when prompted.

Keep the original video file with its original name. The app checks the filename and duration when reconnecting a saved project. For a two-clip session, repeat these steps in the other workspace.

## Timing and accuracy

- **Frame numbers start at zero.**
- **The out point is exclusive.** A segment from frame 10 to frame 20 contains 10 frames. At 30 FPS, a segment from frame 0 to frame 30 lasts one second.
- **Overlapping segments count separately.** Totals sum the duration of every marked segment; they do not merge overlapping intervals.
- **Timecodes use non-drop-frame `HH:MM:SS:FF`.** At fractional rates such as 29.97 FPS, timecode labels differ from elapsed clock time. Use the milliseconds display when you want elapsed durations.
- **Frame stepping follows the configured FPS grid.** It seeks within the video; it does not index or transcode the source. For exact source-frame alignment, use constant-frame-rate footage with the matching FPS setting.
- **A partial final frame counts as one frame** on the configured grid.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| A video will not play | Playback depends on browser and codec support. Try a browser-supported H.264 MP4 or WebM file. |
| Frame steps or durations seem wrong | Confirm Source FPS matches the recording. Variable-frame-rate footage may need conversion to constant frame rate. |
| A shortcut does not work | Move focus out of input fields or select controls. In Two Clip Mode, select the intended workspace. |
| A saved project asks for its source | JSON saves timing data, not video. Reopen the original recording with its original filename. |
| Marks disappeared after refreshing | Sessions are not automatically saved. Import an exported JSON project to restore your work. |
| The shortcut reference is missing | It is shown only in Single Clip Mode when the window is at least 1400 pixels wide. |

## Development

The site uses plain HTML, CSS, and JavaScript. Its authored website files are in `dist/`; no build process is needed.

```text
dist/
  index.html       Page markup
  styles.css       Styles and responsive layouts
  app.js           Video playback, marking, editing, and exports
  workspaces.js    Clip modes and total-time comparison interface
  timing.js        Frame, timecode, duration, and CSV utilities
  comparison.js    Duration comparison calculations
tests/             Timing and comparison tests
server.mjs         Local static preview server
```

Run the tests with:

```sh
npm test
```

Tests cover frame/timecode conversions, fractional rates, exclusive boundaries, overlapping totals, invalid inputs, CSV serialization, duration displays, and comparisons across different frame rates.

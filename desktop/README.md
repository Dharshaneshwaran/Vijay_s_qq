# QBIT Desktop Companion

Local Windows companion using Electron, React 19, TypeScript and Vite. All app files live in `desktop`; hardware code is untouched.

## Run

With Node.js 22 LTS and npm installed, open a terminal here:

    npm install
    npm run dev

Production: `npm run build` then `npm start`. Portable Windows executable: `npm run dist`, output in `release`.

The floating face has a draggable handle above it. Hover to reveal the small minimize button; restore from the Windows taskbar at the same desktop position. Right-click the face for Open Control Center, Minimize QBIT, or Quit QBIT. Reminders and battery polling continue while minimized. Tap the face for a reaction. Open QBIT or the system tray opens the Control Center. Closing the Control Center keeps reminders running. Quit through the tray menu.

Reminders use the computer's local clock, persist with electron-store in Electron's user-data directory, and are checked every second and after sleep/resume. Overdue reminders fire once on the next launch. Windows notification settings can suppress notifications. The application must be running for scheduled delivery.

Sound uses Web Audio. Click the floating face once to unlock its audio; autoplay policy can prevent sound before user interaction. Settings provide mute, volume and test sounds. Only the widget plays reminder alarms, preventing duplicate sounds across windows.

CPU and RAM use systeminformation every 2 seconds; graphics are queried every 3 seconds, with no overlapping polls for a resource. CPU model and logical processor inventory load once at startup. RAM use is total minus available memory. Every GPU is shown separately; processing utilization is never inferred from VRAM occupancy. Missing utilization is N/A, while a genuine measured zero stays 0%. Driver/OS inventory queries may take several seconds. Battery refreshes every 10 seconds and shows percentage, charging, AC status and remaining time when available. Missing telemetry says Battery unavailable; a missing estimate says Remaining time unavailable.

A regular browser displays an interface preview; Electron is required for persistence and OS features. No cloud services, authentication or AI APIs. Renderers use context isolation, sandboxing and a narrow IPC bridge with input validation.

## Verification

`npm run build` type-checks renderer and main process and produces the Vite build. For a manual smoke test: click/drag the companion, add a reminder a minute ahead, close Control Center, verify alert/notification, reopen through tray, verify completion, mute, delete, restart, and verify settings persist. Test resume by scheduling a reminder before putting Windows to sleep until after its due time.

If the bundled portable runtime is present, double-click Start-QBIT.cmd to build and launch without installing Node globally. Downloaded runtime and dependencies are ignored by git.

Automated Electron smoke check: npm test. Uses an isolated data directory under .tools; checks scheduling while Control Center is closed, resume delivery, IPC validation, persisted settings/deletion, sampled metrics and window reopening.

## Adaptive companion upgrade

Dragging uses native Electron regions in the background and subtle three-dot handle. The face and buttons remain clickable. The old renderer-driven click-through toggle was removed because it conflicts with non-client drag regions. Position is saved after movement and restored on restart. Startup and display-layout changes recover an off-screen widget, including after restore if a monitor disappeared while minimized. Normal monitoring never resets position. Negative monitor coordinates are supported.

Left-click the native system-tray icon to show/hide QBIT. Right-click it for Control Center, CPU/RAM/GPU summary, Pause animations and Quit. Hiding removes the widget taskbar button. Native minimize/restore keeps its position. Closing the floating widget hides it; QBIT exits through Quit. Reminders, battery and hardware monitoring continue hidden. Windows may place the icon in the tray overflow menu; its location cannot be forced. Cached bitmap faces reflect the current mood with a gentle low-rate blink, without recreating the tray object.

One main-process expression engine drives both renderers and the tray. Hardware activity weights are CPU 45%, RAM 25%, GPU 30%. Without valid GPU utilization, CPU/RAM weights normalize to 100%. Automatic GPU selection uses the busiest valid reading; settings can select a specific GPU. Five samples, four-point hysteresis and an eight-second minimum mood duration prevent flicker. RAM occupancy alone cannot produce a stressed mood.

The six activity moods are sleepy, curious, happy, focused, stressed and exhausted. Priority is critical battery (5% or lower while discharging), reminder (12 seconds), click/playful (3 seconds), charging transition (4 seconds), low-battery worry (20% or lower), hardware mood, then resting expression. Temporary reactions expire automatically. Fourteen SVG expressions retain QBIT's blinking, breathing, bounce and reminder reactions.

Global eye tracking uses Electron screen coordinates every 75 ms while visible and enabled, without global mouse hooks. Movement is bounded to six pixels before intensity adjustment (at most seven pixels), with easing and reduced movement during special expressions. Tracking stops hidden/minimized or when paused/disabled; hidden widget animations pause too. Current window bounds keep tracking aligned after dragging and on monitors with negative origins.

Settings persist cursor tracking, adaptive expressions, tray animation, pause, expression intensity, widget size and preferred GPU, alongside existing sound and appearance settings. Controls also show/hide QBIT and reset its position. New defaults merge with existing settings without discarding reminders. Renderer Node integration remains disabled, context isolation/sandboxing stay enabled, and named IPC handlers validate sender windows, frames and inputs.

Additional checks:

    npm run test:drag
    npm run test:hardware

`npm test` also checks expression priorities/smoothing and the upgrade with isolated hardware fixtures: global cursor movement, hidden reminders, controls, multiple GPUs, persisted settings, nonoverlapping polls, adaptive mood changes and all fourteen rendered SVG faces. The expression review image is `.tools/expressions-review.png`.

`test:drag` performs actual Windows mouse input and launches a second process to check position restoration. `test:hardware` probes real systeminformation readings. GUI checks briefly show test windows and move/restore the pointer; they need an interactive Windows session. All tests use isolated app-data folders. Geometry tests cover negative monitor coordinates and disconnected-display recovery; physically dragging between monitors requires a multi-monitor setup.


Smoke coverage also checks the native drag/no-drag regions and desktop movement separately from minimize/restore, position retention (with Windows DPI rounding), reminders while minimized, and battery polling/error handling. For a manual Windows check, drag the three-dot handle across monitors, tap the face to confirm clicks still work, hover and minimize, then click the QBIT taskbar icon to restore it.


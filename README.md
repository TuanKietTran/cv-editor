# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## CV import

Use **Import CV** to drag and drop one or more PDF or image files (PNG, JPEG, WebP, TIFF, or BMP), up to 5 MB each. The client uploads each media blob to the CV server, follows extraction progress, shows warnings and an extracted Markdown preview, then loads the generated Markdown and CSS into the editor only after confirmation.

During development, `/cv-server` is proxied to `http://localhost:3000`. The user must already have a CV-server session. Set `CV_SERVER_PROXY_TARGET` to change the development target, or `VITE_CV_SERVER_URL` for a separately hosted/packaged client (see `.env.example`).

## Export formats

The editor exports the rendered CV as HTML, PDF, PNG, or JPEG. Image exports render at 2× resolution and work in both the browser and Tauri desktop app.

## User profiles

The **Profiles** manager stores reusable personal details, education history, and phone, email, address, and social contacts. The Tauri app persists profiles through Rust commands in `~/Documents/cv-editor/profiles.json`; the browser build keeps them client-side in `localStorage`.

See [Profile Management](specs/profile-management.md) for ownership, validation, and desktop/web sequence diagrams.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

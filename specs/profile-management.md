# Profile Management

Last updated: main | 2026-09-14

## Scope

This spec covers reusable user identity profiles in:

- `src/components/AppSidebar.tsx`, `AppSidebar.css`, `ProfileManager.tsx`, and `ProfileManager.css`;
- `src/types/profile.ts`;
- Tauri commands and persistence in `src-tauri/src/lib.rs`;
- the browser-build storage fallback.

A profile contains a full name, optional headline and summary, education entries, and contact entries. Contact kinds are `phone`, `email`, `address`, and `social`. Profile cards show every contact kind and value directly in the list.

The left application sidebar switches between the CV editor and Profiles. Profiles render as a full-workspace page rather than a modal; returning to the editor preserves the application document state.

Profile data is independent from Markdown/CSS projects. Creating or editing a profile does not modify the currently open CV.

## Storage Ownership

The Tauri desktop build detects `__TAURI_INTERNALS__`/`__TAURI__` and uses only core commands for profile operations. Rust owns validation, identifiers, timestamps, sorting, and persistence in `~/Documents/cv-editor/profiles.json`. Writes serialize the complete profile collection to a temporary file and rename it into place.

The ordinary web build does not invoke a server. `ProfileManager` reads and replaces the profile array in browser `localStorage` under `cv-editor:user-profiles:v1`. Consequently, web profiles are local to one browser storage origin and are not synchronized across browsers or devices.

## Desktop Profile Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as ProfileManager
    participant Invoke as Tauri invoke bridge
    participant Core as Rust profile commands
    participant File as profiles.json

    User->>UI: Choose Profiles in the application sidebar
    UI->>Invoke: list_profiles
    Invoke->>Core: list_profiles()
    Core->>File: Read and deserialize
    File-->>Core: Profile array or empty value
    Core-->>UI: Profiles sorted by updatedAt
    UI-->>User: Show profile cards and contact values

    alt Create profile
        User->>UI: Enter identity, contacts, and education
        UI->>Invoke: create_profile(profile)
        Invoke->>Core: Validate and assign IDs/timestamps
    else Update profile
        User->>UI: Edit profile
        UI->>Invoke: update_profile(id, profile)
        Invoke->>Core: Validate and update timestamp
    else Delete profile
        User->>UI: Confirm deletion
        UI->>Invoke: delete_profile(id)
        Invoke->>Core: Remove matching profile
    end
    Core->>File: Serialize complete collection and replace file
    Core-->>UI: Success or validation/storage error
    UI->>Invoke: list_profiles
    Invoke-->>UI: Refreshed list
```

## Web Profile Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as ProfileManager
    participant Browser as localStorage

    User->>UI: Choose Profiles in the application sidebar
    UI->>Browser: Read cv-editor:user-profiles:v1
    Browser-->>UI: Profile array or empty value
    UI-->>User: Show profile cards and contact values
    alt Create or update
        User->>UI: Save profile form
        UI->>UI: Validate required name, contacts, and institutions
    else Delete
        User->>UI: Confirm profile deletion
        UI->>UI: Remove profile from collection
    end
    UI->>Browser: Replace serialized profile array
    UI-->>User: Render refreshed list
```

## Validation And Failure Behavior

- Full name is required and limited to 120 characters in the Rust backend.
- Contact values are required and contact kinds must be one of the four supported kinds.
- Every education entry requires an institution.
- Rust assigns missing contact and education IDs and preserves supplied IDs on updates.
- A missing profile update or deletion returns `profile not found`.
- The UI displays create/update errors. Profile deletion requires browser confirmation.
- Invalid browser JSON is treated as an empty collection; a Rust read or deserialize failure currently also yields an empty collection.

## Current Gaps

- Profiles cannot yet populate or merge fields into the open CV source.
- There is no import/export, cross-device sync, profile selection on a project, or schema migration.
- The profile collection has no encryption or OS keychain integration and can contain personal data.
- There is no automated CRUD, malformed-storage, or migration test coverage.

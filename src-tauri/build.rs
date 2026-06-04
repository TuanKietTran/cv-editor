fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/pdf_export.m");
        cc::Build::new()
            .file("src/pdf_export.m")
            .flag("-fobjc-arc")
            .compile("pdf_export");
    }
}

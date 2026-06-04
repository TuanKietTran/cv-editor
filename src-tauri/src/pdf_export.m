#import <WebKit/WebKit.h>
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

// Renders `html` headlessly via WKWebView and writes a PDF to `path`.
// Must be called on the main thread.
// Returns 0 on success, -1 on failure.
int html_to_pdf(const char *html_cstr, const char *path_cstr) {
    @autoreleasepool {
        NSString *html = [NSString stringWithUTF8String:html_cstr];
        NSString *path = [NSString stringWithUTF8String:path_cstr];

        // A4 at 96 dpi (794 × 1123 px)
        WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
        WKWebView *wv = [[WKWebView alloc]
            initWithFrame:NSMakeRect(0, 0, 794, 1123)
            configuration:config];

        // Load the HTML string (no base URL — all resources must be inline or absolute)
        [wv loadHTMLString:html baseURL:nil];

        // Spin the main run loop until loading finishes (30 s hard limit)
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:30.0];
        while (wv.isLoading && [deadline timeIntervalSinceNow] > 0) {
            [[NSRunLoop currentRunLoop]
                runMode:NSDefaultRunLoopMode
             beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }

        // Extra settle time for web fonts and late-firing CSS transitions
        [[NSRunLoop currentRunLoop]
            runMode:NSDefaultRunLoopMode
         beforeDate:[NSDate dateWithTimeIntervalSinceNow:1.5]];

        if (@available(macOS 11.0, *)) {
            // ── WKWebView.createPDF — headless, no print dialog ───────────
            __block int rc = -1;
            dispatch_semaphore_t sem = dispatch_semaphore_create(0);

            WKPDFConfiguration *pdfCfg = [[WKPDFConfiguration alloc] init];
            [wv createPDFWithConfiguration:pdfCfg
                         completionHandler:^(NSData *data, NSError *__unused err) {
                if (data && [data writeToFile:path atomically:YES]) {
                    rc = 0;
                }
                dispatch_semaphore_signal(sem);
            }];

            // Drain the run loop while waiting for the async completion handler
            while (dispatch_semaphore_wait(sem, DISPATCH_TIME_NOW) != 0) {
                [[NSRunLoop currentRunLoop]
                    runMode:NSDefaultRunLoopMode
                 beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
            }
            return rc;

        } else {
            // ── Fallback (macOS < 11): NSPrintOperation saves via PDF pipeline
            NSPrintInfo *pi = [[NSPrintInfo sharedPrintInfo] copy];
            pi.jobDisposition = NSPrintSaveJob;
            NSURL *fileURL = [NSURL fileURLWithPath:path];
            [[pi dictionary] setObject:fileURL forKey:@"NSPrintJobSavingURL"];

            NSPrintOperation *op = [wv printOperationWithPrintInfo:pi];
            op.showsPrintPanel    = NO;
            op.showsProgressPanel = NO;
            return [op runOperation] ? 0 : -1;
        }
    }
}

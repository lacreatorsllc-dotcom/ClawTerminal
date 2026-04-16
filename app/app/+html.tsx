import { ScrollViewStyleReset } from 'expo-router/html'

// This file is web-only. It injects into the <html> template.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{
          __html: `
            window.onerror = function(msg, src, line, col, err) {
              document.body.innerHTML = '<div style="background:#0e0e0c;color:#ff6b6b;padding:24px;font-family:monospace;font-size:13px;white-space:pre-wrap;position:fixed;inset:0;overflow:auto;z-index:9999">' +
                '<b style="color:#ff9f43">SLUGS app error</b>\\n\\n' + msg + '\\n\\nSource: ' + src + ':' + line + '\\n\\n' + (err && err.stack || '') + '</div>';
            };
            window.addEventListener('unhandledrejection', function(e) {
              document.body.innerHTML = '<div style="background:#0e0e0c;color:#ff6b6b;padding:24px;font-family:monospace;font-size:13px;white-space:pre-wrap;position:fixed;inset:0;overflow:auto;z-index:9999">' +
                '<b style="color:#ff9f43">SLUGS unhandled promise rejection</b>\\n\\n' + (e.reason && e.reason.stack || e.reason || e) + '</div>';
            });
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

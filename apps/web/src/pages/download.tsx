import { Link } from 'react-router';
import { Download, ShieldCheck, Smartphone, Store } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Public on purpose.
 *
 * A new cashier cannot sign in until the app is on their phone, so putting this
 * behind the login wall would be a circular dependency. Nothing here is
 * sensitive: the APK is an unprivileged client that still has to authenticate
 * against the API before it shows a single number.
 */

/** Served straight out of apps/web/public — see the README beside it. */
const APK_PATH = '/shop-suite.apk';

const STEPS = [
  {
    title: 'Download the file',
    body: 'Tap the button above on the phone itself, not on a desktop. Chrome will warn that this kind of file can harm your device — that warning appears for every app installed outside the Play Store. Choose Download anyway.',
  },
  {
    title: 'Allow installs from Chrome',
    body: 'Open the downloaded file. Android will say Chrome is not allowed to install unknown apps. Tap Settings, turn on Allow from this source, then press back.',
  },
  {
    title: 'Install and sign in',
    body: 'Tap Install, then Open. Sign in with the email and password your administrator gave you — the same ones that work on this website.',
  },
];

export function DownloadPage() {
  return (
    <div className="min-h-screen bg-muted px-6 py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Shop Suite</h1>
            <p className="text-xs text-muted-foreground">Sales &amp; Inventory Management</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold">Shop Suite for Android</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The till app for billing and stock at the counter. Works on Android 8 and newer.
              </p>
            </div>
          </div>

          {/* A plain anchor, not a click handler: the browser's own download
              manager handles resume and progress far better than we would, and
              it keeps working when JavaScript does not. */}
          <a href={APK_PATH} download className={cn(buttonVariants(), 'mt-5 w-full')}>
            <Download className="mr-2 h-4 w-4" />
            Download APK
          </a>

          <ol className="mt-6 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-start gap-2 rounded-lg bg-muted p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Only ever install this from your own company&rsquo;s address. An APK sent over
              WhatsApp or email can be tampered with; one downloaded from here over HTTPS cannot.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prefer the browser?{' '}
          <Link to="/login" className="underline underline-offset-2">
            Sign in here instead
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

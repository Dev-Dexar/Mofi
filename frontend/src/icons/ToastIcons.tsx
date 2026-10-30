import type { ReactNode, SVGProps } from 'react'
import CopyIcon from './CopyIcon'
import WalletIcon from './WalletIcon'
import AdminIcon from './AdminIcon'
import AppealIcon from './AppealIcon'
import ReactivateIcon from './ReactivateIcon'
import ReinvestIcon from './ReinvestIcon'

export type ToastIconName =
  | 'success'
  | 'error'
  | 'info'
  | 'code-sent'
  | 'password-updated'
  | 'copied'
  | 'wallet'
  | 'too-fast'
  | 'suspended'
  | 'reactivated'
  | 'admin-added'
  | 'admin-removed'
  | 'appeal-rejected'
  | 'reinvest'

const base: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

/** Icons for the toasts. Most share one 24px grid with a 1.75 stroke. */
export const TOAST_ICONS: Record<ToastIconName, ReactNode> = {
  // the reinvest coin: green on a success toast (auto-reinvest on), red on an error toast (it is off)
  reinvest: <ReinvestIcon className="size-5" />,
  success: (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.5 2.5 4.5-5" />
    </svg>
  ),
  error: (
    <svg {...base}>
      <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.9v.1" />
    </svg>
  ),
  info: (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.9v.1" />
    </svg>
  ),
  // An envelope with a tick: the code is on its way
  'code-sent': (
    <svg {...base}>
      <path d="M20.5 11.5V7a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h8" />
      <path d="m3.5 7.5 7.6 5a1.7 1.7 0 0 0 1.8 0l7.6-5" />
      <path d="m16.2 18 1.8 1.8 3.2-3.6" />
    </svg>
  ),
  // A clock with a speed trace behind it: asked too many times, too quickly (filled; the view is cropped to the drawing (x 71 to 185, y 89 to 166 of its original 256 canvas), centred, with a unit to spare)
  'too-fast': (
    <svg width={26} height={26} viewBox="70 70 116 116" fill="currentColor" aria-hidden="true">
      <path d="M139 90c-11.4 2.4-21.8 10.7-27.3 22-2.9 5.9-3.2 7.3-3.2 16 0 8.8.3 10.1 3.3 16.2 4.2 8.5 12.9 16.8 20.9 19.9 8 3 19.6 3 27.6 0 15.1-5.9 24.7-19.8 24.7-36.1 0-20.5-15-36.6-35.6-38.4-3.3-.3-7.9-.1-10.4.4m10.8 19.2c.7.7 1.2 4.3 1.2 9.3v8.1l4.5 4.4c4.6 4.5 5.4 6.7 3.3 8.8-2.2 2.2-4.2 1.3-10-4.5l-5.8-5.7V120c0-9.8.7-12 4-12 .9 0 2.1.5 2.8 1.2m-62.1-5.5c-1.1 1.1-.8 4.8.5 6.1 1.5 1.5 15.2 1.6 17.9.2 2.1-1.2 2.5-4 .7-5.8-1.3-1.3-17.9-1.7-19.1-.5m-15.5 21.5c-.7.7-1.2 1.9-1.2 2.8 0 3.5 2.1 4 16.2 4 12.7 0 13.8-.1 14.8-2 .8-1.4.8-2.6 0-4-1-1.9-2.1-2-14.8-2-9.4 0-14.2.4-15 1.2M88 146.4c-.6.8-1 2.5-.8 3.8.3 2.2.8 2.3 9.1 2.6 9.3.3 11.7-.5 11.7-3.9 0-2.8-3.2-3.9-11.3-3.9-5.3 0-7.8.4-8.7 1.4" />
    </svg>
  ),
  // The admin panel's own: an account locked or let back in, someone made an admin or demoted, an appeal turned down. They take the
  // toast's tone: red for the ones that take something away, green for lifting, gold for a new admin.
  suspended: (
    <svg {...base}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <path d="M12 14.6v1.9" />
    </svg>
  ),
  reactivated: <ReactivateIcon className="size-5" />,
  'admin-added': <AdminIcon className="size-5" />,
  'admin-removed': <AdminIcon className="size-5" />,
  'appeal-rejected': <AppealIcon className="size-5" />,
  // The wallet, for money moving. Shown in plain text colour, not the toast's tone.
  wallet: <WalletIcon className="size-5" />,
  // The copy button's own icon, which takes the toast's green
  copied: <CopyIcon className="size-5" />,
  // A padlock inside a refresh loop: the password has been replaced. Filled artwork, cropped to its own bounds.
  'password-updated': (
    <svg width={24} height={24} viewBox="52 42 152 152" fill="currentColor" aria-hidden="true">
      <path d="M106 65.5c-1.2 1.5-.5 5.5 1.1 5.5 2.4 0 .4 1.9-4.1 3.9-20.3 9.2-33.4 30-33.4 53.1 0 22.1 11.9 41.9 31.2 51.8 13 6.7 21.2 7.7 21.2 2.6 0-2.6-.4-2.9-10.5-6-11.6-3.7-23.3-13.6-29-24.9-7.4-14.8-7.4-32.3.1-47.1 5.1-10 17.5-21.3 26.2-23.9 2.2-.6 2.3-.5 1.2 1.5-.9 1.6-.9 2.5.1 3.6 2.2 2.7 5.2 1.1 8.6-4.6 4.7-7.8 4.4-9.1-2.8-13.4-6.7-4-8.1-4.3-9.9-2.1m28.7 5.2c-.4.3-.7 1.7-.7 2.9 0 2.6 1.8 3.8 6.8 4.8 5.6 1 15.4 6.2 20.8 11 19.1 16.8 23 45.9 9 66.9-5.6 8.5-16 17-23.4 19.2-2.2.6-2.3.5-1.2-1.5.9-1.6.9-2.5-.1-3.6-2.2-2.7-5.2-1.1-8.6 4.6-4.7 7.8-4.4 9.1 2.8 13.4 6.7 4 8.1 4.3 9.9 2.1 1.2-1.5.5-5.5-1.1-5.5-2.4 0-.4-1.9 4.1-3.9 14.8-6.7 26.5-20.6 31.6-37.7 2.4-7.9 2.4-22.8 0-30.9C180 97 169.3 83.6 156 76.6c-9.5-5-19.5-7.8-21.3-5.9" />
      <path d="M117.9 94c-7.6 4-12.8 12.4-12.9 20.5 0 1.9-1 3.9-2.5 5.3-3.2 3.1-3.7 6.4-3.3 22.1l.3 13.3 3.3 2.9 3.3 3 22.5-.3 22.4-.3 2.7-2.8c2.7-2.7 2.8-3.1 3.1-15.9.4-15.6-.1-18.9-3.3-22-1.6-1.5-2.5-3.4-2.5-5.4 0-8-5.6-16.5-13.2-20.5-5-2.6-15-2.5-19.9.1m17.1 6.9c4.7 2.5 8 7.5 8 12.2v3.9h-30v-3.9c0-7.2 7.3-14.1 15-14.1 1.9 0 5.1.8 7 1.9m-4.1 33.5c.7.8 1.1 3.1.9 5.2-.6 7.2-7 7.2-7.6 0-.4-4.1 1.1-6.6 3.8-6.6 1 0 2.3.6 2.9 1.4" />
    </svg>
  ),
}

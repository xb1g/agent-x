import type { ReactNode } from 'react'

import './globals.css'

export const metadata = {
  title: 'Customer Discovery Board',
  description:
    'Research ICP pain signals, build a composite persona, and keep the interview alive across sessions.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

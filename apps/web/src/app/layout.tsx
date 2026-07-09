import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '../components/shell'
import { ToastProvider } from '../components/toast/toast-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aether',
  description: 'A multi-agent gateway. Foundation build.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>
          <ToastProvider>{children}</ToastProvider>
        </Shell>
      </body>
    </html>
  )
}

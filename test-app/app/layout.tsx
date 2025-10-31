import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'WhopCtl Test App',
  description: 'Test app for whopctl deployment',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


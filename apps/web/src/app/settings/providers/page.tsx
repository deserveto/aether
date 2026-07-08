import type { Metadata } from 'next'
import { ProviderSettings } from '../../../features/providers'

export const metadata: Metadata = {
  title: 'Provider registry · Aether',
  description: 'Manage provider connections, model profiles, and agent model routing.',
}

export default function ProviderSettingsPage() {
  return <ProviderSettings />
}

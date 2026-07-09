import type { Metadata } from 'next'
import { AgentBuilderDashboard } from '../../features/builder'

export const metadata: Metadata = {
  title: 'Agent Builder · Aether',
  description: 'Create and configure custom database-backed agents.',
}

export default function BuilderPage() {
  return <AgentBuilderDashboard />
}

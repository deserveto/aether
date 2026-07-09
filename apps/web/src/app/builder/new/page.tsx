import type { Metadata } from 'next'
import { AgentForm } from '../../../features/builder/components/AgentForm'

export const metadata: Metadata = {
  title: 'New Agent · Aether',
  description: 'Create a new custom database-backed agent.',
}

export default function NewAgentPage() {
  return <AgentForm />
}

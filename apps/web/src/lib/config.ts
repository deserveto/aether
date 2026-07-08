import { env } from '../env.js'

export interface PublicConfig {
  readonly agentServerUrl: string
}

export const publicConfig: PublicConfig = Object.freeze({
  agentServerUrl: env.NEXT_PUBLIC_AGENT_SERVER_URL,
})

import { NEXT_PUBLIC_AGENT_SERVER_URL } from '../env'

export interface PublicConfig {
  readonly agentServerUrl: string
}

export const publicConfig: PublicConfig = Object.freeze({
  agentServerUrl: NEXT_PUBLIC_AGENT_SERVER_URL,
})

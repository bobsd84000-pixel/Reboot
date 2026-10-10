export type AgentLigne = { id: string; description: string; type: string; status: string }
export type Notes = { aujourdhui: number; total: number } | null

declare module 'claude-code' {
  interface PluginState {
    'tableau-de-bord': { agents: AgentLigne[]; taches: number; notes: Notes; maj: number }
  }
}

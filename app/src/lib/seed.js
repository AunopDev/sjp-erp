import { defaultConfig, ENT } from './schema.js'
import { newPlatform } from '../platform/core.js'
import { bootstrapPlatform } from '../platform/lifecycle.js'

export const SCHEMA_VERSION = 5

export function buildSeed() {
  const initialConfig = defaultConfig()
  const { confirmations, ...config } = initialConfig
  const data = Object.fromEntries(Object.keys(ENT).map(entity => [entity, []]))

  return {
    schema: SCHEMA_VERSION,
    session: null,
    users: [],
    config,
    configVersions: [],
    confirmations,
    data,
    audit: [],
    approvals: [],
    counters: {},
    processed: {},
    // metadata-driven module platform (companies, installed modules, their data, audit, events)
    platform: bootstrapPlatform(newPlatform())
  }
}

import { createRequire } from 'node:module'

// Keep the VM fixtures in CommonJS without suppressing TypeScript checking.
createRequire(import.meta.url)('./pipeline-follow-up.cjs')

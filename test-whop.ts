import { homedir } from 'node:os'
import { join } from 'node:path'
import { Whop } from '@whoplabs/whop-client'

const sessionPath = join(homedir(), '.whoplabs', 'whop-session.json')
const whop = new Whop({ sessionPath, autoLoad: true })

console.log('isAuthenticated:', whop.isAuthenticated())
console.log('getTokens:', JSON.stringify(whop.getTokens(), null, 2))
console.log('getSession:', JSON.stringify(whop.getSession(), null, 2))

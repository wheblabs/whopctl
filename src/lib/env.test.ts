import { describe, expect, test } from 'bun:test'
import { parseEnvContent, readEnvFileSafe } from './env.ts'

describe('parseEnvContent', () => {
	test('parses simple key-value pairs', () => {
		const content = 'KEY=value'
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY: 'value' })
	})

	test('handles double-quoted values', () => {
		const content = 'KEY="quoted value"'
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY: 'quoted value' })
	})

	test('handles single-quoted values', () => {
		const content = "KEY='quoted value'"
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY: 'quoted value' })
	})

	test('handles values with equals signs', () => {
		const content = 'DATABASE_URL=postgres://user:pass@host/db?sslmode=require'
		const result = parseEnvContent(content)
		expect(result).toEqual({
			DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
		})
	})

	test('skips empty lines', () => {
		const content = `KEY1=value1

KEY2=value2`
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' })
	})

	test('skips comment lines', () => {
		const content = `# This is a comment
KEY=value
# Another comment`
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY: 'value' })
	})

	test('handles whitespace around keys and values', () => {
		const content = '  KEY  =  value  '
		const result = parseEnvContent(content)
		expect(result).toEqual({ KEY: 'value' })
	})

	test('parses multiple lines correctly', () => {
		const content = `NEXT_PUBLIC_WHOP_APP_ID=app_abc123
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_xyz789
SECRET_KEY="super-secret"
DATABASE_URL=postgres://localhost/db`
		const result = parseEnvContent(content)
		expect(result).toEqual({
			NEXT_PUBLIC_WHOP_APP_ID: 'app_abc123',
			NEXT_PUBLIC_WHOP_COMPANY_ID: 'biz_xyz789',
			SECRET_KEY: 'super-secret',
			DATABASE_URL: 'postgres://localhost/db',
		})
	})

	test('handles empty content', () => {
		const result = parseEnvContent('')
		expect(result).toEqual({})
	})

	test('handles content with only comments', () => {
		const content = `# Comment 1
# Comment 2`
		const result = parseEnvContent(content)
		expect(result).toEqual({})
	})
})

describe('readEnvFileSafe', () => {
	test('returns empty object for non-existent directory', async () => {
		const result = await readEnvFileSafe('/non/existent/path')
		expect(result).toEqual({})
	})
})


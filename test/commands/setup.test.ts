import {expect} from 'chai'
import {runCommand} from '@oclif/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {readGlobalConfig, readGlobalSecrets, writeGlobalConfig, writeGlobalSecrets} from '../../src/config/global-store.js'
import {loadPolypotRuntimeConfig} from '../../src/config/loader.js'
import {
  buildSetupConfig,
  collectSetupAnswers,
  parseTargetLanguages,
  setSetupPromptAdapterForTests,
  type SetupPromptAdapter,
} from '../../src/setup/prompts.js'

async function withTempConfigHome<T>(fn: (configHome: string) => Promise<T>): Promise<T> {
  const previous = process.env['XDG_CONFIG_HOME']
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'polypot-setup-home-'))
  process.env['XDG_CONFIG_HOME'] = configHome
  try {
    return await fn(configHome)
  } finally {
    setSetupPromptAdapterForTests(undefined)
    if (previous === undefined) {
      delete process.env['XDG_CONFIG_HOME']
    } else {
      process.env['XDG_CONFIG_HOME'] = previous
    }
  }
}

function adapterFromAnswers(answers: {readonly confirms: boolean[]; readonly inputs: string[]; readonly passwords: string[]}): SetupPromptAdapter {
  return {
    confirm: async () => {
      const next = answers.confirms.shift()
      if (next === undefined) throw new Error('missing confirm answer')
      return next
    },
    input: async (options) => {
      const next = answers.inputs.shift()
      if (next === undefined) throw new Error('missing input answer')
      const validation = options.validate?.(next)
      if (validation !== undefined && validation !== true) throw new Error(String(validation))
      return next
    },
    password: async (options) => {
      const next = answers.passwords.shift()
      if (next === undefined) throw new Error('missing password answer')
      const validation = options.validate?.(next)
      if (validation !== undefined && validation !== true) throw new Error(String(validation))
      return next
    },
  }
}

describe('polypot setup', () => {
  it('lists its own flags and does not inherit translate-only config flags', async () => {
    const {stdout} = await runCommand(['setup', '--help'])
    expect(stdout).to.include('--force')
    expect(stdout).to.include('--show')
    expect(stdout).to.include('--non-interactive')
    expect(stdout).to.not.include('--no-config')
    expect(stdout).to.not.include('--no-env')
  })

  it('--show prints the resolved global config path and exits 0', async () => {
    await withTempConfigHome(async () => {
      const {stdout, error} = await runCommand(['setup', '--show'])
      expect(error).to.equal(undefined)
      expect(stdout).to.include('global config:')
      expect(stdout).to.include('config.yaml')
      expect(stdout).to.include('OPENAI_API_KEY: missing')
    })
  })

  it('--show prints non-secret config contents and secret presence', async () => {
    await withTempConfigHome(async (configHome) => {
      const configDir = path.join(configHome, 'polypot')
      await writeGlobalConfig({
        configDir,
        cwd: process.cwd(),
        config: {
          provider: {provider: 'openai', model: 'custom-model', temperature: 0.1},
        },
      })
      await writeGlobalSecrets({configDir, cwd: process.cwd(), secrets: {openaiApiKey: 'sk-test-secret'}})

      const {stdout, error} = await runCommand(['setup', '--show'])

      expect(error).to.equal(undefined)
      expect(stdout).to.include('OPENAI_API_KEY: present')
      expect(stdout).to.include('custom-model')
      expect(stdout).to.not.include('sk-test-secret')
    })
  })

  it('--non-interactive errors without writing setup files', async () => {
    await withTempConfigHome(async (configHome) => {
      const {error} = await runCommand(['setup', '--non-interactive'])
      expect(error).to.not.equal(undefined)
      const files = await fs.readdir(configHome)
      expect(files).to.deep.equal([])
    })
  })

  it('runs the essentials wizard through the command and writes readable config and secrets', async () => {
    await withTempConfigHome(async (configHome) => {
      setSetupPromptAdapterForTests(adapterFromAnswers({
        confirms: [true, false],
        passwords: ['sk-command-secret'],
        inputs: ['gpt-4.1-mini', '0.2', 'en', 'fr_FR, es_ES'],
      }))

      const {stdout, error} = await runCommand(['setup'])
      const configDir = path.join(configHome, 'polypot')
      const runtime = await loadPolypotRuntimeConfig({configDir, cwd: process.cwd(), options: {}})

      expect(error).to.equal(undefined)
      expect(stdout).to.include('Global Polypot setup saved.')
      expect(stdout).to.include('OPENAI_API_KEY: present')
      expect(stdout).to.not.include('sk-command-secret')
      expect(runtime.config.provider.temperature).to.equal(0.2)
      expect(runtime.config.source.targetLanguages).to.deep.equal(['fr_FR', 'es_ES'])
      expect(runtime.secrets.openaiApiKey).to.equal('sk-command-secret')
    })
  })

  it('leaves existing files unchanged when the overwrite prompt is declined', async () => {
    await withTempConfigHome(async (configHome) => {
      const configDir = path.join(configHome, 'polypot')
      await writeGlobalConfig({
        configDir,
        cwd: process.cwd(),
        config: {provider: {provider: 'openai', model: 'existing-model', temperature: 0.4}},
      })
      await writeGlobalSecrets({configDir, cwd: process.cwd(), secrets: {openaiApiKey: 'sk-existing-secret'}})
      const beforeConfig = await fs.readFile(path.join(configDir, 'config.yaml'), 'utf8')
      const beforeEnv = await fs.readFile(path.join(configDir, '.env'), 'utf8')

      setSetupPromptAdapterForTests(adapterFromAnswers({
        confirms: [false],
        passwords: [],
        inputs: [],
      }))

      const {stdout, error} = await runCommand(['setup'])

      expect(error).to.equal(undefined)
      expect(stdout).to.include('Setup cancelled.')
      expect(await fs.readFile(path.join(configDir, 'config.yaml'), 'utf8')).to.equal(beforeConfig)
      expect(await fs.readFile(path.join(configDir, '.env'), 'utf8')).to.equal(beforeEnv)
    })
  })

  it('--force updates existing config without asking for overwrite confirmation', async () => {
    await withTempConfigHome(async (configHome) => {
      const configDir = path.join(configHome, 'polypot')
      await writeGlobalConfig({
        configDir,
        cwd: process.cwd(),
        config: {provider: {provider: 'openai', model: 'old-model', temperature: 0.4}},
      })
      await writeGlobalSecrets({configDir, cwd: process.cwd(), secrets: {openaiApiKey: 'sk-existing-secret'}})

      setSetupPromptAdapterForTests(adapterFromAnswers({
        confirms: [true],
        passwords: [],
        inputs: ['new-model', '0.1', 'en', 'de_DE'],
      }))

      const {error} = await runCommand(['setup', '--force'])
      const config = await readGlobalConfig({configDir, cwd: process.cwd()})
      const secrets = await readGlobalSecrets({configDir, cwd: process.cwd()})

      expect(error).to.equal(undefined)
      expect(config.provider.model).to.equal('new-model')
      expect(config.provider.temperature).to.equal(0.1)
      expect(config.source.targetLanguages).to.deep.equal(['de_DE'])
      expect(secrets.openaiApiKey).to.equal('sk-existing-secret')
    })
  })

  it('--force can replace malformed global YAML using defaults', async () => {
    await withTempConfigHome(async (configHome) => {
      const configDir = path.join(configHome, 'polypot')
      await fs.mkdir(configDir, {recursive: true})
      await fs.writeFile(path.join(configDir, 'config.yaml'), 'provider: [')

      setSetupPromptAdapterForTests(adapterFromAnswers({
        confirms: [false],
        passwords: [],
        inputs: ['fresh-model', '0.3', 'en', 'it_IT'],
      }))

      const {error} = await runCommand(['setup', '--force'])
      const config = await readGlobalConfig({configDir, cwd: process.cwd()})

      expect(error).to.equal(undefined)
      expect(config.provider.model).to.equal('fresh-model')
      expect(config.provider.temperature).to.equal(0.3)
      expect(config.source.targetLanguages).to.deep.equal(['it_IT'])
    })
  })

  it('collects essentials and writes the resulting global config and secret shape', async () => {
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'polypot-setup-write-'))
    const existingConfig = await readGlobalConfig({configDir, cwd: process.cwd()})
    const existingSecrets = await readGlobalSecrets({configDir, cwd: process.cwd()})
    const answers = await collectSetupAnswers(existingConfig, existingSecrets, adapterFromAnswers({
      confirms: [true, false],
      passwords: ['sk-test-secret'],
      inputs: ['gpt-4.1-mini', '0.2', 'en', 'fr_FR, es_ES'],
    }))

    await fs.mkdir(configDir, {recursive: true})
    const nextConfig = buildSetupConfig(existingConfig, answers)
    await writeGlobalConfig({configDir, cwd: process.cwd(), config: nextConfig})
    if (answers.openaiApiKey === undefined) throw new Error('expected setup answers to include an OpenAI API key')
    expect(answers.openaiApiKey).to.equal('sk-test-secret')
    await writeGlobalSecrets({configDir, cwd: process.cwd(), secrets: {openaiApiKey: answers.openaiApiKey}})

    const config = await readGlobalConfig({configDir, cwd: process.cwd()})
    const secrets = await readGlobalSecrets({configDir, cwd: process.cwd()})

    expect(config.provider.temperature).to.equal(0.2)
    expect(config.source.targetLanguages).to.deep.equal(['fr_FR', 'es_ES'])
    expect(secrets.openaiApiKey).to.equal('sk-test-secret')
  })

  it('parses comma-separated target languages', () => {
    expect(parseTargetLanguages('fr_FR, es_ES,, de_DE ')).to.deep.equal(['fr_FR', 'es_ES', 'de_DE'])
  })
})

import {expect} from 'chai'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {loadPolypotConfig, loadPolypotRuntimeConfig} from '../../src/config/loader.js'
import {resolveConfigPaths} from '../../src/config/paths.js'
import {DEFAULT_OPENAI_MODEL} from '../../src/config/schema.js'

async function tempConfigDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'polypot-loader-'))
}

describe('loadPolypotConfig', () => {
  it('returns a valid PolypotConfig with defaults', async () => {
    const config = await loadPolypotConfig({configDir: '/tmp/x', cwd: '/tmp/y', options: {}})
    expect(config.provider.provider).to.equal('openai')
    expect(config.performance.batchSize).to.equal(20)
  })

  it('loads global YAML into app config without exposing secrets', async () => {
    const configDir = await tempConfigDir()
    await fs.writeFile(path.join(configDir, 'config.yaml'), 'provider:\n  model: custom-model\n')
    await fs.writeFile(path.join(configDir, '.env'), 'OPENAI_API_KEY=sk-test-secret\n')

    const runtime = await loadPolypotRuntimeConfig({configDir, cwd: configDir, options: {}})

    expect(runtime.config.provider.model).to.equal('custom-model')
    expect(JSON.stringify(runtime.config)).to.not.include('sk-test-secret')
    expect(runtime.secrets.openaiApiKey).to.equal('sk-test-secret')
  })

  it('honors noConfig and noEnv independently for global files', async () => {
    const configDir = await tempConfigDir()
    await fs.writeFile(path.join(configDir, 'config.yaml'), 'provider:\n  model: custom-model\n')
    await fs.writeFile(path.join(configDir, '.env'), 'OPENAI_API_KEY=sk-test-secret\n')

    const withoutConfig = await loadPolypotRuntimeConfig({configDir, cwd: configDir, options: {noConfig: true}})
    const withoutEnv = await loadPolypotRuntimeConfig({configDir, cwd: configDir, options: {noEnv: true}})

    expect(withoutConfig.config.provider.model).to.equal(DEFAULT_OPENAI_MODEL)
    expect(withoutConfig.secrets.openaiApiKey).to.equal('sk-test-secret')
    expect(withoutEnv.config.provider.model).to.equal('custom-model')
    expect(withoutEnv.secrets.hasOpenaiApiKey).to.equal(false)
  })

  it('uses an explicit configPath instead of discovered global YAML', async () => {
    const configDir = await tempConfigDir()
    const explicitConfigPath = path.join(configDir, 'explicit.yaml')
    await fs.writeFile(path.join(configDir, 'config.yaml'), 'provider: [')
    await fs.writeFile(explicitConfigPath, 'provider:\n  model: explicit-model\n')

    const runtime = await loadPolypotRuntimeConfig({
      configDir,
      cwd: configDir,
      options: {configPath: explicitConfigPath},
    })

    expect(runtime.config.provider.model).to.equal('explicit-model')
  })
})

describe('resolveConfigPaths', () => {
  it('returns the four expected paths with .polypot/ prefix on project paths', () => {
    const paths = resolveConfigPaths({configDir: '/cfg', cwd: '/proj'})
    expect(paths.globalYaml).to.equal('/cfg/config.yaml')
    expect(paths.globalEnv).to.equal('/cfg/.env')
    expect(paths.projectYaml).to.equal('/proj/.polypot/config.yaml')
    expect(paths.projectEnv).to.equal('/proj/.polypot/.env')
  })
})

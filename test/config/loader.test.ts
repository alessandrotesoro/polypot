import {expect} from 'chai'
import {loadPolypotConfig, resolveConfigPaths} from '../../src/config/loader.js'

describe('loader (Phase 1 stub)', () => {
  it('returns a valid PolypotConfig with defaults regardless of inputs', async () => {
    const config = await loadPolypotConfig({configDir: '/tmp/x', cwd: '/tmp/y', options: {}})
    expect(config.provider.provider).to.equal('openai')
    expect(config.performance.batchSize).to.equal(20)
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

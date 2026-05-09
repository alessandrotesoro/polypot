import {expect} from 'chai'
import {loadPolypotConfig} from '../../src/config/loader.js'
import {resolveConfigPaths} from '../../src/config/paths.js'

describe('loadPolypotConfig', () => {
  it('returns a valid PolypotConfig with defaults', async () => {
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

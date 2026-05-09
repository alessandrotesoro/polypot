import {expect} from 'chai'
import {Config} from '@oclif/core'
import {BaseCommand} from '../src/base-command.js'

class Probe extends BaseCommand<typeof Probe> {
  static override flags = {}
  async run(): Promise<void> {
    // no-op
  }
}

describe('BaseCommand', () => {
  it('populates this.appConfig with defaults after init()', async () => {
    const config = await Config.load(process.cwd())
    const probe = new Probe([], config)
    await probe.init()
    expect((probe as any).appConfig.provider.provider).to.equal('openai')
    expect((probe as any).appConfig.performance.batchSize).to.equal(20)
  })

  it('declares no static baseFlags (regression guard for D8)', () => {
    expect((BaseCommand as any).baseFlags).to.equal(undefined)
  })
})

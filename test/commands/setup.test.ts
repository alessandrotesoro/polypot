import {expect} from 'chai'
import {runCommand} from '@oclif/test'

describe('polypot setup', () => {
  it('lists --force, --show, --non-interactive in --help (no inherited config flags)', async () => {
    const {stdout} = await runCommand(['setup', '--help'])
    expect(stdout).to.include('--force')
    expect(stdout).to.include('--show')
    expect(stdout).to.include('--non-interactive')
    expect(stdout).to.not.include('--no-config')
    expect(stdout).to.not.include('--no-env')
  })

  it('--show prints the resolved path stub and exits 0', async () => {
    const {stdout, error} = await runCommand(['setup', '--show'])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('global config path:')
  })

  it('default invocation prints the wizard stub message and exits 0', async () => {
    const {stdout, error} = await runCommand(['setup'])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('[stub] interactive setup wizard ships in Phase 2.')
  })
})

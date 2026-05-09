import {expect} from 'chai'
import {runCommand} from '@oclif/test'

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
    const {stdout, error} = await runCommand(['setup', '--show'])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('global config:')
    expect(stdout).to.include('config.yaml')
  })

  it('default invocation prints the stub marker and exits 0', async () => {
    const {stdout, error} = await runCommand(['setup'])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('[stub]')
  })
})

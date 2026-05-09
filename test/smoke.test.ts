import {expect} from 'chai'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {runCommand} from '@oclif/test'

const BIN = path.resolve('bin/run.js')

describe('smoke', () => {
  it('the real bin/run.js binary executes and lists all three commands', () => {
    const result = spawnSync('node', [BIN, '--help'], {encoding: 'utf8', timeout: 30_000})
    expect(result.status, 'exit code').to.equal(0)
    expect(result.stdout).to.include('setup')
    expect(result.stdout).to.include('init')
    expect(result.stdout).to.include('translate')
  })

  it('--version prints a valid version string', async () => {
    const {stdout, error} = await runCommand(['--version'])
    expect(error).to.equal(undefined)
    expect(stdout).to.match(/polypot\/\d+\.\d+\.\d+/)
  })

  it('each command resolves its own --help with no command-load warnings', async () => {
    for (const cmd of ['setup', 'init', 'translate']) {
      const {stdout, stderr, error} = await runCommand([cmd, '--help'])
      expect(error, `${cmd} --help error`).to.equal(undefined)
      expect(stdout).to.include(`polypot ${cmd}`)
      expect(stderr, `${cmd} --help stderr`).to.not.match(/warn|fail|error/i)
    }
  })
})

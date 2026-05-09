import {expect} from 'chai'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

const BIN = path.resolve('bin/run.js')

function runBin(...args: string[]): {stdout: string; stderr: string; status: number | null} {
  const result = spawnSync('node', [BIN, ...args], {encoding: 'utf8', timeout: 30000})
  return {stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status}
}

describe('smoke (real bin invocation)', () => {
  it('./bin/run.js --help exits 0 and lists setup, init, translate', () => {
    const {stdout, status} = runBin('--help')
    expect(status, '--help exit code').to.equal(0)
    expect(stdout).to.include('setup')
    expect(stdout).to.include('init')
    expect(stdout).to.include('translate')
  })

  it('./bin/run.js --version exits 0 and prints a version string', () => {
    const {stdout, status} = runBin('--version')
    expect(status).to.equal(0)
    expect(stdout).to.match(/polypot\/\d+\.\d+\.\d+/)
  })

  it('each command resolves its own --help with no command-load warnings', () => {
    for (const cmd of ['setup', 'init', 'translate']) {
      const {stdout, stderr, status} = runBin(cmd, '--help')
      expect(status, `${cmd} --help exit code`).to.equal(0)
      expect(stdout).to.include(`polypot ${cmd}`)
      expect(stderr, `${cmd} --help stderr`).to.not.match(/warn|fail|error/i)
    }
  })
})

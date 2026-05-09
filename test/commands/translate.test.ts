import {expect} from 'chai'
import {runCommand} from '@oclif/test'

const EXPECTED_FLAGS = [
  // Provider
  '--provider', '--api-key', '--model', '--temperature', '--max-tokens', '--source-language',
  // Source
  '--target-languages', '--pot-file-path', '--input-po-path',
  // Output
  '--output-dir', '--output-format', '--output-file', '--po-file-prefix', '--locale-format',
  // Behavior
  '--force-translate', '--use-dictionary', '--dictionary-path', '--prompt-file-path', '--po-header-template-path',
  // Performance
  '--batch-size', '--jobs', '--timeout',
  // Limits
  '--max-strings-per-job', '--max-total-strings', '--max-cost',
  // Retries
  '--max-retries', '--retry-delay', '--abort-on-failure', '--skip-language-on-failure',
  // Debug
  '--verbose-level', '--dry-run', '--save-debug-info',
  // Polypot config-discovery
  '--config', '--no-config', '--no-env',
]

describe('polypot translate', () => {
  it('lists all 30+ Potomatic-mirrored flags in --help', async () => {
    const {stdout} = await runCommand(['translate', '--help'])
    for (const flag of EXPECTED_FLAGS) {
      expect(stdout, `expected --help to list ${flag}`).to.include(flag)
    }
  })

  it('exposes the documented helpGroup labels', async () => {
    const {stdout} = await runCommand(['translate', '--help'])
    expect(stdout).to.include('PROVIDER FLAGS')
    expect(stdout).to.include('SOURCE FLAGS')
    expect(stdout).to.include('OUTPUT FLAGS')
    expect(stdout).to.include('BEHAVIOR FLAGS')
    expect(stdout).to.include('PERFORMANCE FLAGS')
    expect(stdout).to.include('LIMITS FLAGS')
    expect(stdout).to.include('RETRIES FLAGS')
    expect(stdout).to.include('DEBUG FLAGS')
    expect(stdout).to.include('CONFIG FLAGS')
  })

  it('parses comma-separated --target-languages and short flags', async () => {
    const {stdout, error} = await runCommand([
      'translate', '-l', 'fr_FR,es_ES', '-p', 'foo.pot', '-b', '30', '-j', '3', '-v', '2', '--dry-run',
    ])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('"target-languages"')
    expect(stdout).to.include('fr_FR')
    expect(stdout).to.include('es_ES')
    expect(stdout).to.include('"batch-size": 30')
    expect(stdout).to.include('"dry-run": true')
  })

  it('rejects an invalid --output-format enum value', async () => {
    const {error} = await runCommand(['translate', '-p', 'foo.pot', '--output-format', 'yaml'])
    expect(error).to.not.equal(undefined)
  })

  it('exposes the resolved appConfig defaults in stub output', async () => {
    const {stdout, error} = await runCommand(['translate', '-p', 'foo.pot', '--dry-run'])
    expect(error).to.equal(undefined)
    expect(stdout).to.include('[stub] translate not implemented')
    expect(stdout).to.include('"appConfig"')
    expect(stdout).to.include('"openai"')
    expect(stdout).to.include('"batchSize": 20')
  })
})

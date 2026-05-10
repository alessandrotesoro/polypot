import {expect} from 'chai'
import {APIConnectionError, APIError} from 'openai'
import {validateOpenAIConnection, type OpenAIModelsClient} from '../../../src/providers/openai/connection.js'

const clientThat = (list: () => Promise<unknown>): OpenAIModelsClient => ({
  models: {list},
})

describe('validateOpenAIConnection', () => {
  it('returns success when OpenAI accepts the key', async () => {
    const result = await validateOpenAIConnection('sk-test', () => clientThat(async () => ({data: []})))

    expect(result.ok).to.equal(true)
  })

  it('rejects blank keys before calling OpenAI', async () => {
    let called = false

    const result = await validateOpenAIConnection('   ', () => {
      called = true
      return clientThat(async () => ({data: []}))
    })

    expect(result).to.deep.equal({
      ok: false,
      reason: 'missing-key',
      message: 'OpenAI API key is required to validate the connection.',
    })
    expect(called).to.equal(false)
  })

  it('returns an auth failure for rejected keys without leaking the key', async () => {
    const secret = 'sk-test-secret'
    const error = new APIError(401, {error: {message: `bad key ${secret}`}}, 'bad key', new Headers())

    const result = await validateOpenAIConnection(secret, () => clientThat(async () => {
      throw error
    }))

    expect(result.ok).to.equal(false)
    if (!result.ok) {
      expect(result.reason).to.equal('auth-failed')
      expect(result.message).to.not.include(secret)
    }
  })

  it('returns a network failure without crashing', async () => {
    const result = await validateOpenAIConnection('sk-test', () => clientThat(async () => {
      throw new APIConnectionError({message: 'socket closed'})
    }))

    expect(result.ok).to.equal(false)
    if (!result.ok) expect(result.reason).to.equal('network-error')
  })

  it('returns an unknown failure for unexpected errors without leaking the key', async () => {
    const secret = 'sk-test-secret'

    const result = await validateOpenAIConnection(secret, () => clientThat(async () => {
      throw new Error(`bad key ${secret}`)
    }))

    expect(result.ok).to.equal(false)
    if (!result.ok) {
      expect(result.reason).to.equal('unknown-error')
      expect(result.message).to.not.include(secret)
    }
  })
})

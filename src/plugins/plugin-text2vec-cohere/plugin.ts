import axios, { AxiosInstance } from 'axios'
import { PluginLifecycle } from 'src/lib/plugins-common'
import {
  TextVectorizerPlugin,
  VectorizeParams,
  VectorizeResult,
} from 'src/lib/plugins-common/text-vectorizer'
import { z } from 'zod'
import { Config, Context } from './plugin.types'

const MAX_TEXTS_PER_REQUEST = 96

type ApiRes = {
  embeddings: {
    float: number[][]
  }
}

const vectorizeOptionsSchema = z.object({
  model: z
    .enum([
      'embed-english-v3.0',
      'embed-english-light-v3.0',
      'embed-multilingual-v3.0',
      'embed-multilingual-light-v3.0',
    ])
    .optional()
    .default('embed-english-v3.0'),
})

const configSchema = z.object({
  baseURL: z.string().optional(),
  clientSecret: z.object({
    apiKey: z.string().optional(),
  }),
  options: vectorizeOptionsSchema.optional(),
})

export class CohereTextVectorizer
  implements PluginLifecycle, TextVectorizerPlugin
{
  private client: AxiosInstance
  private config: Config

  schemas: TextVectorizerPlugin['schemas'] = {
    config: configSchema,
    vectorizeOptions: vectorizeOptionsSchema,
  }

  constructor() {}

  initialize = async (config: Config) => {
    this.config = config

    this.client = axios.create({
      baseURL: this.config.baseURL || 'https://api.cohere.com/',
      headers: {
        Authorization: `Bearer ${this.config.clientSecret.apiKey}`,
      },
    })
  }

  bootstrap = async (ctx: Context) => {}

  destroy = async (ctx: Context) => {}

  vectorize = async (
    ctx: Context,
    params: VectorizeParams<Required<Config>['options']>,
  ): Promise<VectorizeResult> => {
    const model = params.options?.model || this.config.options?.model
    if (!model) throw new Error('Model not provided')

    const batches: string[][] = []

    for (let i = 0; i < params.text.length; i += MAX_TEXTS_PER_REQUEST) {
      batches.push(params.text.slice(i, i + MAX_TEXTS_PER_REQUEST))
    }

    const results: ApiRes[] = []

    for (const batch of batches) {
      const res = await this.client
        .post<ApiRes>('/v2/embed', {
          model,
          texts: batch,
          embedding_types: ['float'],
          input_type:
            params.type === 'query' ? 'search_query' : 'search_document',
          truncate: 'END',
        })
        .then((res) => res.data)

      results.push(res)
    }

    return {
      embeddings: results.flatMap((res) =>
        res.embeddings.float.map((embedding) => ({
          embedding: embedding,
        })),
      ),
      usage: {
        tokens: 0,
      },
    }
  }
}

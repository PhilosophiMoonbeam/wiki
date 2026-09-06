import type { PagePrincipal } from '../../helpers/page-access.ts'
import graphHelper from '../../helpers/graph.ts'
import analyticsOperations from '../../operations/analytics.ts'

interface ProvidersArgs {
  isEnabled?: boolean | null
}
interface UpdateProvidersArgs {
  providers: unknown
}

const optionalBoolean = (value: boolean | null | undefined): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

export default {
  Query: {
    async analytics() {
      return {}
    }
  },
  Mutation: {
    async analytics() {
      return {}
    }
  },
  AnalyticsQuery: {
    async providers(_obj: unknown, args: ProvidersArgs, context: { req: { user?: PagePrincipal } }) {
      return analyticsOperations.listProviders(optionalBoolean(args.isEnabled), context.req.user)
    }
  },
  AnalyticsMutation: {
    async updateProviders(_obj: unknown, args: UpdateProvidersArgs, context: { req: { user?: PagePrincipal } }) {
      try {
        await analyticsOperations.updateProviders(args.providers, context.req.user)
        return { responseResult: graphHelper.generateSuccess('Providers updated successfully') }
      } catch (err: unknown) {
        return graphHelper.generateError(err)
      }
    }
  }
}

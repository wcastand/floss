import { msg } from '../utils'
export const handler = ctx => (ctx.body = `${msg} from hometown`)

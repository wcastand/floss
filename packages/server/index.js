require('dotenv').config()

const fs = require('fs')
const { resolve } = require('path')

const chalk = require('chalk')
const uuid = require('uuid/v4')

const Koa = require('koa')
const proxy = require('koa-proxy')
const static = require('koa-static')
const logger = require('koa-logger')
const Router = require('koa-router')
const bodyparser = require('koa-bodyparser')

const { isPortTaken } = require('@floss/utils')

const resigsterLambda = (router, { route, name, host, method }) => {
  if (!route) throw new Error(`You need to provide a route for the lambda`)
  if (!host) throw new Error(`You need to provide at least an host the route`)
  const n = name || uuid()
  router[method.toLowerCase() || 'get'](n, route, proxy({ host }))

  return `Router ${name} added`
}

const unregisterLambda = (router, name) => {
  if (!name) throw new Error('You need to provide a route name')
  if (!router.route(name)) throw new Error(`Route ${name} not found, impossible to delete`)
  router.stack = router.stack.filter(layer => layer.name !== name)
  return `Route ${name} removed`
}

module.exports = ({ dev = true, lambdas = [], port = 3000, registerHanler = false, assets }) => {
  const server = new Koa()
  const router = new Router()

  server.use(logger())
  server.use(bodyparser())
  if (assets) server.use(static(resolve(assets)))

  lambdas.map(lambda => resigsterLambda(router, lambda))
  if (registerHanler && !dev) {
    router.post('register', '/_register', async (ctx, next) => {
      const { route, host, method, name } = ctx.request.body
      try {
        const b = resigsterLambda(router, ctx.request.body)
        ctx.status = 200
        ctx.body = b
      } catch (e) {
        ctx.statut = 500
        ctx.body = e.message
      }
    })

    router.del('unregister', '/_unregister', (ctx, next) => {
      const { name } = ctx.request.body
      try {
        const b = unregisterLambda(router, name)
        ctx.status = 200
        ctx.body = b
      } catch (e) {
        ctx.status = 500
        ctx.body = e.message
      }
    })
  }
  server.use(router.routes())
  server.use(router.allowedMethods())
  server.listen(process.env.PORT || port || 3000, () =>
    console.log(`${dev ? 'dev' : 'prod'} server ready on port ${process.env.PORT || port || 3000}`),
  )

  return {
    register: body => resigsterLambda(router, body),
    unregister: name => unregisterLambda(router, name),
  }
}

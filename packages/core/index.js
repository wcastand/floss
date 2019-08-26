require('dotenv').config()
const fs = require('fs')
const React = require('react')
const chalk = require('chalk')
const babelcore = require('@babel/core')
const { resolve, join, relative } = require('path')
const Readable = require('stream').Readable
const { renderToString } = require('react-dom/server')

const { rollup, watch } = require('rollup')
const del = require('rollup-plugin-delete')
const babel = require('rollup-plugin-babel')
const commonjs = require('rollup-plugin-commonjs')
const noderesolve = require('rollup-plugin-node-resolve')

const Koa = require('koa')
const proxy = require('koa-proxy')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')
const Router = require('koa-router')

const { preaddir, isPortTaken } = require('./utils')
const { htmlTemplate } = require('./ssr')

const createConfig = (path, outputPath) => ({
  input: path,
  plugins: [
    del({ targets: outputPath }),
    noderesolve(),
    babel({
      runtimeHelpers: true,
      exclude: 'node_modules/**',
      presets: [['@babel/env', { modules: false }], '@babel/preset-react'],
    }),
    commonjs({ include: 'node_modules/**' }),
  ],
  external: ['react', 'prop-types'],
})

const bundleFactory = (rootPath, outputdir, mode = 'dev') => async ({ path, name }) => {
  const finalPath = path
    .replace(rootPath, '')
    .split('.')[0]
    .split('/')
    .filter(f => f !== 'index')
    .join('/')
  const outputPath = name.includes('.jsx')
    ? resolve(outputdir, name).replace('.jsx', '.js')
    : resolve(outputdir, name)
  let config = createConfig(path, outputPath)
  if (name.includes('.jsx')) {
    config = {
      ...config,
      input: 'root',
      plugins: [
        {
          resolveId: id => (id === 'root' ? id : null),
          load: id =>
            id === 'root'
              ? Promise.resolve(`
          const { hydrate } = ReactDOM
          import App from './${relative(process.cwd(), path)}'
          const app = document.getElementById('app')
          hydrate(React.createElement(App, {}), app)
          `)
              : null,
        },
        ...config.plugins,
      ],
    }
  }
  const outputConfig = {
    output: {
      file: outputPath,
      format: name.includes('.jsx') ? 'iife' : 'cjs',
      name: 'bundle',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
      },
    },
  }

  switch (mode) {
    case 'dev': {
      const watcher = await watch({
        ...config,
        ...outputConfig,
        watch: {
          chokidar: { ignoreInitial: true },
        },
      })
      return [outputPath, finalPath || '/', watcher, path]
    }
    case 'start': {
      const bundle = await rollup(config)
      await bundle.write(outputConfig)
      return [outputPath, finalPath || '/', null, null]
    }
    case 'build': {
      const bundle = await rollup(config)
      await bundle.write(outputConfig)
      return [outputPath, finalPath || '/', null, null]
    }
  }
}

const createLambda = (createBundle, router) => async lambdaPath => {
  let tlambda
  const { name } = lambdaPath
  const [handlerPath, route, watcher] = await createBundle(lambdaPath)

  let lport = Math.floor(Math.random() * 10000 + 1)
  while (await isPortTaken(lport)) lport = Math.floor(Math.random() * 10000 + 1)
  return new Promise(resolve => {
    if (watcher)
      watcher.on('event', async event => {
        if (event.code === 'BUNDLE_END') {
          if (tlambda) tlambda.close()
          const lambda = new Koa()
          lambda.use(bodyparser())

          if (name.includes('.jsx')) {
            // const ssr = renderToString(
            //   React.createElement(require(handlerPath)(React), { context: {} }),
            // )

            lambda.use(ctx => {
              ctx.body = `
              <!DOCTYPE html>
              <html>
              <head>
                  <meta charset="utf-8">
                  <title>React SSR</title>
                  <script crossorigin src="https://unpkg.com/react@16/umd/react.production.min.js"></script>
                  <script crossorigin src="https://unpkg.com/react-dom@16/umd/react-dom.production.min.js"></script>
              </head>
              <body>
                  <div id="app"></div>
                  <script src="${`${route}/bundle.js`}"></script>
              </body>
              </html>
              `
              // ctx.body = htmlTemplate(mod, ssr)
            })

            if (!router.route(route || '/')) {
              router.get(
                route,
                route || '/',
                proxy({
                  url: `http://localhost:${lport}`,
                }),
              )
              router.get(
                `${route}/bundle.js`,
                ctx => (ctx.body = fs.readFileSync(handlerPath.replace(name, 'bundle.js'))),
              )
            }
            const isFirst = !!tlambda
            tlambda = lambda.listen(lport, () => {
              if (isFirst)
                console.log(chalk.green('[RELOAD] '), chalk.blue(`[GET]`), `${route || '/'}`)
              else {
                console.log('')
                console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
                console.log(chalk.green('[NEW ROUTE] '), chalk.blue(`[GET]`), `${route || '/'}`)
              }
              resolve(tlambda)
            })
          } else {
            delete require.cache[require.resolve(handlerPath)]
            const mod = require(handlerPath)
            const method = (mod.method || 'get').toUpperCase()

            if (mod.handler) lambda.use(mod.handler)
            const registeredR = router.route(route || '/')
            if (!!registeredR && !registeredR.methods.includes(method))
              router.stack = router.stack.filter(layer => layer.name !== (route || '/'))
            if (!router.route(route || '/'))
              router[method.toLowerCase()](
                route,
                route || '/',
                proxy({
                  url: `http://localhost:${lport}`,
                }),
              )

            const isFirst = !!tlambda
            tlambda = lambda.listen(lport, () => {
              if (isFirst)
                console.log(chalk.green('[RELOAD] '), chalk.blue(`[${method}]`), `${route || '/'}`)
              else {
                console.log('')
                console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
                console.log(
                  chalk.green('[NEW ROUTE] '),
                  chalk.blue(`[${method}]`),
                  `${route || '/'}`,
                )
              }
              resolve(tlambda)
            })
          }
        }
        // event.code can be one of:
        //   START        — the watcher is (re)starting
        //   BUNDLE_START — building an individual bundle
        //   BUNDLE_END   — finished building a bundle
        //   END          — finished building all bundles
        //   ERROR        — encountered an error while bundling
        //   FATAL        — encountered an unrecoverable error
      })
    else {
      const mod = require(handlerPath)
      const lambda = new Koa()
      lambda.use(bodyparser())
      if (mod.handler) lambda.use(mod.handler)

      router[mod.method || 'get'](
        route,
        route || '/',
        proxy({
          url: `http://localhost:${lport}`,
        }),
      )
      tlambda = lambda.listen(lport, () => {
        console.log('')
        console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
        console.log(
          chalk.green('[NEW ROUTE] '),
          chalk.blue(`[${mod.method || 'GET'}]`),
          `${route || '/'}`,
        )
        resolve(tlambda)
      })
    }
  })
}

module.exports = (
  root = resolve('lambda'),
  outputdir = resolve('dist'),
  port = process.env.PORT || 3000,
) => {
  const devdir = resolve('.floss')
  const lambdasPath = preaddir(root)
  const app = new Koa()
  const router = new Router()

  app.use(logger())
  app.use(router.routes())
  app.use(router.allowedMethods())
  return {
    start: () => {
      console.log(chalk.blue(Array.from(Array(45)).join('#')))
      console.log(chalk.blue(`### Floss is starting in production mode ###`))
      console.log(chalk.blue(Array.from(Array(45)).join('#')))

      if (!fs.existsSync(outputdir)) fs.mkdirSync(outputdir)
      const createBundle = bundleFactory(root, outputdir, 'start')
      const lambdas = lambdasPath.map(createLambda(createBundle, router))

      return app.listen(port, () => {
        console.log('')
        console.log(
          chalk.yellow.bold('[INFO]'),
          `Build finished in ${chalk.bold(relative(process.cwd(), outputdir))}`,
        )
        console.log(chalk.yellow.bold('[INFO]'), `Server running on port ${chalk.bold(port)}`)
      })
    },
    build: () => {
      console.log(chalk.blue(Array.from(Array(45)).join('#')))
      console.log(chalk.blue(`### Floss is building in production mode ###`))
      console.log(chalk.blue(Array.from(Array(45)).join('#')))

      if (!fs.existsSync(outputdir)) fs.mkdirSync(outputdir)
      const createBundle = bundleFactory(root, outputdir, 'build')
      return Promise.all(lambdasPath.map(async lambdaPath => await createBundle(lambdaPath))).then(
        lambdas => {
          console.log(
            chalk.yellow.bold('[INFO]'),
            `Build finished in ${chalk.bold(relative(process.cwd(), outputdir))}`,
          )
          return lambdas
        },
      )
    },
    dev: () => {
      console.log(chalk.blue(Array.from(Array(46)).join('#')))
      console.log(chalk.blue(`### Floss is starting in development mode ###`))
      console.log(chalk.blue(Array.from(Array(46)).join('#')))

      if (!fs.existsSync(devdir)) fs.mkdirSync(devdir)
      const createBundle = bundleFactory(root, devdir, 'dev')
      const lambdas = lambdasPath.map(createLambda(createBundle, router))

      return app.listen(port, () => {
        console.log('')
        console.log(
          chalk.yellow.bold('[INFO]'),
          `Building in ${chalk.bold(relative(process.cwd(), devdir))}`,
        )
        console.log(chalk.yellow.bold('[INFO]'), `Server running on port ${chalk.bold(port)}`)
      })
    },
  }
}

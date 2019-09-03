require('dotenv').config()
const fs = require('fs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const uuid = require('uuid/v4')
const chalk = require('chalk')
const { resolve, join, relative, parse } = require('path')

const { rollup, watch } = require('rollup')
const del = require('rollup-plugin-delete')
const babel = require('rollup-plugin-babel')
const commonjs = require('rollup-plugin-commonjs')
const noderesolve = require('rollup-plugin-node-resolve')
const { terser } = require('rollup-plugin-terser')

const Koa = require('koa')
const bodyparser = require('koa-bodyparser')

const { isPortTaken, transformModule } = require('@floss/utils')

const createConfig = ({ dev = process.env.NODE_ENV === 'development', path, outputPath }) => ({
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
    dev && del({ targets: outputPath }),
    noderesolve(),
    babel({
      runtimeHelpers: true,
      exclude: 'node_modules/**',
      presets: [['@babel/env', { modules: false }], '@babel/preset-react'],
    }),
    commonjs({ include: 'node_modules/**' }),
    !dev &&
      terser({
        toplevel: true,
        compress: true,
        output: { comments: dev },
        sourcemap: true,
      }),
  ],
  external: ['react', 'prop-types'],
})

module.exports.dev = async lambdaPath => {
  if (!fs.existsSync(resolve('.floss'))) fs.mkdirSync(resolve('.floss'))

  const name = parse(lambdaPath).name
  const n = `${name}.js`
  const outputPath = resolve(join('.floss', `/${n}`))
  const handlerPath = resolve(lambdaPath)
  const config = createConfig({ dev: true, path: handlerPath, outputPath })
  const outputConfig = {
    output: {
      file: outputPath,
      format: 'iife',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
      },
    },
  }

  let tlambda
  let lport = Math.floor(Math.random() * 10000 + 1)
  while (await isPortTaken(lport)) lport = Math.floor(Math.random() * 10000 + 1)
  const watcher = await watch({
    ...config,
    ...outputConfig,
    watch: {
      chokidar: { ignoreInitial: true },
    },
  })
  return new Promise((resolve, reject) => {
    watcher.on('event', async event => {
      if (event.code === 'BUNDLE_END') {
        if (tlambda) tlambda.close()

        const lambda = new Koa()
        lambda.use(bodyparser())
        const code = fs.readFileSync(outputPath, 'utf-8')

        const codd = transformModule(handlerPath).default
        const str = ReactDOMServer.renderToString(React.createElement(codd, {}))

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
                  <div id="app">${str}</div>
                  <script>
                    ${code}
                  </script>
              </body>
              </html>
              `
        })

        tlambda = lambda.listen(lport, () => {
          console.log('')
          console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
          resolve([name.replace('.js', ''), 'GET', lport])
        })
      }
    })
  })
}

module.exports.start = async lambdaPath => {
  const handlerPath = resolve(lambdaPath)
  const config = createConfig({ dev: false, path: handlerPath })
  let lport = Math.floor(Math.random() * 10000 + 1)
  while (await isPortTaken(lport)) lport = Math.floor(Math.random() * 10000 + 1)
  const outputConfig = {
    output: {
      file: 'unused',
      format: 'iife',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
      },
    },
  }
  const builder = await rollup(config)
  const {
    output: [{ code }],
  } = await builder.generate(outputConfig)

  const codd = transformModule(handlerPath).default
  const str = ReactDOMServer.renderToString(React.createElement(codd, {}))

  const lambda = new Koa()
  lambda.use(bodyparser())
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
                  <div id="app">${str}</div>
                  <script>
                    ${code}
                  </script>
              </body>
              </html>
              `
  })

  return new Promise((resolve, reject) => {
    lambda.listen(lport, () => {
      console.log('')
      console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
      resolve([parse(lambdaPath).name, 'GET', lport])
    })
  })
}

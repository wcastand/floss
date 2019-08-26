require('dotenv').config()
const fs = require('fs')
const uuid = require('uuid/v4')
const chalk = require('chalk')
const { resolve, join, relative } = require('path')

const { rollup, watch } = require('rollup')
const del = require('rollup-plugin-delete')
const babel = require('rollup-plugin-babel')
const commonjs = require('rollup-plugin-commonjs')
const noderesolve = require('rollup-plugin-node-resolve')

const Koa = require('koa')
const bodyparser = require('koa-bodyparser')

const { isPortTaken } = require('@floss/utils')

const createConfig = (path, outputPath) => ({
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

module.exports = async lambdaPath => {
  if (!fs.existsSync(resolve('.floss'))) fs.mkdirSync(resolve('.floss'))

  const name = `${uuid()}.js`
  const outputPath = resolve(join('.floss', `/${name}`))
  const handlerPath = resolve(lambdaPath)
  const config = createConfig(handlerPath, resolve('.floss'))
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
          resolve([name.replace('.js', ''), lport])
        })
      }
    })
  })
}

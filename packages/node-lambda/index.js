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

module.exports = async lambdaPath => {
  if (!fs.existsSync(resolve('.floss'))) fs.mkdirSync(resolve('.floss'))

  const name = `${uuid()}.js`
  const outputPath = resolve(join('.floss', `/${name}`))
  const handlerPath = resolve(lambdaPath)
  const config = createConfig(handlerPath, resolve('.floss'))
  const outputConfig = {
    output: {
      file: outputPath,
      format: 'cjs',
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

        delete require.cache[require.resolve(outputPath)]
        const mod = require(outputPath)
        const method = (mod.method || 'get').toUpperCase()

        if (mod.handler) lambda.use(mod.handler)
        tlambda = lambda.listen(lport, () => {
          console.log('')
          console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
          resolve([name.replace('.js', ''), lport])
        })
      }
    })
  })
}

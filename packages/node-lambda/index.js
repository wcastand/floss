require('dotenv').config()
const fs = require('fs')
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
  input: path,
  plugins: [
    dev && del({ targets: outputPath }),
    noderesolve(),
    babel({
      runtimeHelpers: true,
      exclude: 'node_modules/**',
      presets: [['@babel/env', { modules: false }]],
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
          resolve([name.replace('.js', ''), method, lport])
        })
      }
    })
  })
}

module.exports.start = async lambdaPath => {
  const handlerPath = resolve(lambdaPath)
  const config = createConfig({ dev: false, path: handlerPath })
  const outputConfig = {
    output: {
      file: 'unused',
      format: 'cjs',
    },
  }
  let lport = Math.floor(Math.random() * 10000 + 1)
  while (await isPortTaken(lport)) lport = Math.floor(Math.random() * 10000 + 1)

  const bundle = await rollup(config)
  const {
    output: [{ code }],
  } = await bundle.generate(outputConfig)

  const lambda = new Koa()
  lambda.use(bodyparser())

  const mod = transformModule(handlerPath)
  const method = (mod.method || 'get').toUpperCase()

  if (mod.handler) lambda.use(mod.handler)
  return new Promise((resolve, reject) => {
    lambda.listen(lport, () => {
      console.log('')
      console.log(chalk.green('[NEW LAMBDA]'), chalk.blue('[PORT]'), `${lport}`)
      resolve([parse(lambdaPath).name, method, lport])
    })
  })
}

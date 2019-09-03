const net = require('net')
const fs = require('fs')
const babel = require('@babel/core')

const ext = (module, file) => {
  const fileValue = fs.readFileSync(file, 'utf8')
  if (file.includes('node_modules')) return module._compile(fileValue, file)

  const transformed = babel.transformSync(fileValue, {
    presets: [['@babel/preset-env', { useBuiltIns: 'entry', corejs: 3 }], '@babel/preset-react'],
    plugins: ['@babel/plugin-transform-runtime'],
  })
  return module._compile(transformed.code, file)
}

module.exports.flatten = arr => Array.prototype.concat.apply([], arr)
module.exports.isPortTaken = port =>
  new Promise((resolve, reject) => {
    const tester = net
      .createServer()
      .once('error', err => {
        console.log(err)
        resolve(err.code === 'EADDRINUSE')
      })
      .once('listening', () => {
        tester.once('close', () => resolve(false)).close()
      })
      .listen(port)
  })

module.exports.transformModule = path => {
  const oldExt = require.extensions['.js']
  require.extensions['.js'] = ext
  const fn = require(path)
  require.extensions['.js'] = oldExt
  return fn
}

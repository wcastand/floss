const fs = require('fs')
const net = require('net')
const { join } = require('path')

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
const fileTree = dirpath => file => {
  if (file.isFile())
    return {
      name: file.name,
      path: join(dirpath, file.name),
    }
  const ndir = join(dirpath, file.name)
  return preaddir(ndir)
}
module.exports.preaddir = dirpath => {
  try {
    const files = fs.readdirSync(dirpath, { withFileTypes: true })
    return files.map(fileTree(dirpath))
  } catch (e) {
    console.log(e)
    throw new Error('error')
  }
}

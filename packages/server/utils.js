const net = require('net')

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
